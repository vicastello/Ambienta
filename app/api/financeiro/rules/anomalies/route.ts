/**
 * Rule Anomaly Detection API
 * 
 * Analyzes rule performance to detect unusual patterns
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface RuleStats {
    ruleId: string;
    ruleName: string;
    matchCount: number;
    totalImpact: number;
    lastAppliedAt: string | null;
    createdAt: string;
}

interface AnomalyAlert {
    ruleId: string;
    ruleName: string;
    type: 'high_frequency' | 'low_frequency' | 'high_impact' | 'dormant' | 'spike';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    details: Record<string, unknown>;
}

/**
 * GET /api/financeiro/rules/anomalies
 * 
 * Analyze rules and return detected anomalies
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const daysBack = parseInt(searchParams.get('days') || '30', 10);

        // Fetch all enabled rules with metrics
        const { data: rules, error: rulesError } = await supabaseAdmin
            .from('auto_rules' as any)
            .select('id, name, match_count, total_impact, last_applied_at, created_at, enabled')
            .eq('enabled', true)
            .order('match_count', { ascending: false });

        if (rulesError) {
            console.error('[Anomalies] Error fetching rules:', rulesError);
            return NextResponse.json({
                success: false,
                error: 'Erro ao buscar regras',
            }, { status: 500 });
        }

        if (!rules || rules.length === 0) {
            return NextResponse.json({
                success: true,
                alerts: [],
                summary: { total: 0, byType: {}, bySeverity: {} },
            });
        }

        const alerts: AnomalyAlert[] = [];
        const now = new Date();
        // Note: daysBack is used in dormant rule detection below

        // Calculate averages
        const matchCounts = rules.map((r: any) => r.match_count || 0);
        const avgMatch = matchCounts.reduce((a, b) => a + b, 0) / rules.length;
        const impacts = rules.map((r: any) => r.total_impact || 0);
        const avgImpact = impacts.reduce((a, b) => a + b, 0) / rules.length;

        // Standard deviation for match counts
        const matchVariance = matchCounts.reduce((sum, val) => sum + Math.pow(val - avgMatch, 2), 0) / rules.length;
        const matchStdDev = Math.sqrt(matchVariance);

        for (const rule of (rules as any[])) {
            const stats: RuleStats = {
                ruleId: rule.id,
                ruleName: rule.name,
                matchCount: rule.match_count || 0,
                totalImpact: rule.total_impact || 0,
                lastAppliedAt: rule.last_applied_at,
                createdAt: rule.created_at,
            };

            const ruleAge = (now.getTime() - new Date(stats.createdAt).getTime()) / (24 * 60 * 60 * 1000);
            const lastApplied = stats.lastAppliedAt ? new Date(stats.lastAppliedAt) : null;
            const daysSinceApplied = lastApplied
                ? (now.getTime() - lastApplied.getTime()) / (24 * 60 * 60 * 1000)
                : ruleAge;

            // 1. High Frequency: Match count > 2 standard deviations above average
            if (stats.matchCount > avgMatch + 2 * matchStdDev && avgMatch > 0) {
                const multiplier = Math.round(stats.matchCount / avgMatch);
                alerts.push({
                    ruleId: stats.ruleId,
                    ruleName: stats.ruleName,
                    type: 'high_frequency',
                    severity: multiplier > 5 ? 'warning' : 'info',
                    message: `Esta regra bateu ${multiplier}x mais que a média`,
                    details: {
                        matchCount: stats.matchCount,
                        average: Math.round(avgMatch),
                        multiplier,
                    },
                });
            }

            // 2. Dormant Rule: No matches in last N days despite being old enough
            if (ruleAge > 7 && daysSinceApplied > daysBack) {
                alerts.push({
                    ruleId: stats.ruleId,
                    ruleName: stats.ruleName,
                    type: 'dormant',
                    severity: ruleAge > 30 ? 'warning' : 'info',
                    message: `Regra não aplicada há ${Math.round(daysSinceApplied)} dias`,
                    details: {
                        daysSinceApplied: Math.round(daysSinceApplied),
                        ruleAgeDays: Math.round(ruleAge),
                        lastAppliedAt: stats.lastAppliedAt,
                    },
                });
            }

            // 3. High Impact: Single rule responsible for > 30% of total impact
            const totalImpactAll = impacts.reduce((a, b) => a + b, 0);
            if (totalImpactAll > 0 && stats.totalImpact > totalImpactAll * 0.3) {
                const percentage = Math.round((stats.totalImpact / totalImpactAll) * 100);
                alerts.push({
                    ruleId: stats.ruleId,
                    ruleName: stats.ruleName,
                    type: 'high_impact',
                    severity: percentage > 50 ? 'warning' : 'info',
                    message: `Esta regra representa ${percentage}% do impacto financeiro total`,
                    details: {
                        impact: stats.totalImpact,
                        totalImpact: totalImpactAll,
                        percentage,
                    },
                });
            }

            // 4. Low Frequency: Old rule with very few matches
            if (ruleAge > 14 && stats.matchCount < 3 && stats.matchCount > 0) {
                alerts.push({
                    ruleId: stats.ruleId,
                    ruleName: stats.ruleName,
                    type: 'low_frequency',
                    severity: 'info',
                    message: `Regra de ${Math.round(ruleAge)} dias com apenas ${stats.matchCount} match(es)`,
                    details: {
                        matchCount: stats.matchCount,
                        ruleAgeDays: Math.round(ruleAge),
                        matchesPerDay: (stats.matchCount / ruleAge).toFixed(3),
                    },
                });
            }
        }

        // Build summary
        const byType: Record<string, number> = {};
        const bySeverity: Record<string, number> = {};
        for (const alert of alerts) {
            byType[alert.type] = (byType[alert.type] || 0) + 1;
            bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
        }

        return NextResponse.json({
            success: true,
            alerts,
            summary: {
                total: alerts.length,
                byType,
                bySeverity,
            },
            stats: {
                totalRules: rules.length,
                avgMatchCount: Math.round(avgMatch),
                avgImpact: Math.round(avgImpact),
                analyzedDays: daysBack,
            },
        });

    } catch (error) {
        console.error('[Anomalies] Unexpected error:', error);
        return NextResponse.json({
            success: false,
            error: 'Erro interno',
        }, { status: 500 });
    }
}
