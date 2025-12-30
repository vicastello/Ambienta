'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
    Sparkles,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Lightbulb,
    RefreshCw,
    ArrowRight,
    Flame,
    Target,
    Package,
    DollarSign,
    Send,
    Zap,
    BarChart2,
    ShoppingCart,
} from 'lucide-react';
import type { AIIntelligenceResponse, AIInsight } from '@/lib/ai/prompts/insight-prompt';
import '@/app/intelligence-2.css';

interface AICommandCenterProps {
    dashboardData?: unknown;
    className?: string;
}

// Animated counter hook
function useAnimatedNumber(target: number, duration: number = 1000) {
    const [current, setCurrent] = useState(0);
    const frameRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        const startTime = Date.now();
        const startValue = current;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function
            const eased = 1 - Math.pow(1 - progress, 3);
            const newValue = startValue + (target - startValue) * eased;

            setCurrent(newValue);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            }
        };

        frameRef.current = requestAnimationFrame(animate);

        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [target, duration]);

    return current;
}

// Sparkline component
function Sparkline({ data, color = 'var(--accent)' }: { data: number[], color?: string }) {
    const max = Math.max(...data, 1);

    return (
        <div className="sparkline-container">
            {data.map((value, i) => (
                <div
                    key={i}
                    className="sparkline-bar"
                    style={{
                        height: `${(value / max) * 100}%`,
                        background: `linear-gradient(to top, ${color}, ${color}33)`,
                        animationDelay: `${i * 50}ms`,
                    }}
                />
            ))}
        </div>
    );
}

// Insight Gem Component
function InsightGem({ insight, onAction }: { insight: AIInsight, onAction?: () => void }) {
    const typeConfig = {
        urgente: {
            icon: Flame,
            class: 'urgent',
            actionLabel: 'Resolver Agora',
            actionIcon: Zap,
        },
        oportunidade: {
            icon: Lightbulb,
            class: 'opportunity',
            actionLabel: 'Aproveitar',
            actionIcon: Target,
        },
        tendencia: {
            icon: TrendingUp,
            class: 'trend',
            actionLabel: 'Analisar',
            actionIcon: BarChart2,
        },
        alerta: {
            icon: AlertTriangle,
            class: 'alert',
            actionLabel: 'Verificar',
            actionIcon: Target,
        },
    };

    const config = typeConfig[insight.tipo] || typeConfig.alerta;
    const Icon = config.icon;
    const ActionIcon = config.actionIcon;

    // Calculate impact percentage (1-5 priority to 20-100%)
    const impact = ((6 - insight.prioridade) / 5) * 100;

    return (
        <div className={`insight-gem ${config.class}`}>
            {/* Header */}
            <div className="gem-header">
                <span className={`gem-badge ${config.class}`}>
                    {insight.tipo === 'urgente' ? '🔥 Urgente' :
                        insight.tipo === 'oportunidade' ? '💡 Oportunidade' :
                            insight.tipo === 'tendencia' ? '📈 Tendência' : '⚠️ Atenção'}
                </span>
                <div className={`gem-icon ${config.class}`}>
                    <Icon size={14} />
                </div>
            </div>

            {/* Content */}
            <h4 className="gem-title">{insight.titulo}</h4>
            <p className="gem-description">{insight.descricao}</p>

            {/* Impact Bar */}
            <div className="impact-bar">
                <div
                    className={`impact-bar-fill ${config.class}`}
                    style={{ width: `${impact}%` }}
                />
            </div>

            {/* Footer */}
            <div className="gem-footer">
                {insight.metrica && (
                    <div className="gem-metric">
                        <span className="gem-metric-value">{insight.metrica.valor}</span>
                        <span className="gem-metric-label">{insight.metrica.label}</span>
                    </div>
                )}
                <button className={`gem-action ${config.class}`} onClick={onAction}>
                    <span>{config.actionLabel}</span>
                    <ArrowRight size={10} />
                </button>
            </div>
        </div>
    );
}

