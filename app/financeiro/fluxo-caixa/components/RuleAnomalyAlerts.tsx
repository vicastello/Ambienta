'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, TrendingUp, Clock, Zap, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnomalyAlert {
    ruleId: string;
    ruleName: string;
    type: 'high_frequency' | 'low_frequency' | 'high_impact' | 'dormant' | 'spike';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    details: Record<string, unknown>;
}

interface AnomalySummary {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
}

interface RuleAnomalyAlertsProps {
    className?: string;
    onRuleClick?: (ruleId: string) => void;
}

const TYPE_CONFIG = {
    high_frequency: { icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    low_frequency: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-900/30' },
    high_impact: { icon: Zap, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    dormant: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
    spike: { icon: TrendingUp, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-900/30' },
};

const SEVERITY_COLOR = {
    info: 'border-l-blue-400',
    warning: 'border-l-amber-400',
    critical: 'border-l-rose-500',
};

/**
 * RuleAnomalyAlerts - Displays detected anomalies in rule behavior
 */
export default function RuleAnomalyAlerts({ className, onRuleClick }: RuleAnomalyAlertsProps) {
    const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
    const [summary, setSummary] = useState<AnomalySummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);

    const fetchAnomalies = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/financeiro/rules/anomalies?days=30');
            const data = await res.json();

            if (data.success) {
                setAlerts(data.alerts || []);
                setSummary(data.summary || null);
            } else {
                setError(data.error || 'Erro ao carregar');
            }
        } catch (err) {
            console.error('[RuleAnomalyAlerts] Error:', err);
            setError('Erro de conexão');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAnomalies();
    }, [fetchAnomalies]);

    // Don't render anything if no alerts
    if (!loading && alerts.length === 0) {
        return null;
    }

    const warningCount = summary?.bySeverity?.warning || 0;
    const criticalCount = summary?.bySeverity?.critical || 0;
    const hasImportant = warningCount > 0 || criticalCount > 0;

    return (
        <div className={cn(
            "rounded-2xl border overflow-hidden transition-all",
            hasImportant
                ? "border-amber-200 dark:border-amber-700/50 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-900/10 dark:to-orange-900/5"
                : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50",
            className
        )}>
            {/* Header - Always visible */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "p-2 rounded-xl",
                        hasImportant ? "bg-amber-100 dark:bg-amber-900/30" : "bg-gray-100 dark:bg-gray-700"
                    )}>
                        <AlertTriangle className={cn(
                            "w-5 h-5",
                            hasImportant ? "text-amber-600 dark:text-amber-400" : "text-gray-500"
                        )} />
                    </div>
                    <div className="text-left">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                            Alertas de Regras
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {loading ? 'Analisando...' : `${summary?.total || 0} padrões detectados`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {!loading && summary && (
                        <div className="flex items-center gap-2 text-xs">
                            {criticalCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400">
                                    {criticalCount} crítico
                                </span>
                            )}
                            {warningCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                    {warningCount} alerta
                                </span>
                            )}
                        </div>
                    )}
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : expanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                </div>
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : error ? (
                        <div className="p-4 text-center text-rose-600 dark:text-rose-400">
                            <p>{error}</p>
                            <button
                                onClick={fetchAnomalies}
                                className="mt-2 text-sm text-blue-500 hover:underline"
                            >
                                Tentar novamente
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {alerts.slice(0, 10).map((alert, idx) => {
                                const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.dormant;
                                const Icon = config.icon;

                                return (
                                    <div
                                        key={`${alert.ruleId}-${idx}`}
                                        className={cn(
                                            "p-4 border-l-4 hover:bg-white/50 dark:hover:bg-white/5 transition-colors",
                                            SEVERITY_COLOR[alert.severity],
                                            onRuleClick && "cursor-pointer"
                                        )}
                                        onClick={() => onRuleClick?.(alert.ruleId)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={cn("p-1.5 rounded-lg", config.bg)}>
                                                <Icon className={cn("w-4 h-4", config.color)} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">
                                                        {alert.ruleName}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                                    {alert.message}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {alerts.length > 10 && (
                                <div className="p-3 text-center text-xs text-gray-500">
                                    ... e mais {alerts.length - 10} alertas
                                </div>
                            )}

                            {/* Refresh button */}
                            <div className="p-3 flex justify-center">
                                <button
                                    onClick={fetchAnomalies}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Atualizar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
