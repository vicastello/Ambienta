'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    Send,
    Sparkles,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    ShieldCheck,
    ShieldAlert,
    Clock,
    ArrowRight,
    Zap,
    Target,
    Activity,
} from 'lucide-react';
import type {
    AIIntelligenceResponse,
    AIAction,
    AIDriver,
    AISignal,
    AIDataQuality,
} from '@/lib/ai/prompts/insight-prompt';

interface NerveCenterProps {
    dashboardData?: any;
    screenContext?: { screen?: string; context?: unknown } | null;
    filters?: {
        canaisSelecionados?: string[];
        situacoesSelecionadas?: number[];
    };
    className?: string;
}

type ActionPolicy = {
    sync: boolean;
    filters: boolean;
};

type NerveAction = {
    type: string;
    [key: string]: unknown;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);
const formatCompactCurrency = (value: number) => `R$ ${compactFormatter.format(value || 0)}`;
const formatNumber = (value: number) => numberFormatter.format(value || 0);
const formatPercent = (value: number | null | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const sentimentFromValue = (value: number | null | undefined) => {
    if (typeof value !== 'number') return 'neutro';
    if (value >= 6) return 'positivo';
    if (value <= -6) return 'alerta';
    return 'neutro';
};

const impactFromPriority = (priority?: number): 'alto' | 'medio' | 'baixo' => {
    if (!priority) return 'medio';
    if (priority <= 2) return 'alto';
    if (priority <= 4) return 'medio';
    return 'baixo';
};

const formatTime = (value?: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

// Animated number hook with easing
function useAnimatedValue(target: number, duration = 800) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        const start = performance.now();
        const startValue = value;

        const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            setValue(startValue + (target - startValue) * eased);

            if (progress < 1) requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }, [target, duration]);

    return value;
}