export function AICommandCenter({
    dashboardData,
    className = ''
}: AICommandCenterProps) {
    const [intelligence, setIntelligence] = useState<AIIntelligenceResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasAttempted, setHasAttempted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiPrompt, setAiPrompt] = useState('');

    // Extract metrics for animation
    const faturamento = (dashboardData as any)?.current?.totalValor || 0;
    const pedidos = (dashboardData as any)?.current?.totalPedidos || 0;
    const animatedFaturamento = useAnimatedNumber(faturamento, 1200);
    const animatedPedidos = useAnimatedNumber(pedidos, 1000);

    // Generate sparkline data from daily sales
    const vendasPorDia = (dashboardData as any)?.current?.vendasPorDia || [];
    const sparklineData = vendasPorDia.slice(-7).map((d: any) => d.totalDia || 0);

    // Get change percentage
    const faturamentoChange = (dashboardData as any)?.diffs?.faturamento?.deltaPercent;

    const fetchIntelligence = useCallback(async () => {
        if (!dashboardData) return;

        setIsLoading(true);
        setError(null);
        setHasAttempted(true);

        try {
            const response = await fetch('/api/ai/intelligence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dashboardData }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Erro ao gerar análise');
            }

            const data = await response.json();
            setIntelligence(data);
        } catch (err) {
            console.error('[AICommandCenter] Error:', err);
            setError(err instanceof Error ? err.message : 'Erro ao carregar análise');
        } finally {
            setIsLoading(false);
        }
    }, [dashboardData]);

    useEffect(() => {
        if (dashboardData && !hasAttempted) {
            fetchIntelligence();
        }
    }, [dashboardData, hasAttempted, fetchIntelligence]);

    const handleAiSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Could integrate with CopilotChat here
        console.log('AI Query:', aiPrompt);
        setAiPrompt('');
    };

    // Determine health status
    const healthStatus = faturamentoChange !== null
        ? (faturamentoChange > 5 ? 'healthy' : faturamentoChange > -5 ? 'warning' : 'critical')
        : 'warning';

    // Waiting for data
    if (!dashboardData && !hasAttempted) {
        return (
            <div className={`intelligence-core ${className}`}>
                <div className="orb orb-1" />
                <div className="orb orb-2" />
                <div className="p-8 text-center relative">
                    <Sparkles size={32} className="text-accent mx-auto mb-4 animate-pulse" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                        Inteligência Ambienta
                    </h3>
                    <p className="text-sm text-muted">Aguardando dados...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`intelligence-core ${className}`}>
            {/* Floating Orbs */}
            <div className="orb orb-1" />
            <div className="orb orb-2" />
            <div className="orb orb-3" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 relative">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-accent/15 border border-accent/25">
                        <Sparkles size={18} className={`text-accent ${isLoading ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                        <h2 className="font-bold text-foreground flex items-center gap-2">
                            Inteligência Ambienta
                            <div className={`health-indicator ${healthStatus}`} />
                        </h2>
                        <p className="text-xs text-muted">
                            Análise em tempo real • IA ativa
                        </p>
                    </div>
                </div>
                <button
                    onClick={fetchIntelligence}
                    disabled={isLoading}
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={16} className={`text-muted ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Hero Metrics */}
            <div className="hero-metric relative">
                <div className="hero-metric-value">
                    R$ {animatedFaturamento.toLocaleString('pt-BR', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    })}
                </div>
                <div className="hero-metric-label">Faturamento do Período</div>
                {faturamentoChange !== null && (
                    <div className={`hero-metric-change ${faturamentoChange >= 0 ? 'positive' : 'negative'}`}>
                        {faturamentoChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        <span>{faturamentoChange >= 0 ? '+' : ''}{faturamentoChange.toFixed(1)}% vs anterior</span>
                    </div>
                )}

                {/* Sparkline */}
                {sparklineData.length > 0 && (
                    <div className="max-w-[200px] mx-auto mt-3">
                        <Sparkline data={sparklineData} />
                    </div>
                )}
            </div>

            {/* AI Voice Box */}
            {intelligence?.resumoExecutivo && !isLoading && (
                <div className="ai-voice-box">
                    <p className="ai-voice-text">
                        <strong>💡 {intelligence.resumoExecutivo.manchete}</strong>
                        <br />
                        <span className="text-muted text-sm">{intelligence.resumoExecutivo.contexto}</span>
                    </p>
                </div>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="px-6 pb-4">
                    <div className="ai-voice-box shimmer">
                        <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-white/5 rounded w-full" />
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="mx-6 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {error}
                </div>
            )}

            {/* Insight Gems Grid */}
            {intelligence?.insights && intelligence.insights.length > 0 && !isLoading && (
                <div className="insight-gems-grid">
                    {intelligence.insights.slice(0, 4).map((insight, idx) => (
                        <InsightGem
                            key={idx}
                            insight={insight}
                            onAction={() => console.log('Action:', insight.acao.texto)}
                        />
                    ))}
                </div>
            )}

            {/* Projection Bar */}
            {intelligence?.projecao && !isLoading && (
                <div className="mx-6 mb-4 p-3 rounded-xl bg-purple-500/8 border border-purple-500/15 flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-purple-500/15">
                        <BarChart2 size={14} className="text-purple-400" />
                    </div>
                    <div className="flex-1">
                        <span className="text-[10px] text-purple-400/80 uppercase tracking-wider font-medium">
                            Projeção
                        </span>
                        <p className="text-xs text-foreground">{intelligence.projecao.texto}</p>
                    </div>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${intelligence.projecao.confianca === 'alta'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : intelligence.projecao.confianca === 'media'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-slate-500/15 text-slate-400'
                        }`}>
                        {intelligence.projecao.confianca === 'alta' ? '●' : intelligence.projecao.confianca === 'media' ? '◐' : '○'} Confiança {intelligence.projecao.confianca}
                    </span>
                </div>
            )}

            {/* AI Input Bar */}
            <div className="ai-input-bar">
                <form onSubmit={handleAiSubmit} className="ai-input-container">
                    <Sparkles size={16} className="text-accent flex-shrink-0" />
                    <input
                        type="text"
                        className="ai-input"
                        placeholder="Pergunte algo sobre seus dados..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                    />
                    <button type="submit" className="ai-input-send" disabled={!aiPrompt.trim()}>
                        <Send size={14} />
                    </button>
                </form>
            </div>
        </div>
    );
}

export default AICommandCenter;
