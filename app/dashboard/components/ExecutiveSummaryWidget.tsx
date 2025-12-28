'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    Sparkles,
    TrendingUp,
    AlertTriangle,
    Lightbulb,
    RefreshCw,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';

interface ExecutiveSummary {
    summary: string;
    highlights: string[];
    alerts: string[];
    recommendation: string;
    generatedAt: string;
}

interface ExecutiveSummaryWidgetProps {
    dashboardData?: unknown;
    className?: string;
}

export function ExecutiveSummaryWidget({
    dashboardData,
    className = ''
}: ExecutiveSummaryWidgetProps) {
    const [data, setData] = useState<ExecutiveSummary | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = useCallback(async () => {
        if (!dashboardData) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/ai/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dashboardData }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Erro ao carregar resumo');
            }

            const result = await response.json();
            setData(result.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro desconhecido');
        } finally {
            setIsLoading(false);
        }
    }, [dashboardData]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className={`rounded-2xl glass-panel glass-tint overflow-hidden ${className}`}>
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-accent" />
                    <span className="font-medium text-sm">Resumo Executivo</span>
                    {data && (
                        <span className="text-xs text-muted">
                            {formatTime(data.generatedAt)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isLoading && <RefreshCw size={14} className="animate-spin text-muted" />}
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                    {error ? (
                        <p className="text-sm text-negative">{error}</p>
                    ) : isLoading && !data ? (
                        <div className="space-y-2">
                            <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
                            <div className="h-4 bg-white/10 rounded animate-pulse w-1/2" />
                        </div>
                    ) : data ? (
                        <>
                            {/* Summary */}
                            <p className="text-sm text-foreground/90">{data.summary}</p>

                            {/* Highlights */}
                            {data.highlights.length > 0 && (
                                <div className="space-y-1">
                                    {data.highlights.map((h, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs">
                                            <TrendingUp size={12} className="text-positive mt-0.5 flex-shrink-0" />
                                            <span className="text-foreground/80">{h}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Alerts */}
                            {data.alerts.length > 0 && (
                                <div className="space-y-1">
                                    {data.alerts.map((a, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs">
                                            <AlertTriangle size={12} className="text-warning mt-0.5 flex-shrink-0" />
                                            <span className="text-foreground/80">{a}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Recommendation */}
                            {data.recommendation && (
                                <div className="flex items-start gap-2 text-xs bg-accent/10 rounded-lg px-3 py-2">
                                    <Lightbulb size={12} className="text-accent mt-0.5 flex-shrink-0" />
                                    <span className="text-foreground/90">{data.recommendation}</span>
                                </div>
                            )}
                        </>
                    ) : null}

                    {/* Refresh button */}
                    {!isLoading && data && (
                        <button
                            onClick={fetchSummary}
                            className="text-xs text-muted hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                            <RefreshCw size={12} />
                            <span>Atualizar</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default ExecutiveSummaryWidget;
