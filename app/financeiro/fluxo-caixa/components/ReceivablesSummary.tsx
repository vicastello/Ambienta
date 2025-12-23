'use client';

import { ArrowUpCircle, AlertCircle, Clock, Wallet, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface ReceivablesSummaryProps {
    summary: {
        recebido: number;
        pendente: number;
        atrasado: number;
        total: number;
        expenses?: {
            total: number;
            paid: number;
            pending: number;
            overdue: number;
        };
        sparklines?: {
            total: number[];
            recebido: number[];
            pendente: number[];
            atrasado: number[];
            saidas: number[];
        };
    } | null;
    loading?: boolean;
}

const formatBRL = (value: number | null | undefined) => {
    return (value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const formatCompact = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toFixed(0);
};

// Simple sparkline component using Recharts
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
    const chartData = useMemo(() => data.map((val, i) => ({ i, val })), [data]);

    // Don't render if no variations
    if (data.every(v => v === 0)) return null;

    return (
        <div className="w-20 h-8 opacity-80" onClick={(e) => e.stopPropagation()}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <Line
                        type="monotone"
                        dataKey="val"
                        stroke={color}
                        strokeWidth={1}
                        dot={false}
                        isAnimationActive={true}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

// Forecast card component
function ForecastCard({ summary }: { summary: ReceivablesSummaryProps['summary'] }) {
    const forecast = useMemo(() => {
        if (!summary) return null;

        // Simple forecast: pending payments expected in next 30 days
        const expectedIn7Days = summary.pendente * 0.3;
        const expectedIn30Days = summary.pendente * 0.85;
        const potentialIncome = summary.pendente + summary.atrasado;

        // Trend simulation based on pending vs atrasado ratio
        const healthScore = summary.pendente > 0
            ? (summary.pendente - summary.atrasado) / summary.pendente
            : 1;

        return {
            in7Days: expectedIn7Days,
            in30Days: expectedIn30Days,
            potential: potentialIncome,
            health: healthScore,
            isHealthy: healthScore > 0.5
        };
    }, [summary]);

    if (!forecast) return null;

    return (
        <div className="col-span-full lg:col-span-2 rounded-[28px] p-5 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border border-indigo-300/30 dark:border-indigo-500/20">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted font-medium mb-1">Projeção de Recebimentos</p>
                    <p className="text-sm text-muted">Estimativa baseada nos vencimentos pendentes</p>
                </div>
                <div className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                    forecast.isHealthy
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                        : "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
                )}>
                    {forecast.isHealthy ? (
                        <TrendingUp className="w-3 h-3" />
                    ) : (
                        <TrendingDown className="w-3 h-3" />
                    )}
                    {forecast.isHealthy ? 'Saudável' : 'Atenção'}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-xl bg-white/30 dark:bg-white/5">
                    <Calendar className="w-4 h-4 mx-auto mb-1 text-indigo-500" />
                    <p className="text-xs text-muted mb-1">Em 7 dias</p>
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        {formatBRL(forecast.in7Days)}
                    </p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/30 dark:bg-white/5">
                    <Calendar className="w-4 h-4 mx-auto mb-1 text-indigo-500" />
                    <p className="text-xs text-muted mb-1">Em 30 dias</p>
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        {formatBRL(forecast.in30Days)}
                    </p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/30 dark:bg-white/5">
                    <Wallet className="w-4 h-4 mx-auto mb-1 text-indigo-500" />
                    <p className="text-xs text-muted mb-1">Potencial Total</p>
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        {formatBRL(forecast.potential)}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function ReceivablesSummary({ summary, loading }: ReceivablesSummaryProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleCardClick = (status: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (status) {
            // Map filterValue to API statusPagamento values
            let apiValue = status;
            if (status === 'pago') apiValue = 'pagos';
            else if (status === 'pendente') apiValue = 'pendentes';
            else if (status === 'atrasado') apiValue = 'pendentes'; // atrasado is within pendentes

            params.set('statusPagamento', apiValue);
        } else {
            params.delete('statusPagamento');
        }
        params.delete('page');
        router.push(`?${params.toString()}`);
    };

    // Use real sparkline data from API or fall back to empty array
    const sparklineData = useMemo(() => ({
        total: summary?.sparklines?.total || [],
        recebido: summary?.sparklines?.recebido || [],
        pendente: summary?.sparklines?.pendente || [],
        atrasado: summary?.sparklines?.atrasado || [],
        saidas: summary?.sparklines?.saidas || [],
    }), [summary]);

    if (loading || !summary) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-32 rounded-[28px] glass-panel glass-tint border border-white/40 dark:border-white/10 animate-pulse bg-white/5" />
                ))}
            </div>
        );
    }

    const currentStatusPagamento = searchParams.get('statusPagamento');

    // Convert back to internal filterValue for UI state
    const currentStatus = currentStatusPagamento === 'pagos' ? 'pago'
        : currentStatusPagamento === 'pendentes' ? 'pendente' // could be pendente or atrasado, we'll simplify
            : null;

    const cards = [
        {
            label: 'Total no Período',
            value: summary.total,
            icon: Wallet,
            iconColor: 'text-slate-500',
            bgGradient: 'from-slate-500/10 to-slate-600/5',
            borderColor: 'border-slate-300/50 dark:border-slate-500/30',
            valueColor: 'text-slate-700 dark:text-slate-200',
            subtext: 'Saldo (Entradas - Saídas)',
            filterValue: null,
            sparkline: sparklineData.total,
            sparklineColor: '#64748b',
        },
        {
            label: 'Recebido',
            value: summary.recebido,
            icon: ArrowUpCircle,
            iconColor: 'text-emerald-500',
            bgGradient: 'from-emerald-500/15 to-emerald-600/5',
            borderColor: 'border-emerald-300/50 dark:border-emerald-500/30',
            valueColor: 'text-emerald-600 dark:text-emerald-400',
            subtext: 'Pagamentos confirmados',
            filterValue: 'pago',
            sparkline: sparklineData.recebido,
            sparklineColor: '#10b981',
        },
        {
            label: 'Pendente',
            value: summary.pendente,
            icon: Clock,
            iconColor: 'text-amber-500',
            bgGradient: 'from-amber-500/15 to-amber-600/5',
            borderColor: 'border-amber-300/50 dark:border-amber-500/30',
            valueColor: 'text-amber-600 dark:text-amber-400',
            subtext: 'Aguardando pagamento',
            filterValue: 'pendente',
            sparkline: sparklineData.pendente,
            sparklineColor: '#f59e0b',
        },
        {
            label: 'Atrasado',
            value: summary.atrasado,
            icon: AlertCircle,
            iconColor: 'text-rose-500',
            bgGradient: 'from-rose-500/15 to-rose-600/5',
            borderColor: 'border-rose-300/50 dark:border-rose-500/30',
            valueColor: 'text-rose-600 dark:text-rose-400',
            subtext: 'Vencimento excedido',
            filterValue: 'atrasado',
            sparkline: sparklineData.atrasado,
            sparklineColor: '#ef4444',
        },
        {
            label: 'Saídas (Despesas)',
            value: summary.expenses?.total ?? 0,
            icon: TrendingDown,
            iconColor: 'text-purple-500',
            bgGradient: 'from-purple-500/15 to-purple-600/5',
            borderColor: 'border-purple-300/50 dark:border-purple-500/30',
            valueColor: 'text-purple-600 dark:text-purple-400',
            subtext: `Pendente: ${summary.expenses ? formatBRL(summary.expenses.pending + summary.expenses.overdue) : 'R$ 0,00'}`,
            filterValue: 'expense',
            sparkline: sparklineData.saidas,
            sparklineColor: '#a855f7',
        }
    ];

    return (
        <div className="space-y-4">
            {/* Main summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {cards.map((card, idx) => {
                    const Icon = card.icon;
                    const isActive = currentStatus === card.filterValue || (currentStatus === null && card.filterValue === null);
                    return (
                        <button
                            key={idx}
                            onClick={() => card.filterValue !== 'expense' && handleCardClick(card.filterValue)}
                            className={cn(
                                "rounded-[28px] p-5 flex flex-col justify-between text-left transition-all duration-200",
                                "bg-gradient-to-br border",
                                card.bgGradient,
                                card.borderColor,
                                "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]",
                                isActive && "ring-2 ring-offset-2 ring-offset-background",
                                isActive && card.filterValue === 'pago' && "ring-emerald-500",
                                isActive && card.filterValue === 'pendente' && "ring-amber-500",
                                isActive && card.filterValue === 'atrasado' && "ring-rose-500",
                                isActive && card.filterValue === null && "ring-slate-400",
                                card.filterValue === 'expense' && "cursor-default active:scale-100 hover:scale-100 hover:shadow-none"
                            )}
                        >
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs uppercase tracking-wide text-muted font-medium">{card.label}</p>
                                    <Icon className={cn("w-5 h-5", card.iconColor)} />
                                </div>
                                <div className="flex items-end justify-between">
                                    <p className={cn("text-2xl font-bold", card.valueColor)}>
                                        {formatBRL(card.value)}
                                    </p>
                                    <MiniSparkline data={card.sparkline} color={card.sparklineColor} />
                                </div>
                            </div>
                            <p className="text-xs text-muted/80 mt-3">
                                {card.subtext}
                            </p>
                        </button>
                    );
                })}
            </div>

            {/* Forecast card - only show if there are pending/overdue amounts */}
            {(summary.pendente > 0 || summary.atrasado > 0) && (
                <ForecastCard summary={summary} />
            )}
        </div>
    );
}
