/**
 * Auto Rules API
 * 
 * Professional CRUD endpoints for the new rules engine
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
    validateRule,
    sanitizeRule,
    isSystemRule,
    getSystemRules,
    type AutoRule,
    type CreateRulePayload,
} from '@/lib/rules';

/**
 * Convert database row to AutoRule type
 */
function dbRowToRule(row: any): AutoRule {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        marketplace: row.marketplace,
        conditions: row.conditions || [],
        conditionLogic: row.condition_logic || 'AND',
        actions: row.actions || [],
        priority: row.priority,
        enabled: row.enabled,
        stopOnMatch: row.stop_on_match,
        isSystemRule: row.is_system_rule,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/**
 * Convert AutoRule to database row format
 */
function ruleToDbRow(rule: CreateRulePayload): any {
    return {
        name: rule.name,
        description: rule.description,
        marketplace: rule.marketplace,
        conditions: rule.conditions,
        condition_logic: rule.conditionLogic,
        actions: rule.actions,
        priority: rule.priority,
        enabled: rule.enabled,
        stop_on_match: rule.stopOnMatch,
        is_system_rule: false,
    };
}

// ============================================================================
// GET - List all rules
// ============================================================================
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const marketplace = searchParams.get('marketplace');
        const enabledOnly = searchParams.get('enabled') === 'true';

        let query = (supabaseAdmin as any)
            .from('auto_rules')
            .select('*')
            .order('priority', { ascending: false });

        if (marketplace && marketplace !== 'all') {
            query = query.or(`marketplace.eq.${marketplace},marketplace.eq.all`);
        }

        if (enabledOnly) {
            query = query.eq('enabled', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[AutoRules] Error fetching rules:', error);
            return NextResponse.json(
                { success: false, error: 'Erro ao buscar regras' },
                { status: 500 }
            );
        }

        const dbRules = (data || []).map(dbRowToRule);

        // Merge database rules with system rules
        const systemRules = getSystemRules();
        const allRules = [...dbRules, ...systemRules].sort((a, b) => b.priority - a.priority);

        return NextResponse.json({
            success: true,
            rules: allRules,
            count: allRules.length,
            dbCount: dbRules.length,
            systemCount: systemRules.length,
        });
    } catch (error) {
        console.error('[AutoRules] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: 'Erro interno' },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST - Create new rule
// ============================================================================
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const rulePayload = body as CreateRulePayload;

        // Validate
        const validation = validateRule(rulePayload);
        if (!validation.valid) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Validação falhou',
                    validationErrors: validation.errors,
                },
                { status: 400 }
            );
        }

        // Sanitize
        const sanitized = sanitizeRule(rulePayload);
        const dbRow = ruleToDbRow(sanitized);

        // Insert
        const { data, error } = await (supabaseAdmin as any)
            .from('auto_rules')
            .insert(dbRow)
            .select()
            .single();

        if (error) {
            console.error('[AutoRules] Error creating rule:', error);
            return NextResponse.json(
                { success: false, error: 'Erro ao criar regra' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            rule: dbRowToRule(data),
        });
    } catch (error) {
        console.error('[AutoRules] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: 'Erro interno' },
            { status: 500 }
        );
    }
}

// ============================================================================
// PATCH - Update rule
// ============================================================================
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID da regra obrigatório' },
                { status: 400 }
            );
        }

        // Check if it's a system rule
        if (isSystemRule(id)) {
            // System rules can only toggle enabled status
            const allowedUpdates = { enabled: updates.enabled };
            if (Object.keys(updates).some(k => k !== 'enabled')) {
                return NextResponse.json(
                    { success: false, error: 'Regras do sistema só podem ser ativadas/desativadas' },
                    { status: 403 }
                );
            }
        }

        // Build update object
        const updateData: any = {};
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.marketplace !== undefined) updateData.marketplace = updates.marketplace;
        if (updates.conditions !== undefined) updateData.conditions = updates.conditions;
        if (updates.conditionLogic !== undefined) updateData.condition_logic = updates.conditionLogic;
        if (updates.actions !== undefined) updateData.actions = updates.actions;
        if (updates.priority !== undefined) updateData.priority = updates.priority;
        if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
        if (updates.stopOnMatch !== undefined) updateData.stop_on_match = updates.stopOnMatch;

        const { data, error } = await (supabaseAdmin as any)
            .from('auto_rules')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[AutoRules] Error updating rule:', error);
            return NextResponse.json(
                { success: false, error: 'Erro ao atualizar regra' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            rule: dbRowToRule(data),
        });
    } catch (error) {
        console.error('[AutoRules] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: 'Erro interno' },
            { status: 500 }
        );
    }
}

// ============================================================================
// DELETE - Remove rule
// ============================================================================
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID da regra obrigatório' },
                { status: 400 }
            );
        }

        // Check if it's a system rule
        if (isSystemRule(id)) {
            return NextResponse.json(
                { success: false, error: 'Regras do sistema não podem ser deletadas' },
                { status: 403 }
            );
        }

        const { error } = await (supabaseAdmin as any)
            .from('auto_rules')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[AutoRules] Error deleting rule:', error);
            return NextResponse.json(
                { success: false, error: 'Erro ao deletar regra' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[AutoRules] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: 'Erro interno' },
            { status: 500 }
        );
    }
}
