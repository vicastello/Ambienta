'use client';

import { useState, useMemo } from 'react';
import { ArrowDown, ArrowUpDown, Zap, Shield, GripVertical, AlertTriangle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutoRule } from '@/lib/rules';
import { RULE_MARKETPLACE_LABELS } from '@/lib/rules';

interface RulePrecedenceViewProps {
    rules: AutoRule[];
    marketplace?: string;
    className?: string;
    onReorderRequest?: (ruleId: string, newPriority: number) => void;
}

/**
 * RulePrecedenceView - Visual representation of rule processing order
 * 
 * Shows how rules are evaluated in priority order, with visual indicators
 * for stop-on-match and potential conflicts.
 */
export default function RulePrecedenceView({
    rules,
    marketplace = 'all',
    className,
    onReorderRequest,
}: RulePrecedenceViewProps) {
    const [highlightedRule, setHighlightedRule] = useState<string | null>(null);

    // Sort rules by priority (descending - higher priority first)
    const sortedRules = useMemo(() => {
        let filtered = rules.filter(r => r.enabled);
        if (marketplace !== 'all') {
            filtered = filtered.filter(r =>
                r.marketplaces.includes(marketplace) || r.marketplaces.includes('all')
            );
        }
        return filtered.sort((a, b) => b.priority - a.priority);
    }, [rules, marketplace]);

    // Detect potential conflicts (rules with same conditions but different actions)
    const conflictPairs = useMemo(() => {
        const pairs: Array<[string, string]> = [];
        for (let i = 0; i < sortedRules.length; i++) {
            for (let j = i + 1; j < sortedRules.length; j++) {
                const ruleA = sortedRules[i];
                const ruleB = sortedRules[j];
                // Simple check: same first condition field
                if (ruleA.conditions[0]?.field === ruleB.conditions[0]?.field) {
                    // Check if they might match similar inputs
                    const valA = String(ruleA.conditions[0]?.value || '').toLowerCase();
                    const valB = String(ruleB.conditions[0]?.value || '').toLowerCase();
                    if (valA.includes(valB) || valB.includes(valA)) {
                        pairs.push([ruleA.id, ruleB.id]);
                    }
                }
            }
        }
        return pairs;
    }, [sortedRules]);

    const isInConflict = (ruleId: string) =>
        conflictPairs.some(([a, b]) => a === ruleId || b === ruleId);

    if (sortedRules.length === 0) {
        return (
            <div className={cn("text-center py-8 text-gray-500", className)}>
                <ArrowUpDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Nenhuma regra ativa para visualizar</p>
            </div>
        );
    }

    return (
        <div className={cn("space-y-4", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-5 h-5 text-blue-500" />
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                        Ordem de Processamento
                    </h3>
                </div>
                <span className="text-xs text-gray-500">
                    {sortedRules.length} regras ativas
                </span>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-purple-500" />
                    <span>Regra do Sistema</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-blue-500" />
                    <span>Regra Personalizada</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded-full bg-amber-500" />
                    <span>Interrompe (stop-on-match)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    <span>Possível conflito</span>
                </div>
            </div>

            {/* Flow visualization */}
            <div className="relative">
                {/* Vertical connection line */}
                <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-300 via-blue-400 to-blue-300 dark:from-blue-700 dark:via-blue-600 dark:to-blue-700" />

                <div className="space-y-2">
                    {/* Start node */}
                    <div className="flex items-center gap-3 pl-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-400 flex items-center justify-center z-10">
                            <span className="text-xs font-bold text-emerald-600">IN</span>
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Pagamento entra</span>
                    </div>

                    {/* Rules */}
                    {sortedRules.map((rule) => (
                        <div key={rule.id} className="flex items-start gap-3 pl-2">
                            {/* Priority node */}
                            <div
                                className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center z-10 transition-transform cursor-pointer",
                                    rule.isSystemRule
                                        ? "bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-400"
                                        : "bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-400",
                                    highlightedRule === rule.id && "scale-110 ring-2 ring-offset-2 ring-blue-500",
                                    isInConflict(rule.id) && "ring-2 ring-orange-400"
                                )}
                                onMouseEnter={() => setHighlightedRule(rule.id)}
                                onMouseLeave={() => setHighlightedRule(null)}
                            >
                                <span className="text-xs font-bold">{rule.priority}</span>
                            </div>

                            {/* Rule card */}
                            <div
                                className={cn(
                                    "flex-1 p-3 rounded-xl border transition-all",
                                    highlightedRule === rule.id
                                        ? "bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600 shadow-md"
                                        : "bg-white/50 dark:bg-gray-800/50 border-white/20 dark:border-white/10",
                                    isInConflict(rule.id) && "border-orange-300 dark:border-orange-600"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {rule.isSystemRule ? (
                                            <Shield className="w-4 h-4 text-purple-500" />
                                        ) : (
                                            <Zap className="w-4 h-4 text-blue-500" />
                                        )}
                                        <span className="font-medium text-sm text-slate-800 dark:text-slate-100">
                                            {rule.name}
                                        </span>
                                        {isInConflict(rule.id) && (
                                            <AlertTriangle className="w-4 h-4 text-orange-500" title="Possível conflito com outra regra" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {rule.stopOnMatch && (
                                            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                                STOP
                                            </span>
                                        )}
                                        {onReorderRequest && !rule.isSystemRule && (
                                            <button
                                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                                                title="Arrastar para reordenar"
                                            >
                                                <GripVertical className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Rule details when highlighted */}
                                {highlightedRule === rule.id && (
                                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs space-y-1">
                                        <div className="text-gray-600 dark:text-gray-400">
                                            <span className="text-blue-500">SE</span>{' '}
                                            {rule.conditions.map((c, i) => (
                                                <span key={i}>
                                                    {i > 0 && <span className="text-gray-400"> {rule.conditionLogic} </span>}
                                                    {c.field} {c.operator} &quot;{c.value}&quot;
                                                </span>
                                            ))}
                                        </div>
                                        <div className="text-gray-600 dark:text-gray-400">
                                            <span className="text-emerald-500">ENTÃO</span>{' '}
                                            {rule.actions.map((a, i) => (
                                                <span key={i} className="text-purple-600 dark:text-purple-400">
                                                    {i > 0 && ', '}
                                                    {a.type === 'add_tags' ? `+${a.tags?.join(', ')}` : a.type}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {rule.marketplaces.filter(m => m !== 'all').map(mp => (
                                                <span key={mp} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                    {RULE_MARKETPLACE_LABELS[mp] || mp}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Stop indicator */}
                            {rule.stopOnMatch && (
                                <div className="flex flex-col items-center pt-2">
                                    <ArrowDown className="w-4 h-4 text-amber-500" />
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400">para</span>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* End node */}
                    <div className="flex items-center gap-3 pl-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-400 flex items-center justify-center z-10">
                            <Check className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Tags aplicadas, pagamento processado</span>
                    </div>
                </div>
            </div>

            {/* Conflicts summary */}
            {conflictPairs.length > 0 && (
                <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 text-sm">
                    <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium">{conflictPairs.length} possível(is) conflito(s) detectado(s)</span>
                    </div>
                    <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">
                        Regras com condições similares podem competir. Ajuste as prioridades ou use &quot;stop-on-match&quot;.
                    </p>
                </div>
            )}
        </div>
    );
}
