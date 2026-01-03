/**
 * Reprocess Historical Payments API
 * 
 * Apply current rules to historical payments to update their tags/categorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { RulesEngine, getSystemRules, type AutoRule, type PaymentInput } from '@/lib/rules';

interface ReprocessRequest {
    // Filter criteria
    marketplace?: string;
    dateFrom?: string;
    dateTo?: string;
    paymentIds?: string[];
    // Options
    rulesOnly?: boolean;      // Only apply specific rules
    ruleIds?: string[];       // If rulesOnly, which rules to apply
    dryRun?: boolean;         // Preview without saving
    limit?: number;           // Max payments to process
}

interface ReprocessResult {
    paymentId: string;
    marketplaceOrderId: string;
    originalTags: string[];
    newTags: string[];
    matchedRules: string[];
    changed: boolean;
}

/**
 * POST /api/financeiro/rules/reprocess
 * 
 * Reprocess historical payments with current rules
 */
export async function POST(request: NextRequest) {
    try {
        const body: ReprocessRequest = await request.json();
        const {
            marketplace,
            dateFrom,
            dateTo,
            paymentIds,
            rulesOnly = false,
            ruleIds = [],
            dryRun = false,
            limit = 100,
        } = body;

        // Validate limit
        const maxLimit = Math.min(limit, 500);

        // 1. Build query for payments
        let query = supabaseAdmin
            .from('marketplace_payments')
            .select('id, marketplace, marketplace_order_id, transaction_description, transaction_type, net_amount, payment_date, tags')
            .order('payment_date', { ascending: false })
            .limit(maxLimit);

        if (paymentIds && paymentIds.length > 0) {
            query = query.in('id', paymentIds);
        } else {
            if (marketplace && marketplace !== 'all') {
                query = query.eq('marketplace', marketplace);
            }
            if (dateFrom) {
                query = query.gte('payment_date', dateFrom);
            }
            if (dateTo) {
                query = query.lte('payment_date', dateTo);
            }
        }

        const { data: payments, error: fetchError } = await query;

        if (fetchError) {
            console.error('[Reprocess] Error fetching payments:', fetchError);
            return NextResponse.json({
                success: false,
                error: 'Erro ao buscar pagamentos',
            }, { status: 500 });
        }

        if (!payments || payments.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'Nenhum pagamento encontrado para reprocessar',
                results: [],
                summary: { processed: 0, changed: 0, unchanged: 0 },
            });
        }

        // 2. Load rules
        let rules: AutoRule[] = [];

        // Get system rules
        const systemRules = getSystemRules();

        // Get user rules
        const { data: userRulesData } = await supabaseAdmin
            .from('auto_rules')
            .select('*')
            .eq('enabled', true)
            .order('priority', { ascending: false });

        const userRules: AutoRule[] = (userRulesData || []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: row.name as string,
            description: row.description as string | undefined,
            marketplaces: (row.marketplaces as string[]) || [],
            conditions: (row.conditions as AutoRule['conditions']) || [],
            conditionLogic: (row.condition_logic as AutoRule['conditionLogic']) || 'AND',
            actions: (row.actions as AutoRule['actions']) || [],
            priority: (row.priority as number) || 0,
            enabled: row.enabled as boolean,
            stopOnMatch: row.stop_on_match as boolean,
            isSystemRule: false,
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string,
        }));

        if (rulesOnly && ruleIds.length > 0) {
            // Only apply specific rules
            rules = [...systemRules, ...userRules].filter(r => ruleIds.includes(r.id));
        } else {
            // Apply all enabled rules
            rules = [...systemRules, ...userRules];
        }

        if (rules.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Nenhuma regra disponível para aplicar',
            }, { status: 400 });
        }

        // 3. Process each payment
        const results: ReprocessResult[] = [];
        const metricsToUpdate = new Map<string, { count: number; impact: number }>();

        for (const payment of payments) {
            const paymentInput: PaymentInput = {
                marketplaceOrderId: payment.marketplace_order_id,
                transactionDescription: payment.transaction_description || '',
                transactionType: payment.transaction_type || '',
                amount: payment.net_amount || 0,
                paymentDate: payment.payment_date || '',
            };

            // Create engine for this payment's marketplace
            const engine = new RulesEngine(
                rules.filter(r =>
                    r.marketplaces.includes('all') ||
                    r.marketplaces.includes(payment.marketplace)
                )
            );

            const engineResult = engine.process(paymentInput);
            const originalTags = (payment.tags as string[]) || [];
            const newTags = engineResult.tags;

            // Check if anything changed
            const tagsChanged =
                newTags.length !== originalTags.length ||
                !newTags.every(t => originalTags.includes(t)) ||
                !originalTags.every(t => newTags.includes(t));

            const matchedRuleNames = engineResult.matchedRules
                .filter(mr => mr.matched)
                .map(mr => mr.ruleName);

            const result: ReprocessResult = {
                paymentId: payment.id,
                marketplaceOrderId: payment.marketplace_order_id,
                originalTags,
                newTags,
                matchedRules: matchedRuleNames,
                changed: tagsChanged,
            };

            results.push(result);

            // Track metrics for matched rules
            for (const mr of engineResult.matchedRules) {
                if (mr.matched && !mr.ruleId.startsWith('system_')) {
                    const existing = metricsToUpdate.get(mr.ruleId) || { count: 0, impact: 0 };
                    existing.count += 1;
                    existing.impact += Math.abs(payment.net_amount || 0);
                    metricsToUpdate.set(mr.ruleId, existing);
                }
            }

            // 4. Save changes if not dry run and tags changed
            if (!dryRun && tagsChanged) {
                const updatePayload: Record<string, unknown> = {
                    tags: newTags,
                };

                if (engineResult.transactionType) {
                    updatePayload.transaction_type = engineResult.transactionType;
                }
                if (engineResult.isExpense) {
                    updatePayload.is_expense = true;
                }
                if (engineResult.isIncome) {
                    updatePayload.is_expense = false;
                }
                if (engineResult.category) {
                    updatePayload.expense_category = engineResult.category;
                }

                await supabaseAdmin
                    .from('marketplace_payments')
                    .update(updatePayload)
                    .eq('id', payment.id);
            }
        }

        // 5. Update rule metrics if not dry run
        if (!dryRun && metricsToUpdate.size > 0) {
            const now = new Date().toISOString();
            for (const [ruleId, metrics] of metricsToUpdate) {
                try {
                    const { data: existingRule } = await supabaseAdmin
                        .from('auto_rules')
                        .select('match_count, total_impact')
                        .eq('id', ruleId)
                        .single();

                    if (existingRule) {
                        await supabaseAdmin
                            .from('auto_rules')
                            .update({
                                match_count: (existingRule.match_count || 0) + metrics.count,
                                total_impact: (existingRule.total_impact || 0) + metrics.impact,
                                last_applied_at: now,
                            })
                            .eq('id', ruleId);
                    }
                } catch (e) {
                    console.warn(`[Reprocess] Failed to update metrics for ${ruleId}:`, e);
                }
            }
        }

        // 6. Build summary
        const changed = results.filter(r => r.changed).length;
        const summary = {
            processed: results.length,
            changed,
            unchanged: results.length - changed,
            rulesApplied: rules.length,
            dryRun,
        };

        console.log(`[Reprocess] Completed: ${summary.processed} processed, ${summary.changed} changed, dryRun=${dryRun}`);

        return NextResponse.json({
            success: true,
            results,
            summary,
        });

    } catch (error) {
        console.error('[Reprocess] Unexpected error:', error);
        return NextResponse.json({
            success: false,
            error: 'Erro interno',
        }, { status: 500 });
    }
}
