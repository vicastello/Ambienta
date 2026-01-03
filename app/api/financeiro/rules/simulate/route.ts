/**
 * Rule Simulator API
 * 
 * Simulates a rule against historical payments without applying changes.
 * Returns match statistics and financial impact preview.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
    RulesEngine,
    validateRule,
    normalizeMarketplaces,
    type CreateRulePayload,
    type PaymentInput,
    type AutoRule,
} from '@/lib/rules';

interface SimulateRequest {
    rule: CreateRulePayload & { marketplace?: string };
    // Option 1: Provide specific payment IDs
    paymentIds?: string[];
    // Option 2: Query recent payments from a marketplace
    marketplace?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
}

interface SimulateResult {
    payment: {
        id: string;
        orderId: string;
        description: string;
        type: string;
        amount: number;
        date: string;
    };
    matched: boolean;
    matchDetails: Array<{
        field: string;
        operator: string;
        expectedValue: string | number;
        actualValue: string | number;
        matched: boolean;
    }>;
    appliedTags: string[];
    appliedActions: string[];
}

interface SimulateSummary {
    tested: number;
    matched: number;
    matchRate: string;
    totalImpact: number;
    avgImpactPerMatch: number;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as SimulateRequest;
        const { rule: rawRule, paymentIds, marketplace, limit = 100, dateFrom, dateTo } = body;

        // Normalize rule
        const rule: CreateRulePayload = {
            ...rawRule,
            marketplaces: normalizeMarketplaces(rawRule.marketplaces ?? rawRule.marketplace),
        };

        // Validate the rule
        const validation = validateRule(rule);
        if (!validation.valid) {
            return NextResponse.json({
                success: false,
                error: 'Regra inválida',
                validationErrors: validation.errors,
            }, { status: 400 });
        }

        // Build query to get payments
        let payments: PaymentInput[] = [];

        if (paymentIds && paymentIds.length > 0) {
            // Query specific payments by ID
            const { data, error } = await supabaseAdmin
                .from('cash_flow_entries')
                .select('id, marketplace_order_id, description, transaction_type, amount, payment_date')
                .in('id', paymentIds)
                .limit(200);

            if (error) {
                console.error('[RuleSimulator] Error fetching payments by ID:', error);
                return NextResponse.json({
                    success: false,
                    error: 'Erro ao buscar pagamentos',
                }, { status: 500 });
            }

            /* eslint-disable @typescript-eslint/no-explicit-any */
            payments = (data || []).map((row: any) => ({
                marketplaceOrderId: row.marketplace_order_id || row.id,
                transactionDescription: row.description || '',
                transactionType: row.transaction_type || '',
                amount: Number(row.amount) || 0,
                paymentDate: row.payment_date || new Date().toISOString(),
                _id: row.id,
            }));
        } else {
            // Query recent payments from marketplace
            let query = supabaseAdmin
                .from('cash_flow_entries')
                .select('id, marketplace_order_id, description, transaction_type, amount, payment_date, marketplace')
                .order('payment_date', { ascending: false })
                .limit(Math.min(limit, 200));

            if (marketplace && marketplace !== 'all') {
                query = query.eq('marketplace', marketplace);
            }

            if (dateFrom) {
                query = query.gte('payment_date', dateFrom);
            }

            if (dateTo) {
                query = query.lte('payment_date', dateTo);
            }

            const { data, error } = await query;

            if (error) {
                console.error('[RuleSimulator] Error fetching payments:', error);
                return NextResponse.json({
                    success: false,
                    error: 'Erro ao buscar pagamentos',
                }, { status: 500 });
            }

            payments = (data || []).map((row: any) => ({
                marketplaceOrderId: row.marketplace_order_id || row.id,
                transactionDescription: row.description || '',
                transactionType: row.transaction_type || '',
                amount: Number(row.amount) || 0,
                paymentDate: row.payment_date || new Date().toISOString(),
                _id: row.id,
            }));
        }

        if (payments.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Nenhum pagamento encontrado para simular',
            }, { status: 400 });
        }

        // Create a temporary rule with an ID for testing
        const testRule: AutoRule = {
            ...rule,
            id: 'simulate_rule',
            isSystemRule: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // Create engine with just this rule (no system rules for isolated testing)
        const engine = new RulesEngine([testRule]);
        const testMarketplace = marketplace || 'all';

        // Simulate each payment
        const results: SimulateResult[] = payments.map((payment: any) => {
            const result = engine.process(payment, testMarketplace);
            const matchResult = result.matchedRules.find(r => r.ruleId === 'simulate_rule');

            const appliedActions = matchResult?.matched
                ? matchResult.appliedActions.map(a => {
                    if (a.type === 'add_tags' && a.tags) return `Tags: ${a.tags.join(', ')}`;
                    if (a.type === 'set_type' && a.transactionType) return `Tipo: ${a.transactionType}`;
                    if (a.type === 'set_category' && a.category) return `Categoria: ${a.category}`;
                    if (a.type === 'mark_expense') return 'Marcar saída';
                    if (a.type === 'mark_income') return 'Marcar entrada';
                    if (a.type === 'skip') return 'Ignorar';
                    return a.type;
                })
                : [];

            return {
                payment: {
                    id: payment._id || payment.marketplaceOrderId,
                    orderId: payment.marketplaceOrderId,
                    description: payment.transactionDescription,
                    type: payment.transactionType,
                    amount: payment.amount,
                    date: payment.paymentDate,
                },
                matched: matchResult?.matched || false,
                matchDetails: matchResult?.conditionResults.map(r => ({
                    field: r.field,
                    operator: r.operator,
                    expectedValue: r.expectedValue,
                    actualValue: r.actualValue,
                    matched: r.matched,
                })) || [],
                appliedTags: result.tags,
                appliedActions,
            };
        });

        // Calculate summary
        const matchedResults = results.filter(r => r.matched);
        const matchCount = matchedResults.length;
        const totalImpact = matchedResults.reduce((sum, r) => sum + Math.abs(r.payment.amount), 0);

        const summary: SimulateSummary = {
            tested: payments.length,
            matched: matchCount,
            matchRate: `${Math.round((matchCount / payments.length) * 100)}%`,
            totalImpact,
            avgImpactPerMatch: matchCount > 0 ? totalImpact / matchCount : 0,
        };

        return NextResponse.json({
            success: true,
            results,
            summary,
        });
    } catch (error) {
        console.error('[RuleSimulator] Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Erro ao simular regra',
        }, { status: 500 });
    }
}