// Business Pulse - animated SVG line
function BusinessPulse({ intensity = 0.5, sentiment = 'neutral' }: { intensity: number; sentiment: string }) {
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        let frame: number;
        const animate = () => {
            setOffset(prev => (prev + 2) % 200);
            frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, []);

    // Generate organic wave path
    const path = useMemo(() => {
        const points: string[] = [];
        const amplitude = 8 + intensity * 12;

        for (let x = 0; x <= 200; x += 4) {
            const y = 20 +
                Math.sin((x + offset) * 0.05) * amplitude * 0.6 +
                Math.sin((x + offset) * 0.08) * amplitude * 0.4 +
                Math.sin((x + offset) * 0.15) * amplitude * 0.2;
            points.push(`${x === 0 ? 'M' : 'L'} ${x} ${y}`);
        }
        return points.join(' ');
    }, [offset, intensity]);

    const colors = {
        positive: ['var(--color-success)', 'var(--color-success-light)'],
        neutral: ['var(--color-info)', 'var(--color-info-light)'],
        alert: ['var(--color-warning)', 'var(--color-warning-light)'],
    };

    const [colorStart, colorEnd] = colors[sentiment as keyof typeof colors] || colors.neutral;

    return (
        <div className="pulse-container">
            <svg viewBox="0 0 200 40" className="w-full h-10" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="pulseGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={colorStart} stopOpacity="0.1" />
                        <stop offset="50%" stopColor={colorEnd} stopOpacity="0.8" />
                        <stop offset="100%" stopColor={colorStart} stopOpacity="0.1" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <path
                    d={path}
                    fill="none"
                    stroke="url(#pulseGradient)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    filter="url(#glow)"
                />
            </svg>
        </div>
    );
}

// Weekly Heatmap
function WeeklyHeatmap({ data }: { data: { day: string; value: number }[] }) {
    const max = Math.max(...data.map(d => d.value), 1);
    const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    return (
        <div className="heatmap-container">
            <div className="heatmap-grid">
                {data.slice(-7).map((d, i) => {
                    const intensity = d.value / max;
                    return (
                        <div key={i} className="heatmap-cell-wrapper">
                            <div
                                className="heatmap-cell"
                                style={{
                                    opacity: 0.2 + intensity * 0.8,
                                    background: 'linear-gradient(135deg, var(--accent), var(--color-warning))',
                                }}
                                title={`${d.day}: R$ ${d.value.toLocaleString('pt-BR')}`}
                            />
                            <span className="heatmap-label">{days[i]}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
    return (
        <div className="nerve-section-header">
            <div>
                <h3 className="nerve-section-title">{title}</h3>
                {subtitle && <p className="nerve-section-subtitle">{subtitle}</p>}
            </div>
            {badge && <span className="nerve-pill">{badge}</span>}
        </div>
    );
}

function SignalChip({ signal }: { signal: AISignal }) {
    const tone = signal.tipo || 'neutro';
    return (
        <div className={`signal-chip signal-${tone}`}>
            <div className="signal-title">{signal.titulo}</div>
            <div className="signal-value">{signal.valor}</div>
            <div className="signal-meta">
                {signal.variacao && <span className="signal-delta">{signal.variacao}</span>}
                {signal.origem && <span className="signal-origin">{signal.origem}</span>}
            </div>
        </div>
    );
}

function DriverCard({ driver }: { driver: AIDriver }) {
    const TrendIcon = driver.tendencia === 'up' ? TrendingUp : driver.tendencia === 'down' ? TrendingDown : Activity;
    return (
        <div className={`driver-card impact-${driver.impacto}`}>
            <div className="driver-icon">
                <TrendIcon size={14} />
            </div>
            <div className="driver-content">
                <div className="driver-header">
                    <span className="driver-title">{driver.titulo}</span>
                    {driver.evidencia && <span className="driver-evidence">{driver.evidencia}</span>}
                </div>
                <p className="driver-detail">{driver.detalhe}</p>
                <div className="driver-tags">
                    <span className={`driver-tag tag-${driver.impacto}`}>{driver.impacto}</span>
                    {driver.origem && <span className="driver-tag tag-outline">{driver.origem}</span>}
                </div>
            </div>
        </div>
    );
}

function ActionCard({ action, onCta }: { action: AIAction; onCta: (action: AIAction) => void }) {
    const urgencyLabel = action.urgencia === 'agora'
        ? 'Agora'
        : action.urgencia === 'hoje'
            ? 'Hoje'
            : action.urgencia === 'semana'
                ? 'Esta semana'
                : 'Monitorar';
    const urgencyIcon = action.urgencia === 'agora' ? Zap : action.urgencia === 'hoje' ? Target : Activity;
    const UrgencyIcon = urgencyIcon;
    return (
        <div className={`action-card impact-${action.impacto}`}>
            <div className="action-header">
                <span className={`action-badge badge-${action.urgencia}`}>{urgencyLabel}</span>
                <div className="action-icon">
                    <UrgencyIcon size={14} />
                </div>
            </div>
            <h4 className="action-title">{action.titulo}</h4>
            <p className="action-detail">{action.motivo}</p>
            <div className="action-footer">
                {action.metrica && (
                    <div className="action-metric">
                        <span className="action-metric-value">{action.metrica.valor}</span>
                        <span className="action-metric-label">{action.metrica.label}</span>
                    </div>
                )}
                <button
                    type="button"
                    className="action-cta"
                    onClick={() => onCta(action)}
                >
                    <span>{action.cta || 'Detalhar'}</span>
                    <ArrowRight size={12} />
                </button>
            </div>
        </div>
    );
}

function QualityPanel({ quality }: { quality: AIDataQuality }) {
    const statusLabel = quality.status === 'ok'
        ? 'Confiável'
        : quality.status === 'critico'
            ? 'Crítico'
            : 'Atenção';
    const StatusIcon = quality.status === 'ok' ? ShieldCheck : ShieldAlert;
    return (
        <div className={`quality-card status-${quality.status}`}>
            <div className="quality-header">
                <div className="quality-icon">
                    <StatusIcon size={16} />
                </div>
                <div>
                    <p className="quality-title">Qualidade dos dados</p>
                    <p className="quality-status">{statusLabel}</p>
                </div>
            </div>
            {quality.alertas.length > 0 ? (
                <div className="quality-alerts">
                    {quality.alertas.map((alerta, index) => (
                        <div key={`${alerta.titulo}-${index}`} className="quality-alert">
                            <p className="quality-alert-title">{alerta.titulo}</p>
                            <p className="quality-alert-detail">{alerta.detalhe}</p>
                            {alerta.acao && <span className="quality-alert-action">{alerta.acao}</span>}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="quality-empty">Sem alertas críticos no período.</p>
            )}
        </div>
    );
}

function EmptyState({ title, description }: { title: string; description: string }) {
    return (
        <div className="nerve-empty">
            <AlertTriangle size={16} />
            <div>
                <p className="nerve-empty-title">{title}</p>
                <p className="nerve-empty-description">{description}</p>
            </div>
        </div>
    );
}

const ACTION_TAG_REGEX = /\[ACTION:\s*({[\s\S]*?})\s*\]/g;

const parseActionTags = (content: string): { message: string; actions: NerveAction[] } => {
    const actions: NerveAction[] = [];
    const cleaned = content.replace(ACTION_TAG_REGEX, (match, json) => {
        try {
            const parsed = JSON.parse(json) as NerveAction;
            if (parsed?.type) actions.push(parsed);
            return '';
        } catch {
            return match;
        }
    }).trim();

    return {
        message: cleaned || content,
        actions,
    };
};

const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === 'string') as string[];
};

const toNumberArray = (value: unknown): number[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => (typeof item === 'number' ? item : Number(item)))
        .filter((item) => Number.isFinite(item));
};

const buildDashboardAiPayload = (ctx: any) => {
    if (!ctx || typeof ctx !== 'object') return null;
    const inicio = typeof ctx?.periodo?.inicio === 'string' ? ctx.periodo.inicio : '';
    const fim = typeof ctx?.periodo?.fim === 'string' ? ctx.periodo.fim : inicio;
    const vendasPorDia = Array.isArray(ctx?.vendasPorDia) ? ctx.vendasPorDia : [];
    const fallbackDias = vendasPorDia.length || 1;
    let dias = fallbackDias;
    if (inicio && fim) {
        const start = new Date(`${inicio}T00:00:00`);
        const end = new Date(`${fim}T00:00:00`);
        const diff = end.getTime() - start.getTime();
        if (!Number.isNaN(diff)) {
            dias = Math.max(1, Math.round(diff / 86_400_000) + 1);
        }
    }

    const totalPedidos = Number(ctx?.totalPedidos ?? 0) || 0;
    const totalValor = Number(ctx?.totalValor ?? 0) || 0;
    const totalValorLiquido = Number(ctx?.totalValorLiquido ?? totalValor) || 0;
    const totalFreteTotal = Number(ctx?.totalFreteTotal ?? 0) || 0;
    const ticketMedio = Number(ctx?.ticketMedio ?? 0) || 0;
    const previousTotalValor = Number(ctx?.previousTotalValor ?? 0) || 0;
    const deltaPercent =
        typeof ctx?.deltaPercent === 'number' && Number.isFinite(ctx.deltaPercent)
            ? ctx.deltaPercent
            : null;

    const current = {
        dataInicial: inicio,
        dataFinal: fim,
        dias,
        totalPedidos,
        totalValor,
        totalValorLiquido,
        totalFreteTotal,
        ticketMedio,
        vendasPorDia: vendasPorDia.map((item: any) => ({
            data: item?.dia ?? item?.data ?? '',
            totalDia: Number(item?.totalDia ?? item?.total ?? 0) || 0,
            quantidade: Number(item?.quantidade ?? 0) || 0,
        })),
        pedidosPorSituacao: [],
        totalProdutosVendidos: 0,
        percentualCancelados: 0,
        topProdutos: [],
        vendasPorHora: [],
    };

    const previous = {
        ...current,
        totalPedidos: 0,
        totalValor: previousTotalValor,
        totalValorLiquido: previousTotalValor,
        totalFreteTotal: 0,
        ticketMedio: 0,
    };

    const faturamentoDiff = {
        current: totalValor,
        previous: previousTotalValor,
        delta: totalValor - previousTotalValor,
        deltaPercent,
    };

    const pedidosDiff = {
        current: totalPedidos,
        previous: 0,
        delta: totalPedidos,
        deltaPercent: null,
    };

    const ticketDiff = {
        current: ticketMedio,
        previous: 0,
        delta: ticketMedio,
        deltaPercent: null,
    };

    return {
        current,
        previous,
        diffs: {
            faturamento: faturamentoDiff,
            pedidos: pedidosDiff,
            ticketMedio: ticketDiff,
        },
        canais: [],
        canaisDisponiveis: [],
        situacoesDisponiveis: [],
        mapaVendasUF: [],
        mapaVendasCidade: [],
        periodoAtual: current,
        periodoAnterior: previous,
        periodoAnteriorCards: previous,
    };
};

export function NerveCenter({ dashboardData, screenContext = null, filters, className = '' }: NerveCenterProps) {
    const [intelligence, setIntelligence] = useState<AIIntelligenceResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasAttempted, setHasAttempted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const dashboardContext = useMemo(() => {
        const ctx = screenContext?.context as { dashboard?: any } | undefined;
        return ctx?.dashboard ?? null;
    }, [screenContext]);

    const hasDashboardFromEvent = Boolean(dashboardData?.current);
    const hasDashboardContext = Boolean(dashboardContext);
    const dashboardDataForAi = useMemo(() => {
        if (hasDashboardContext) {
            return buildDashboardAiPayload(dashboardContext);
        }
        return dashboardData ?? null;
    }, [dashboardContext, dashboardData, hasDashboardContext]);

    // Extract metrics
    const preferDashboardContext = hasDashboardContext;
    const faturamento = preferDashboardContext
        ? dashboardContext?.totalValor || 0
        : dashboardData?.current?.totalValor || 0;
    const pedidos = preferDashboardContext
        ? dashboardContext?.totalPedidos || 0
        : dashboardData?.current?.totalPedidos || 0;
    const ticketMedio = preferDashboardContext
        ? dashboardContext?.ticketMedio || 0
        : dashboardData?.current?.ticketMedio || 0;
    const cancelamentos = preferDashboardContext
        ? dashboardContext?.percentualCancelados || 0
        : dashboardData?.current?.percentualCancelados || 0;
    const deltaPercent = preferDashboardContext
        ? dashboardContext?.deltaPercent || 0
        : dashboardData?.diffs?.faturamento?.deltaPercent || 0;
    const deltaTicket = preferDashboardContext
        ? null
        : dashboardData?.diffs?.ticketMedio?.deltaPercent || null;
    const deltaPedidos = preferDashboardContext
        ? null
        : dashboardData?.diffs?.pedidos?.deltaPercent || null;
    const hasDashboardData = hasDashboardFromEvent || hasDashboardContext;

    const animatedFaturamento = useAnimatedValue(faturamento, 1200);

    // Generate heatmap data from daily sales
    const heatmapData = useMemo(() => {
        const vendasPorDia = preferDashboardContext
            ? dashboardContext?.vendasPorDia
            : dashboardData?.current?.vendasPorDia;
        const source = Array.isArray(vendasPorDia) ? vendasPorDia : [];
        return source.slice(-7).map((d: any) => ({
            day: d.dia ?? d.data ?? '',
            value: d.totalDia ?? d.total ?? 0,
        }));
    }, [dashboardData, dashboardContext, preferDashboardContext]);

    const canais = preferDashboardContext ? dashboardContext?.canais : dashboardData?.canais;
    const canalDominante = Array.isArray(canais) && canais.length > 0 ? canais[0] : null;

    // Determine sentiment
    const sentimentLabelFromDelta = sentimentFromValue(deltaPercent);
    const sentiment = sentimentLabelFromDelta === 'positivo' ? 'positive' : sentimentLabelFromDelta === 'alerta' ? 'alert' : 'neutral';
    const pulseIntensity = Math.min(Math.abs(deltaPercent) / 20, 1);
    const sourceLabel = hasDashboardContext
        ? 'Fonte: Supabase'
        : hasDashboardFromEvent
            ? 'Fonte: Tiny → Supabase'
            : screenContext?.context
                ? 'Fonte: Supabase'
                : 'Fonte: IA';

    const contextHighlights = useMemo(() => {
        if (!screenContext?.context) return [];
        const ctx = screenContext.context as any;

        if (ctx?.produtos) {
            const produtos = ctx.produtos;
            return [
                { label: 'Produtos', value: produtos.total },
                { label: 'Baixo estoque', value: produtos.lowStock },
                { label: 'Ruptura', value: produtos.outOfStock },
            ];
        }

        if (ctx?.financeiro) {
            const financeiro = ctx.financeiro;
            return [
                { label: 'Receita bruta', value: `R$ ${Number(financeiro.receitaBruta || 0).toLocaleString('pt-BR')}` },
                { label: 'Receita líquida', value: `R$ ${Number(financeiro.receitaLiquida || 0).toLocaleString('pt-BR')}` },
            ];
        }

        if (ctx?.pedidos) {
            const pedidosCtx = ctx.pedidos;
            return [
                { label: 'Pedidos', value: pedidosCtx.totalPedidos },
                { label: 'Faturamento', value: `R$ ${Number(pedidosCtx.totalValor || 0).toLocaleString('pt-BR')}` },
            ];
        }

        return [];
    }, [screenContext]);

    const contextNote = useMemo(() => {
        const ctx = screenContext?.context as any;
        return typeof ctx?.nota === 'string' ? ctx.nota : null;
    }, [screenContext]);

    const fallbackSummary = useMemo(() => {
        const sentiment = sentimentFromValue(deltaPercent);
        const headline = sentiment === 'positivo'
            ? 'Receita acelerando no período'
            : sentiment === 'alerta'
                ? 'Receita em queda e exige ação'
                : 'Receita estável, foco em eficiência';
        const parts = [
            `${formatCompactCurrency(faturamento)} em ${formatNumber(Math.max(1, heatmapData.length))} dias`,
            `${formatNumber(pedidos)} pedidos`,
            `ticket médio ${formatCurrency(ticketMedio)}`,
        ];
        const deltaLabel = formatPercent(deltaPercent);
        if (deltaLabel) {
            parts.push(`vs período anterior ${deltaLabel}`);
        }
        return {
            manchete: headline,
            contexto: `${parts.join('. ')}.`,
            sentimento: sentiment,
        };
    }, [deltaPercent, faturamento, pedidos, ticketMedio, heatmapData.length]);

    const summary = intelligence?.resumoExecutivo?.manchete
        ? intelligence.resumoExecutivo
        : fallbackSummary;

    const signals = useMemo<AISignal[]>(() => {
        if (intelligence?.sinais?.length) return intelligence.sinais;
        const items: AISignal[] = [
            {
                titulo: 'Faturamento',
                valor: formatCurrency(faturamento),
                variacao: formatPercent(deltaPercent) ?? undefined,
                tipo: sentimentFromValue(deltaPercent),
            },
            {
                titulo: 'Pedidos',
                valor: formatNumber(pedidos),
                variacao: formatPercent(deltaPedidos) ?? undefined,
                tipo: sentimentFromValue(deltaPedidos),
            },
            {
                titulo: 'Ticket médio',
                valor: formatCurrency(ticketMedio),
                variacao: formatPercent(deltaTicket) ?? undefined,
                tipo: sentimentFromValue(deltaTicket),
            },
        ];
        if (canalDominante) {
            const nome = canalDominante?.nome ?? canalDominante?.canal ?? 'Canal';
            const participacao = canalDominante?.participacao;
            items.push({
                titulo: 'Canal dominante',
                valor: String(nome).substring(0, 32),
                variacao: typeof participacao === 'number' ? `${participacao.toFixed(0)}%` : undefined,
                tipo: 'neutro',
                origem: 'canal',
            });
        }
        if (cancelamentos) {
            items.push({
                titulo: 'Cancelamentos',
                valor: `${Number(cancelamentos).toFixed(1)}%`,
                tipo: cancelamentos >= 6 ? 'alerta' : 'neutro',
                origem: 'pedido',
            });
        }
        return items.slice(0, 6);
    }, [intelligence, faturamento, deltaPercent, pedidos, deltaPedidos, ticketMedio, deltaTicket, canalDominante, cancelamentos]);

    const drivers = useMemo<AIDriver[]>(() => {
        if (intelligence?.drivers?.length) return intelligence.drivers;
        if (intelligence?.insights?.length) {
            return intelligence.insights.slice(0, 4).map((insight) => ({
                titulo: insight.titulo,
                detalhe: insight.descricao,
                impacto: impactFromPriority(insight.prioridade),
                tendencia: insight.metrica?.trend ?? 'stable',
                evidencia: insight.metrica?.valor,
            }));
        }
        return [];
    }, [intelligence]);

    const actions = useMemo<AIAction[]>(() => {
        if (intelligence?.acoes?.length) return intelligence.acoes;
        if (intelligence?.insights?.length) {
            return intelligence.insights.slice(0, 4).map((insight) => ({
                titulo: insight.acao?.texto || insight.titulo,
                motivo: insight.descricao,
                urgencia: insight.acao?.urgencia || 'monitorar',
                impacto: impactFromPriority(insight.prioridade),
                cta: 'Detalhar',
                metrica: insight.metrica,
            }));
        }
        return [];
    }, [intelligence]);

    const quality = useMemo<AIDataQuality>(() => {
        if (intelligence?.qualidadeDados) return intelligence.qualidadeDados;
        const alerts = [];
        if (!hasDashboardData) {
            alerts.push({
                titulo: 'Sem base consolidada',
                detalhe: 'Ainda não há dados suficientes para a análise.',
                acao: 'Aguarde a sincronização',
            });
        }
        if (faturamento === 0 && pedidos === 0) {
            alerts.push({
                titulo: 'Sem vendas no período',
                detalhe: 'Não há faturamento nem pedidos para este intervalo.',
                acao: 'Ajustar filtros ou período',
            });
        }
        return {
            status: alerts.length ? 'atencao' : 'ok',
            alertas: alerts.slice(0, 3),
        };
    }, [intelligence, hasDashboardData, faturamento, pedidos]);

    const updatedAt = formatTime(intelligence?.generatedAt);
    const modelLabel = intelligence?.meta?.modelo;
    const originLabel = intelligence?.meta?.origem === 'fallback' ? 'Regras locais' : 'IA';
    const dataSourceLabel = intelligence?.meta?.fonteDados
        ? intelligence.meta.fonteDados === 'supabase'
            ? 'Base: Supabase'
            : intelligence.meta.fonteDados === 'mix'
                ? 'Base: Supabase + Dashboard'
                : 'Base: Dashboard'
        : null;
    const modelDisplay = modelLabel
        ? modelLabel.replace(/^gpt/i, 'GPT').replace(/-20\d{2}.*$/, '')
        : null;
    const showSkeleton = isLoading && !intelligence;
    const sentimentLabel = summary.sentimento === 'positivo'
        ? 'Em alta'
        : summary.sentimento === 'alerta'
            ? 'Atenção'
            : 'Estável';

    const fetchIntelligence = useCallback(async () => {
        if (!dashboardDataForAi) return;

        setIsLoading(true);
        setHasAttempted(true);
        setError(null);

        try {
            const periodDays = Math.max(
                7,
                Math.min(
                    Number(dashboardDataForAi?.current?.dias) || heatmapData.length || 30,
                    120
                )
            );
            const filtros = {
                canais: Array.isArray(filters?.canaisSelecionados)
                    ? Array.from(new Set(filters?.canaisSelecionados.filter((c) => typeof c === 'string')))
                    : undefined,
                situacoes: Array.isArray(filters?.situacoesSelecionadas)
                    ? Array.from(new Set(filters?.situacoesSelecionadas.filter((n) => typeof n === 'number')))
                    : undefined,
            };

            const response = await fetch('/api/ai/intelligence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dashboardData: dashboardDataForAi,
                    useDeepAnalysis: true,
                    periodDays,
                    filters: filtros,
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Erro ao gerar análise');
            }
            setIntelligence(data);
        } catch (err) {
            console.error('[NerveCenter] Error:', err);
            setError(err instanceof Error ? err.message : 'Erro ao gerar análise');
        } finally {
            setIsLoading(false);
        }
    }, [dashboardDataForAi, filters, heatmapData.length]);

    useEffect(() => {
        if (dashboardDataForAi && !hasAttempted) {
            fetchIntelligence();
        }
    }, [dashboardDataForAi, hasAttempted, fetchIntelligence]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleActionCta = useCallback((action: AIAction) => {
        setInput(action.titulo);
        inputRef.current?.focus();
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isThinking, scrollToBottom]);

    const appendAssistantMessage = useCallback((text: string) => {
        setMessages(prev => [...prev, { role: 'assistant', content: text }]);
    }, []);

    const executeActions = useCallback(async (actions: NerveAction[], policy: ActionPolicy) => {
        for (const action of actions) {
            const actionType = action.type;
            try {
                if (actionType === 'set_dashboard_filters') {
                    if (!policy.filters) {
                        appendAssistantMessage('Ajuste de filtros bloqueado nas configurações de IA.');
                        continue;
                    }

                    const detail = {
                        preset: typeof action.preset === 'string' ? action.preset : undefined,
                        customStart: typeof action.customStart === 'string' ? action.customStart : undefined,
                        customEnd: typeof action.customEnd === 'string' ? action.customEnd : undefined,
                        canaisSelecionados: toStringArray(action.canaisSelecionados ?? action.canais),
                        situacoesSelecionadas: toNumberArray(action.situacoesSelecionadas ?? action.situacoes),
                    };
                    window.dispatchEvent(new CustomEvent('ai:dashboard-filters', { detail }));
                    appendAssistantMessage('Filtros do dashboard atualizados pela IA.');
                    continue;
                }

                if (!policy.sync) {
                    appendAssistantMessage('Sync bloqueado nas configurações de IA.');
                    continue;
                }

                if (actionType === 'run_sync_pipeline') {
                    const ok = window.confirm('Confirmar execução do pipeline completo de sync?');
                    if (!ok) {
                        appendAssistantMessage('Execução cancelada.');
                        continue;
                    }
                    await fetch('/api/ai/actions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: {
                                type: 'run_sync_pipeline',
                                diasRecentes: typeof action.diasRecentes === 'number' ? action.diasRecentes : undefined,
                                enrichEnabled: typeof action.enrichEnabled === 'boolean' ? action.enrichEnabled : undefined,
                                produtosEnabled: typeof action.produtosEnabled === 'boolean' ? action.produtosEnabled : undefined,
                                produtosLimit: typeof action.produtosLimit === 'number' ? action.produtosLimit : undefined,
                                produtosEnrichEstoque: typeof action.produtosEnrichEstoque === 'boolean' ? action.produtosEnrichEstoque : undefined,
                                estoqueOnly: typeof action.estoqueOnly === 'boolean' ? action.estoqueOnly : undefined,
                            },
                            screen: typeof window !== 'undefined' ? window.location.pathname : null,
                        }),
                    });
                    appendAssistantMessage('Pipeline completo de sync disparado.');
                    continue;
                }

                if (actionType === 'sync_recent_orders') {
                    const diasRecentes = typeof action.diasRecentes === 'number' ? action.diasRecentes : 2;
                    const ok = window.confirm(`Confirmar sync de pedidos dos últimos ${diasRecentes} dias?`);
                    if (!ok) {
                        appendAssistantMessage('Execução cancelada.');
                        continue;
                    }
                    await fetch('/api/ai/actions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: { type: 'sync_recent_orders', diasRecentes },
                            screen: typeof window !== 'undefined' ? window.location.pathname : null,
                        }),
                    });
                    appendAssistantMessage(`Sync de pedidos recentes disparado (${diasRecentes} dias).`);
                    continue;
                }

                if (actionType === 'sync_orders_range') {
                    const dataInicial = typeof action.dataInicial === 'string'
                        ? action.dataInicial
                        : typeof action.inicio === 'string'
                            ? action.inicio
                            : null;
                    const dataFinal = typeof action.dataFinal === 'string'
                        ? action.dataFinal
                        : typeof action.fim === 'string'
                            ? action.fim
                            : null;

                    if (!dataInicial || !dataFinal) {
                        appendAssistantMessage('Não consegui identificar as datas para o sync por intervalo.');
                        continue;
                    }

                    const ok = window.confirm(`Confirmar sync de pedidos (${dataInicial} → ${dataFinal})?`);
                    if (!ok) {
                        appendAssistantMessage('Execução cancelada.');
                        continue;
                    }

                    await fetch('/api/ai/actions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: { type: 'sync_orders_range', dataInicial, dataFinal },
                            screen: typeof window !== 'undefined' ? window.location.pathname : null,
                        }),
                    });
                    appendAssistantMessage(`Sync de pedidos (${dataInicial} → ${dataFinal}) disparado.`);
                    continue;
                }

                if (actionType === 'sync_produtos') {
                    const ok = window.confirm('Confirmar sync de produtos?');
                    if (!ok) {
                        appendAssistantMessage('Execução cancelada.');
                        continue;
                    }
                    await fetch('/api/ai/actions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: {
                                type: 'sync_produtos',
                                limit: typeof action.limit === 'number' ? action.limit : undefined,
                                estoqueOnly: typeof action.estoqueOnly === 'boolean' ? action.estoqueOnly : undefined,
                                enrichEstoque: typeof action.enrichEstoque === 'boolean' ? action.enrichEstoque : undefined,
                            },
                            screen: typeof window !== 'undefined' ? window.location.pathname : null,
                        }),
                    });
                    appendAssistantMessage('Sync de produtos disparado.');
                    continue;
                }
            } catch (err) {
                console.error('[NerveCenter] Ação falhou:', err);
                appendAssistantMessage('Falha ao executar a ação solicitada.');
            }
        }
    }, [appendAssistantMessage]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isThinking) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsThinking(true);

        try {
            const response = await fetch('/api/ai/chat?stream=1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    conversationHistory: messages,
                    dashboardData: dashboardDataForAi,
                    screenContext,
                    stream: true,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                const rawMessage = typeof data?.message === 'string' ? data.message : 'Sem resposta disponível.';
                setMessages(prev => [...prev, { role: 'assistant', content: rawMessage }]);
                return;
            }

            if (!response.body) {
                const data = await response.json().catch(() => null);
                const rawMessage = typeof data?.message === 'string' ? data.message : 'Sem resposta disponível.';
                const policy: ActionPolicy = data?.actionPolicy ?? { sync: false, filters: false };
                const { message, actions } = parseActionTags(rawMessage);
                setMessages(prev => [...prev, { role: 'assistant', content: message }]);
                if (actions.length) {
                    await executeActions(actions, policy);
                }
                return;
            }

            let assistantText = '';
            let policy: ActionPolicy = { sync: false, filters: false };
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            const updateLastMessage = (content: string) => {
                setMessages(prev => {
                    if (!prev.length) return prev;
                    const next = [...prev];
                    const lastIndex = next.length - 1;
                    if (next[lastIndex]?.role === 'assistant') {
                        next[lastIndex] = { ...next[lastIndex], content };
                    }
                    return next;
                });
            };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let boundaryIndex = buffer.indexOf('\n\n');
                while (boundaryIndex !== -1) {
                    const event = buffer.slice(0, boundaryIndex);
                    buffer = buffer.slice(boundaryIndex + 2);
                    boundaryIndex = buffer.indexOf('\n\n');

                    const dataLines = event
                        .split('\n')
                        .filter((line) => line.startsWith('data:'))
                        .map((line) => line.replace(/^data:\s*/, '').trim());
                    const data = dataLines.join('');
                    if (!data) continue;

                    try {
                        const payload = JSON.parse(data) as { type?: string; content?: string; actionPolicy?: ActionPolicy };
                        if (payload.type === 'meta' && payload.actionPolicy) {
                            policy = payload.actionPolicy;
                            continue;
                        }
                        if (payload.type === 'delta' && payload.content) {
                            assistantText += payload.content;
                            updateLastMessage(assistantText);
                            continue;
                        }
                        if (payload.type === 'raw' && payload.content) {
                            assistantText += payload.content;
                            updateLastMessage(assistantText);
                            continue;
                        }
                        if (payload.type === 'done') {
                            break;
                        }
                    } catch {
                        assistantText += data;
                        updateLastMessage(assistantText);
                    }
                }
            }

            const { message, actions } = parseActionTags(assistantText);
            if (message !== assistantText) {
                updateLastMessage(message);
            }
            if (actions.length) {
                await executeActions(actions, policy);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, ocorreu um erro.' }]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <aside className={`nerve-center ${className}`}>
            <div className="nerve-header">
                <div className="nerve-title">
                    <Sparkles size={14} className="text-accent" />
                    <div>
                        <span className="nerve-title-text">Nerve Center</span>
                        <span className="nerve-title-sub">Inteligência operacional</span>
                    </div>
                </div>
                <div className="nerve-header-actions">
                    <span className={`nerve-chip sentiment-${summary.sentimento}`}>{sentimentLabel}</span>
                    <span className="nerve-chip">{sourceLabel}</span>
                    {dataSourceLabel && <span className="nerve-chip">{dataSourceLabel}</span>}
                    {modelDisplay && <span className="nerve-chip">{modelDisplay}</span>}
                    <button
                        onClick={fetchIntelligence}
                        disabled={isLoading}
                        className="nerve-refresh"
                    >
                        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="nerve-error">
                    <AlertTriangle size={14} />
                    <span>{error}</span>
                </div>
            )}

            <section className="nerve-hero">
                <div className="hero-summary">
                    <span className={`hero-badge sentiment-${summary.sentimento}`}>{sentimentLabel}</span>
                    <h2 className="hero-title">{summary.manchete}</h2>
                    <p className="hero-context">{summary.contexto}</p>
                    <div className="hero-meta">
                        {updatedAt && (
                            <span className="hero-meta-item">
                                <Clock size={12} />
                                Atualizado {updatedAt}
                            </span>
                        )}
                        <span className="hero-meta-item">{originLabel}</span>
                    </div>
                </div>
                <div className="hero-metric">
                    <span className="metric-label">Faturamento</span>
                    <div className="metric-value">{formatCurrency(animatedFaturamento)}</div>
                    <div className={`metric-delta ${deltaPercent >= 0 ? 'positive' : 'negative'}`}>
                        {deltaPercent >= 0 ? '▲' : '▼'} {Math.abs(deltaPercent).toFixed(1)}%
                    </div>
                </div>
            </section>

            {signals.length > 0 && (
                <div className="nerve-signal-grid">
                    {signals.map((signal, index) => (
                        <SignalChip key={`${signal.titulo}-${index}`} signal={signal} />
                    ))}
                </div>
            )}

            <section className="nerve-pulse">
                {hasDashboardData ? (
                    <>
                        <BusinessPulse intensity={pulseIntensity} sentiment={sentiment} />
                        {heatmapData.length > 0 && (
                            <WeeklyHeatmap data={heatmapData} />
                        )}
                    </>
                ) : (
                    <div className="nerve-placeholder">
                        <span className="placeholder-dot" />
                        <div>
                            <p className="placeholder-title">Contexto dinâmico ativo</p>
                            <p className="placeholder-text">
                                A IA ajusta o foco com base na tela atual e nos dados do Supabase.
                            </p>
                        </div>
                    </div>
                )}
            </section>

            <section className="nerve-section">
                <SectionHeader title="Drivers do período" subtitle="O que puxou o resultado" badge={originLabel} />
                {showSkeleton ? (
                    <div className="nerve-skeleton-stack">
                        <div className="nerve-skeleton-line" />
                        <div className="nerve-skeleton-line" />
                        <div className="nerve-skeleton-line" />
                    </div>
                ) : drivers.length ? (
                    <div className="driver-grid">
                        {drivers.map((driver, index) => (
                            <DriverCard key={`${driver.titulo}-${index}`} driver={driver} />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        title="Sem drivers claros"
                        description="Ainda não há sinal suficiente para explicar o movimento."
                    />
                )}
            </section>

            <section className="nerve-section">
                <SectionHeader title="Ações priorizadas" subtitle="Próximos passos recomendados" />
                {showSkeleton ? (
                    <div className="nerve-skeleton-grid">
                        <div className="nerve-skeleton-card" />
                        <div className="nerve-skeleton-card" />
                    </div>
                ) : actions.length ? (
                    <div className="action-grid">
                        {actions.map((action, index) => (
                            <ActionCard key={`${action.titulo}-${index}`} action={action} onCta={handleActionCta} />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        title="Sem ações sugeridas"
                        description="Confirme os dados para gerar recomendações acionáveis."
                    />
                )}
            </section>

            {(contextHighlights.length > 0 || contextNote) && (
                <section className="nerve-section">
                    <SectionHeader title="Contexto da tela" subtitle="Sinais específicos do módulo" />
                    <div className="nerve-context-card">
                        {contextHighlights.map((item) => (
                            <div key={item.label} className="context-row">
                                <span className="context-label">{item.label}</span>
                                <span className="context-value">{item.value}</span>
                            </div>
                        ))}
                        {contextNote && (
                            <div className="context-note">{contextNote}</div>
                        )}
                    </div>
                </section>
            )}

            <section className="nerve-section">
                <SectionHeader
                    title="Qualidade dos dados"
                    subtitle="Confiança da análise"
                    badge={quality.status === 'ok' ? 'Confiável' : quality.status === 'critico' ? 'Crítico' : 'Atenção'}
                />
                <QualityPanel quality={quality} />
            </section>

            <section className="nerve-chat">
                {messages.length > 0 && (
                    <div className="nerve-messages">
                        {messages.map((msg, i) => (
                            <div key={i} className={`nerve-message ${msg.role}`}>
                                {msg.content}
                            </div>
                        ))}
                        {isThinking && (
                            <div className="nerve-message assistant thinking">
                                <span className="loading-dot" />
                                <span className="loading-dot" />
                                <span className="loading-dot" />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                <form onSubmit={handleSendMessage} className="nerve-input">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Pergunte algo..."
                        disabled={isThinking}
                        ref={inputRef}
                    />
                    <button type="submit" disabled={!input.trim() || isThinking}>
                        <Send size={14} />
                    </button>
                </form>
            </section>
        </aside>
    );
}

export default NerveCenter;
