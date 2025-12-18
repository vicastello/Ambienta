'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    TrendingUp, TrendingDown, DollarSign, CreditCard, Clock, AlertTriangle,
    BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Loader2, RefreshCw,
    Calendar, Building
} from 'lucide-react';
import { cn } from '@/lib/utils';

type KPIs = {
    income: number;
    expenses: number;
    netCashFlow: number;
    pendingIncome: number;
    pendingExpenses: number;
    netPending: number;
    ordersTotal: number;
    ordersPaid: number;
    ordersPending: number;
    ordersOverdue: number;
    paymentRate: number | string;
};

type CategoryData = {
    name: string;
    income: number;
    expense: number;
    total: number;
};

type TrendData = {
    date: string;
    income: number;
    expense: number;
    orders: number;
};

type Projection = {
    projectedIncome: number;
    projectedExpenses: number;
    projectedNet: number;
    weeks: { week: number; income: number; expense: number }[];
};

type TopEntity = {
    name: string;
    count: number;
    total: number;
    type: string;
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatCompact = (value: number) => {
    if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'k';
    }
    return value.toFixed(0);
};

export function FinancialDashboard() {
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
    const [kpis, setKpis] = useState<KPIs | null>(null);
    const [categories, setCategories] = useState<CategoryData[]>([]);
    const [trendData, setTrendData] = useState<TrendData[]>([]);
    const [projection, setProjection] = useState<Projection | null>(null);
    const [topEntities, setTopEntities] = useState<TopEntity[]>([]);

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/financeiro/analytics?period=${period}`);
            const data = await res.json();
            setKpis(data.kpis);
            setCategories(data.categoryBreakdown || []);
            setTrendData(data.trendData || []);
            setProjection(data.projection);
            setTopEntities(data.topEntities || []);
        } catch (err) {
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    if (loading || !kpis) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    const maxTrendValue = Math.max(...trendData.flatMap(d => [d.income, d.expense, d.orders])) || 1;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-primary-500" />
                        Dashboard Financeiro
                    </h2>
                    <p className="text-sm text-slate-500">
                        Visão geral do fluxo de caixa
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as any)}
                        className="app-input text-sm"
                    >
                        <option value="monthly">Mensal</option>
                        <option value="weekly">Semanal</option>
                    </select>
                    <button
                        onClick={fetchAnalytics}
                        disabled={loading}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Receitas Confirmadas"
                    value={kpis.income}
                    icon={TrendingUp}
                    iconColor="text-emerald-500"
                    bgColor="bg-emerald-500/10"
                />
                <KPICard
                    title="Despesas Confirmadas"
                    value={kpis.expenses}
                    icon={TrendingDown}
                    iconColor="text-rose-500"
                    bgColor="bg-rose-500/10"
                />
                <KPICard
                    title="Saldo Líquido"
                    value={kpis.netCashFlow}
                    icon={DollarSign}
                    iconColor={kpis.netCashFlow >= 0 ? "text-emerald-500" : "text-rose-500"}
                    bgColor={kpis.netCashFlow >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10"}
                    highlight
                />
                <KPICard
                    title="Taxa Recebimento"
                    value={null}
                    customValue={`${kpis.paymentRate}%`}
                    icon={CreditCard}
                    iconColor="text-blue-500"
                    bgColor="bg-blue-500/10"
                />
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MiniKPI
                    label="Receitas Pendentes"
                    value={kpis.pendingIncome}
                    icon={Clock}
                    trend="up"
                />
                <MiniKPI
                    label="Despesas Pendentes"
                    value={kpis.pendingExpenses}
                    icon={Clock}
                    trend="down"
                />
                <MiniKPI
                    label="Pedidos Pendentes"
                    value={kpis.ordersPending}
                    icon={Clock}
                />
                <MiniKPI
                    label="Pedidos Atrasados"
                    value={kpis.ordersOverdue}
                    icon={AlertTriangle}
                    alert
                />
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Trend Chart */}
                <div className="glass-panel glass-tint p-6 rounded-2xl border border-white/40 dark:border-white/10">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-primary-500" />
                        Evolução {period === 'monthly' ? 'Mensal' : 'Semanal'}
                    </h3>
                    <div className="h-48 flex items-end gap-2">
                        {trendData.slice(-8).map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <div className="w-full flex gap-0.5 h-40 items-end">
                                    <div
                                        className="flex-1 bg-emerald-500 rounded-t-sm"
                                        style={{ height: `${(d.income / maxTrendValue) * 100}%` }}
                                        title={`Receita: ${formatCurrency(d.income)}`}
                                    />
                                    <div
                                        className="flex-1 bg-rose-500 rounded-t-sm"
                                        style={{ height: `${(d.expense / maxTrendValue) * 100}%` }}
                                        title={`Despesa: ${formatCurrency(d.expense)}`}
                                    />
                                </div>
                                <span className="text-[10px] text-slate-400 truncate max-w-full">
                                    {d.date.split('-').slice(-1)[0]}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-center gap-6 mt-4 text-xs">
                        <span className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                            Receitas
                        </span>
                        <span className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm bg-rose-500" />
                            Despesas
                        </span>
                    </div>
                </div>

                {/* Category Breakdown */}
                <div className="glass-panel glass-tint p-6 rounded-2xl border border-white/40 dark:border-white/10">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-primary-500" />
                        Por Categoria
                    </h3>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                        {categories.slice(0, 6).map((cat, i) => {
                            const total = categories.reduce((s, c) => s + c.total, 0) || 1;
                            const percent = ((cat.total / total) * 100);
                            return (
                                <div key={i}>
                                    <div className="flex items-center justify-between text-sm mb-1">
                                        <span className="font-medium truncate">{cat.name}</span>
                                        <span className="text-slate-500">{formatCompact(cat.total)}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Projection */}
                {projection && (
                    <div className="glass-panel glass-tint p-6 rounded-2xl border border-white/40 dark:border-white/10">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-primary-500" />
                            Projeção 30 Dias
                        </h3>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="text-center p-3 bg-emerald-500/10 rounded-xl">
                                <p className="text-xs text-slate-500 mb-1">Receitas</p>
                                <p className="font-bold text-emerald-600">{formatCompact(projection.projectedIncome)}</p>
                            </div>
                            <div className="text-center p-3 bg-rose-500/10 rounded-xl">
                                <p className="text-xs text-slate-500 mb-1">Despesas</p>
                                <p className="font-bold text-rose-600">{formatCompact(projection.projectedExpenses)}</p>
                            </div>
                            <div className={cn(
                                "text-center p-3 rounded-xl",
                                projection.projectedNet >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10"
                            )}>
                                <p className="text-xs text-slate-500 mb-1">Saldo</p>
                                <p className={cn(
                                    "font-bold",
                                    projection.projectedNet >= 0 ? "text-emerald-600" : "text-rose-600"
                                )}>
                                    {formatCompact(projection.projectedNet)}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {projection.weeks.map((w, i) => (
                                <div key={i} className="flex-1 text-center p-2 bg-slate-50 dark:bg-white/5 rounded-lg">
                                    <p className="text-xs text-slate-400">Sem {w.week}</p>
                                    <p className="text-xs font-medium mt-1">
                                        <span className="text-emerald-500">+{formatCompact(w.income)}</span>
                                        {' / '}
                                        <span className="text-rose-500">-{formatCompact(w.expense)}</span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Top Entities */}
                <div className="glass-panel glass-tint p-6 rounded-2xl border border-white/40 dark:border-white/10">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Building className="w-5 h-5 text-primary-500" />
                        Top Clientes/Fornecedores
                    </h3>
                    {topEntities.length > 0 ? (
                        <div className="space-y-3">
                            {topEntities.map((ent, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                                            ent.type === 'income' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                                        )}>
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium truncate max-w-[150px]">{ent.name}</p>
                                            <p className="text-xs text-slate-400">{ent.count} entrada{ent.count > 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    <span className={cn(
                                        "font-medium",
                                        ent.type === 'income' ? "text-emerald-600" : "text-rose-600"
                                    )}>
                                        {formatCurrency(ent.total)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-8">
                            Nenhuma entidade registrada
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// KPI Card Component
function KPICard({
    title,
    value,
    customValue,
    icon: Icon,
    iconColor,
    bgColor,
    highlight
}: {
    title: string;
    value: number | null;
    customValue?: string;
    icon: any;
    iconColor: string;
    bgColor: string;
    highlight?: boolean;
}) {
    return (
        <div className={cn(
            "glass-panel glass-tint p-4 rounded-2xl border transition-all",
            highlight
                ? "border-primary-500/40 shadow-lg shadow-primary-500/10"
                : "border-white/40 dark:border-white/10"
        )}>
            <div className="flex items-start justify-between mb-3">
                <div className={cn("p-2 rounded-xl", bgColor)}>
                    <Icon className={cn("w-5 h-5", iconColor)} />
                </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-2xl font-bold mt-1">
                {customValue || formatCurrency(value || 0)}
            </p>
        </div>
    );
}

// Mini KPI Component
function MiniKPI({
    label,
    value,
    icon: Icon,
    trend,
    alert
}: {
    label: string;
    value: number;
    icon: any;
    trend?: 'up' | 'down';
    alert?: boolean;
}) {
    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-xl",
            alert ? "bg-rose-50 dark:bg-rose-950/20" : "bg-slate-50 dark:bg-white/5"
        )}>
            <Icon className={cn(
                "w-5 h-5",
                alert ? "text-rose-500" : trend === 'up' ? "text-emerald-500" : trend === 'down' ? "text-rose-500" : "text-slate-400"
            )} />
            <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 truncate">{label}</p>
                <p className={cn(
                    "font-semibold",
                    alert && "text-rose-600"
                )}>
                    {formatCurrency(value)}
                </p>
            </div>
            {trend && (
                <div className={cn(
                    "p-1 rounded",
                    trend === 'up' ? "text-emerald-500" : "text-rose-500"
                )}>
                    {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </div>
            )}
        </div>
    );
}
