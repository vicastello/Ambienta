/**
 * Rule Audit Log API
 * 
 * Endpoints for viewing rule history and restoring previous versions
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface AuditLogEntry {
    id: string;
    rule_id: string;
    rule_name: string | null;
    action: 'created' | 'updated' | 'deleted' | 'enabled' | 'disabled' | 'metrics_updated';
    previous_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    changed_by: string | null;
    change_reason: string | null;
    changed_at: string;
}

/**
 * GET /api/financeiro/rules/audit
 * 
 * Get audit log entries for a rule or all rules
 * Query params:
 *   - ruleId: optional, filter by specific rule
 *   - limit: optional, max entries (default 50)
 *   - action: optional, filter by action type
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const ruleId = searchParams.get('ruleId');
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const action = searchParams.get('action');

        let query = supabaseAdmin
            .from('rule_audit_log')
            .select('*')
            .order('changed_at', { ascending: false })
            .limit(Math.min(limit, 200));

        if (ruleId) {
            query = query.eq('rule_id', ruleId);
        }

        if (action) {
            query = query.eq('action', action);
        }

        // Exclude metrics_updated for cleaner history view
        if (!action) {
            query = query.neq('action', 'metrics_updated');
        }

        const { data, error } = await query;

        if (error) {
            console.error('[RuleAudit] Error fetching audit log:', error);
            return NextResponse.json({
                success: false,
                error: 'Erro ao buscar histórico',
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            entries: data || [],
            count: (data || []).length,
        });
    } catch (error) {
        console.error('[RuleAudit] Unexpected error:', error);
        return NextResponse.json({
            success: false,
            error: 'Erro interno',
        }, { status: 500 });
    }
}

/**
 * POST /api/financeiro/rules/audit
 * 
 * Restore a rule to a previous version
 * Body:
 *   - auditId: ID of the audit log entry to restore from
 *   - useNewData: if true, restore to new_data; if false, restore to previous_data
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { auditId, useNewData = false } = body;

        if (!auditId) {
            return NextResponse.json({
                success: false,
                error: 'auditId é obrigatório',
            }, { status: 400 });
        }

        // Fetch the audit entry
        const { data: auditEntry, error: auditError } = await supabaseAdmin
            .from('rule_audit_log')
            .select('*')
            .eq('id', auditId)
            .single();

        if (auditError || !auditEntry) {
            return NextResponse.json({
                success: false,
                error: 'Entrada de auditoria não encontrada',
            }, { status: 404 });
        }

        const entry = auditEntry as AuditLogEntry;
        const dataToRestore = useNewData ? entry.new_data : entry.previous_data;

        if (!dataToRestore) {
            return NextResponse.json({
                success: false,
                error: 'Não há dados para restaurar nesta versão',
            }, { status: 400 });
        }

        // Check if the rule still exists
        const { data: existingRule } = await supabaseAdmin
            .from('auto_rules')
            .select('id')
            .eq('id', entry.rule_id)
            .single();

        if (entry.action === 'deleted' || !existingRule) {
            // Rule was deleted, recreate it
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, created_at: _createdAt, ...restoreData } = dataToRestore as Record<string, unknown>;

            const { error: insertError } = await supabaseAdmin
                .from('auto_rules')
                .insert({
                    ...restoreData,
                    id: entry.rule_id, // Keep original ID
                });

            if (insertError) {
                console.error('[RuleAudit] Error recreating rule:', insertError);
                return NextResponse.json({
                    success: false,
                    error: 'Erro ao recriar regra',
                }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                message: 'Regra recriada com sucesso',
                ruleId: entry.rule_id,
                action: 'recreated',
            });
        } else {
            // Rule exists, update it
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...restoreData } = dataToRestore as Record<string, unknown>;

            const { error: updateError } = await supabaseAdmin
                .from('auto_rules')
                .update({
                    ...restoreData,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', entry.rule_id);

            if (updateError) {
                console.error('[RuleAudit] Error restoring rule:', updateError);
                return NextResponse.json({
                    success: false,
                    error: 'Erro ao restaurar regra',
                }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                message: 'Regra restaurada com sucesso',
                ruleId: entry.rule_id,
                action: 'restored',
            });
        }
    } catch (error) {
        console.error('[RuleAudit] Unexpected error:', error);
        return NextResponse.json({
            success: false,
            error: 'Erro interno',
        }, { status: 500 });
    }
}
