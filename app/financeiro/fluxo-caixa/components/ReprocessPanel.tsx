'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Loader2, Check, AlertCircle, Calendar, ChevronDown, ChevronUp, Eye, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RULE_MARKETPLACES, RULE_MARKETPLACE_LABELS } from '@/lib/rules';

interface ReprocessResult {
    paymentId: string;
    marketplaceOrderId: string;
    originalTags: string[];
    newTags: string[];
    matchedRules: string[];
    changed: boolean;
}

interface ReprocessSummary {
    processed: number;
    changed: number;
    unchanged: number;
    rulesApplied: number;
    dryRun: boolean;
}

interface ReprocessPanelProps {
    className?: string;
    onComplete?: () => void;
}

/**
 * ReprocessPanel - UI for reprocessing historical payments with current rules
 */
export default function ReprocessPanel({ className, onComplete }: ReprocessPanelProps) {
    const [marketplace, setMarketplace] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [limit, setLimit] = useState<number>(100);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<ReprocessResult[] | null>(null);
    const [summary, setSummary] = useState<ReprocessSummary | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    // Set default date range (last 30 days)
    const setLast30Days = useCallback(() => {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        setDateTo(today.toISOString().split('T')[0]);
        setDateFrom(thirtyDaysAgo.toISOString().split('T')[0]);
    }, []);

    const handleReprocess = useCallback(async (dryRun: boolean) => {
        setLoading(true);
        setError(null);
        setResults(null);
        setSummary(null);

        try {
            const res = await fetch('/api/financeiro/rules/reprocess', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    marketplace: marketplace !== 'all' ? marketplace : undefined,
                    dateFrom: dateFrom || undefined,
                    dateTo: dateTo || undefined,
                    dryRun,
                    limit,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                setError(data.error || 'Erro ao reprocessar');
                return;
            }

            setResults(data.results || []);
            setSummary(data.summary || null);

            if (!dryRun && onComplete) {
                onComplete();
            }
        } catch (err) {
            console.error('[ReprocessPanel] Error:', err);
            setError('Erro de conexão');
        } finally {
            setLoading(false);
        }
    }, [marketplace, dateFrom, dateTo, limit, onComplete]);

    const changedResults = results?.filter(r => r.changed) || [];

    return (
        <div className={cn("space-y-4 p-5 rounded-2xl bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-900/10 dark:to-blue-900/10 border border-purple-200/50 dark:border-purple-700/30", className)}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                    <RefreshCw className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                        Reprocessar Histórico
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Aplicar regras atuais a pagamentos antigos
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Marketplace */}
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                        Marketplace
                    </label>
                    <select
                        value={marketplace}
                        onChange={(e) => setMarketplace(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    >
                        <option value="all">Todos</option>
                        {RULE_MARKETPLACES.map(mp => (
                            <option key={mp.id} value={mp.id}>
                                {RULE_MARKETPLACE_LABELS[mp.id] || mp.id}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Date From */}
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        De
                    </label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    />
                </div>

                {/* Date To */}
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        Até
                    </label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    />
                </div>

                {/* Limit */}
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                        Limite
                    </label>
                    <select
                        value={limit}
                        onChange={(e) => setLimit(parseInt(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    >
                        <option value={50}>50 pagamentos</option>
                        <option value={100}>100 pagamentos</option>
                        <option value={200}>200 pagamentos</option>
                        <option value={500}>500 pagamentos</option>
                    </select>
                </div>
            </div>

            {/* Quick filters */}
            <div className="flex gap-2">
                <button
                    onClick={setLast30Days}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/50 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-gray-200 dark:border-gray-700 transition-colors"
                >
                    Últimos 30 dias
                </button>
                <button
                    onClick={() => {
                        const today = new Date();
                        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                        setDateFrom(firstDay.toISOString().split('T')[0]);
                        setDateTo(today.toISOString().split('T')[0]);
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/50 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-gray-200 dark:border-gray-700 transition-colors"
                >
                    Este mês
                </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
                <button
                    onClick={() => handleReprocess(true)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Eye className="w-4 h-4 text-blue-500" />
                    )}
                    <span className="text-sm font-medium">Preview</span>
                </button>
                <button
                    onClick={() => handleReprocess(false)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white transition-colors disabled:opacity-50"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Zap className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">Aplicar Regras</span>
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Summary */}
            {summary && (
                <div className="p-4 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Check className="w-5 h-5 text-emerald-500" />
                            <span className="font-medium text-slate-800 dark:text-slate-100">
                                {summary.dryRun ? 'Preview Concluído' : 'Reprocessamento Concluído'}
                            </span>
                        </div>
                        {summary.dryRun && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                Simulação
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                                {summary.processed}
                            </div>
                            <div className="text-xs text-gray-500">Processados</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {summary.changed}
                            </div>
                            <div className="text-xs text-gray-500">Alterados</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-gray-400">
                                {summary.unchanged}
                            </div>
                            <div className="text-xs text-gray-500">Sem alteração</div>
                        </div>
                    </div>

                    {/* Toggle details */}
                    {changedResults.length > 0 && (
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                        >
                            {showDetails ? 'Ocultar detalhes' : `Ver ${changedResults.length} alterações`}
                            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    )}
                </div>
            )}

            {/* Details */}
            {showDetails && changedResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    {changedResults.slice(0, 20).map((result) => (
                        <div
                            key={result.paymentId}
                            className="p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-sm"
                        >
                            <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
                                {result.marketplaceOrderId}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs">
                                <span className="text-gray-500">Tags:</span>
                                <span className="text-rose-500 line-through">
                                    {result.originalTags.join(', ') || 'nenhuma'}
                                </span>
                                <span className="text-gray-400">→</span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                    {result.newTags.join(', ') || 'nenhuma'}
                                </span>
                            </div>
                            {result.matchedRules.length > 0 && (
                                <div className="text-xs text-gray-500 mt-1">
                                    Regras: {result.matchedRules.join(', ')}
                                </div>
                            )}
                        </div>
                    ))}
                    {changedResults.length > 20 && (
                        <p className="text-center text-xs text-gray-500">
                            ... e mais {changedResults.length - 20} alterações
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
