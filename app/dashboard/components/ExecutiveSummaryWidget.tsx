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
    Zap,
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
    const [hasAttempted, setHasAttempted] = useState(false);

    const fetchSummary = useCallback(async () => {
        if (!dashboardData) return;

        setIsLoading(true);
        setError(null);
        setHasAttempted(true);

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

    // Auto-fetch when dashboardData becomes available
    useEffect(() => {
        if (dashboardData && !hasAttempted) {
            fetchSummary();
        }
    }, [dashboardData, hasAttempted, fetchSummary]);

    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Empty state while waiting for dashboard data
    if (!dashboardData && !hasAttempted) {
        return (
            <div className={`rounded-2xl overflow-hidden ${className}`}>
                <div className="relative bg-gradient-to-br from-accent/5 via-purple-500/5 to-accent/5 border border-accent/10 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20">
                            <Sparkles size={20} className="text-accent animate-pulse" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Insights de IA</h3>
                            <p className="text-xs text-muted">Aguardando dados do dashboard...</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="h-3 bg-white/5 rounded-full animate-pulse w-3/4" />
                        <div className="h-3 bg-white/5 rounded-full animate-pulse w-1/2" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`rounded-2xl overflow-hidden ${className}`}>
            {/* Premium Header with Gradient */}
            <div className="relative bg-gradient-to-br from-accent/10 via-purple-500/5 to-accent/10 border border-accent/20 rounded-2xl overflow-hidden">
                {/* Glow effect */}
                <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

                {/* Header */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 shadow-lg shadow-accent/10">
                            <Sparkles size={18} className={`text-accent ${isLoading ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="text-left">
                            <span className="font-semibold text-sm text-white">Resumo Executivo</span>
                            {data && (
                                <span className="text-xs text-muted ml-2">
                                    Atualizado às {formatTime(data.generatedAt)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isLoading && <RefreshCw size={14} className="animate-spin text-accent" />}
                        <div className="p-1 rounded-lg hover:bg-white/10 transition-colors">
                            {isExpanded ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
                        </div>
                    </div>
                </button>

                {/* Content */}
                {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 animate-fade-scale">
                        {error ? (
                            <div className="flex items-center gap-2 text-sm text-negative bg-negative/10 rounded-xl px-4 py-3">
                                <AlertTriangle size={16} />
                                {error}
                            </div>
                        ) : isLoading && !data ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm text-muted">
                                    <Zap size={14} className="text-accent animate-pulse" />
                                    <span>Analisando dados com IA...</span>
                                </div>
                                <div className="h-4 bg-white/5 rounded-full animate-pulse w-full" />
                                <div className="h-4 bg-white/5 rounded-full animate-pulse w-3/4" />
                                <div className="h-4 bg-white/5 rounded-full animate-pulse w-1/2" />
                            </div>
                        ) : data ? (
                            <>
                                {/* Main Summary */}
                                <p className="text-sm text-foreground/90 leading-relaxed">{data.summary}</p>

                                {/* Highlights */}
                                {data.highlights.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-medium text-muted uppercase tracking-wider">Destaques</h4>
                                        {data.highlights.map((h, i) => (
                                            <div key={i} className="flex items-start gap-3 text-sm bg-positive/5 border border-positive/10 rounded-xl px-4 py-2.5">
                                                <TrendingUp size={14} className="text-positive mt-0.5 flex-shrink-0" />
                                                <span className="text-foreground/80">{h}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Alerts */}
                                {data.alerts.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-medium text-muted uppercase tracking-wider">Alertas</h4>
                                        {data.alerts.map((a, i) => (
                                            <div key={i} className="flex items-start gap-3 text-sm bg-warning/5 border border-warning/10 rounded-xl px-4 py-2.5">
                                                <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
                                                <span className="text-foreground/80">{a}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Recommendation */}
                                {data.recommendation && (
                                    <div className="flex items-start gap-3 text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3">
                                        <Lightbulb size={14} className="text-accent mt-0.5 flex-shrink-0" />
                                        <div>
                                            <span className="text-xs font-medium text-accent uppercase tracking-wider">Recomendação</span>
                                            <p className="text-foreground/90 mt-1">{data.recommendation}</p>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={fetchSummary}
                                className="w-full flex items-center justify-center gap-2 text-sm text-accent hover:text-accent-light py-3 rounded-xl bg-accent/5 hover:bg-accent/10 border border-accent/20 transition-all"
                            >
                                <Sparkles size={16} />
                                <span>Gerar Resumo com IA</span>
                            </button>
                        )}

                        {/* Refresh button */}
                        {!isLoading && data && (
                            <button
                                onClick={fetchSummary}
                                className="text-xs text-muted hover:text-foreground flex items-center gap-1.5 transition-colors group"
                            >
                                <RefreshCw size={12} className="group-hover:rotate-180 transition-transform duration-500" />
                                <span>Atualizar análise</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ExecutiveSummaryWidget;
