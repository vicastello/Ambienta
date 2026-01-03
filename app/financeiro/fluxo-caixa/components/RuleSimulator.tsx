'use client';

import { useState, useCallback } from 'react';
import { Play, Loader2, Check, X, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreateRulePayload } from '@/lib/rules';

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

interface RuleSimulatorProps {
    rule: CreateRulePayload;
    marketplace?: string;
    className?: string;
}

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

/**
 * RuleSimulator - Component to simulate a rule before saving/activating
 * 
 * Allows users to test a rule against historical payments and see
 * how many would match and what the financial impact would be.
 */
export default function RuleSimulator({ rule, marketplace, className }: RuleSimulatorProps) {
    const [isSimulating, setIsSimulating] = useState(false);
    const [results, setResults] = useState<SimulateResult[] | null>(null);
    const [summary, setSummary] = useState<SimulateSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [limit, setLimit] = useState(50);
    const [showResults, setShowResults] = useState(false);
    const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

    const handleSimulate = useCallback(async () => {
        setIsSimulating(true);
        setError(null);
        setResults(null);
        setSummary(null);

        try {
            const response = await fetch('/api/financeiro/rules/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rule,
                    marketplace: marketplace || 'all',
                    limit,
                }),
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Erro ao simular regra');
                return;
            }

            setResults(data.results);
            setSummary(data.summary);
            setShowResults(true);
        } catch (err) {
            console.error('[RuleSimulator] Error:', err);
            setError('Erro de conexão ao simular regra');
        } finally {
            setIsSimulating(false);
        }
    }, [rule, marketplace, limit]);

    const toggleResultExpand = (id: string) => {
        const newSet = new Set(expandedResults);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedResults(newSet);
    };

    return (
        <div className={cn("space-y-4", className)}>
            {/* Controls */}
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Testar em:
                    </label>
                    <select
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        className="app-input text-sm py-1 px-2"
                    >
                        <option value={20}>20 lançamentos</option>
                        <option value={50}>50 lançamentos</option>
                        <option value={100}>100 lançamentos</option>
                        <option value={200}>200 lançamentos</option>
                    </select>
                </div>

                <button
                    onClick={handleSimulate}
                    disabled={isSimulating}
                    className={cn(
                        "app-btn-secondary inline-flex items-center gap-2 text-sm",
                        isSimulating && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {isSimulating ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Simulando...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            Simular Regra
                        </>
                    )}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Summary */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="glass-panel p-3 rounded-xl text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Testados</p>
                        <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.tested}</p>
                    </div>
                    <div className="glass-panel p-3 rounded-xl text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Matches</p>
                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{summary.matched}</p>
                    </div>
                    <div className="glass-panel p-3 rounded-xl text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Taxa de Match</p>
                        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{summary.matchRate}</p>
                    </div>
                    <div className="glass-panel p-3 rounded-xl text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Impacto Total</p>
                        <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{formatBRL(summary.totalImpact)}</p>
                    </div>
                </div>
            )}

            {/* Results Toggle */}
            {results && results.length > 0 && (
                <button
                    onClick={() => setShowResults(!showResults)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                    {showResults ? (
                        <>
                            <ChevronUp className="w-4 h-4" />
                            Ocultar detalhes
                        </>
                    ) : (
                        <>
                            <ChevronDown className="w-4 h-4" />
                            Ver detalhes ({summary?.matched || 0} matches)
                        </>
                    )}
                </button>
            )}

            {/* Detailed Results */}
            {showResults && results && results.length > 0 && (
                <div className="glass-panel p-4 rounded-xl max-h-80 overflow-y-auto space-y-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Mostrando apenas os matches ({summary?.matched || 0} de {summary?.tested || 0})
                    </p>

                    {results.filter(r => r.matched).map((result) => (
                        <div
                            key={result.payment.id}
                            className="border border-white/20 dark:border-white/10 rounded-lg bg-white/30 dark:bg-white/5 overflow-hidden"
                        >
                            <button
                                onClick={() => toggleResultExpand(result.payment.id)}
                                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/20 dark:hover:bg-white/10"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
                                            {result.payment.orderId}
                                        </p>
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                            {result.payment.description || result.payment.type || 'Sem descrição'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className={cn(
                                        "text-sm font-semibold tabular-nums",
                                        result.payment.amount >= 0
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : "text-rose-600 dark:text-rose-400"
                                    )}>
                                        {formatBRL(result.payment.amount)}
                                    </span>
                                    {expandedResults.has(result.payment.id) ? (
                                        <ChevronUp className="w-4 h-4 text-gray-400" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                    )}
                                </div>
                            </button>

                            {expandedResults.has(result.payment.id) && (
                                <div className="px-3 pb-3 pt-1 border-t border-white/10 space-y-2">
                                    <p className="text-xs text-gray-500">Data: {formatDate(result.payment.date)}</p>

                                    {result.appliedActions.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {result.appliedActions.map((action, i) => (
                                                <span
                                                    key={i}
                                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                                >
                                                    {action}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {result.matchDetails.length > 0 && (
                                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                            {result.matchDetails.map((detail, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    {detail.matched ? (
                                                        <Check className="w-3 h-3 text-emerald-500" />
                                                    ) : (
                                                        <X className="w-3 h-3 text-gray-400" />
                                                    )}
                                                    <span>
                                                        {detail.field} {detail.operator} &quot;{String(detail.expectedValue)}&quot;
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Show count of non-matches */}
                    {results.filter(r => !r.matched).length > 0 && (
                        <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-white/10">
                            + {results.filter(r => !r.matched).length} pagamentos não corresponderam às condições
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
