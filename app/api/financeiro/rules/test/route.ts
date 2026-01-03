/**
 * Rule Test API
 * 
 * Test a rule against sample payment data without saving
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    RulesEngine,
    validateRule,
    type CreateRulePayload,
    type PaymentInput,
    type AutoRule,
    normalizeMarketplaces,
} from '@/lib/rules';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { rule: rawRule, testPayments } = body as {
            rule: CreateRulePayload & { marketplace?: string };
            testPayments: PaymentInput[];
        };
        const rule: CreateRulePayload = {
            ...rawRule,
            marketplaces: normalizeMarketplaces((rawRule as Record<string, unknown>).marketplaces as string[] | undefined ?? rawRule.marketplace),
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

        if (!testPayments || testPayments.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Nenhum pagamento de teste fornecido',
            }, { status: 400 });
        }

        // Create a temporary rule with an ID for testing
        const testRule: AutoRule = {
            ...rule,
            id: 'test_rule',
            isSystemRule: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // Create engine with just this rule (no system rules for isolated testing)
        const engine = new RulesEngine([testRule]);
        const testMarketplace = 'all';

        // Test each payment
        const results = testPayments.map(payment => {
            const result = engine.process(payment, testMarketplace);
            const matchResult = result.matchedRules.find(r => r.ruleId === 'test_rule');

            return {
                payment: {
                    orderId: payment.marketplaceOrderId,
                    description: payment.transactionDescription,
                    type: payment.transactionType,
                    amount: payment.amount,
                },
                matched: matchResult?.matched || false,
                matchDetails: matchResult?.conditionResults || [],
                appliedTags: result.tags,
                isExpense: result.isExpense,
                skipped: result.skipped,
            };
        });

        const matchCount = results.filter(r => r.matched).length;

        return NextResponse.json({
            success: true,
            results,
            summary: {
                tested: testPayments.length,
                matched: matchCount,
                matchRate: `${Math.round((matchCount / testPayments.length) * 100)}%`,
            },
        });
    } catch (error) {
        console.error('[RuleTest] Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Erro ao testar regra',
        }, { status: 500 });
    }
}
