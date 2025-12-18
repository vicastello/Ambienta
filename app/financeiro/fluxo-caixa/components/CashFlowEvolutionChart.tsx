'use client';

import { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    Cell
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Order {
    id: number;
    valor: number;
    data_pedido: string;
    status_pagamento: 'pago' | 'pendente' | 'atrasado';
}

interface CashFlowEvolutionChartProps {
    orders: Order[];
    loading?: boolean;
}

const formatCurrency = (value: number) => {
    if (value >= 1000) {
        return `R$ ${(value / 1000).toFixed(1)}k`;
    }
    return `R$ ${value.toFixed(0)}`;
};

// Custom tooltip
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;

    return (
        <div className="glass-panel glass-tint p-4 rounded-xl border border-white/20 dark:border-white/10 shadow-xl">
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{label}</p>
            {payload.map((entry: any, index: number) => (
                <div key={index} className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2">
                        <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(entry.value)}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function CashFlowEvolutionChart({ orders, loading }: CashFlowEvolutionChartProps) {
    const chartData = useMemo(() => {
        if (!orders?.length) return [];

        // Group by week for last 8 weeks
        const weeks: { start: Date; end: Date; label: string }[] = [];
        const today = new Date();

        for (let i = 7; i >= 0; i--) {
            const weekStart = subDays(today, i * 7 + 6);
            const weekEnd = subDays(today, i * 7);
            weeks.push({
                start: startOfDay(weekStart),
                end: endOfDay(weekEnd),
                label: i === 0 ? 'Esta semana' : i === 1 ? 'Semana passada' : format(weekStart, 'dd/MM', { locale: ptBR })
            });
        }

        return weeks.map(week => {
            const weekOrders = orders.filter(order => {
                const orderDate = parseISO(order.data_pedido);
                return orderDate >= week.start && orderDate <= week.end;
            });

            const recebido = weekOrders
                .filter(o => o.status_pagamento === 'pago')
                .reduce((sum, o) => sum + o.valor, 0);

            const pendente = weekOrders
                .filter(o => o.status_pagamento === 'pendente')
                .reduce((sum, o) => sum + o.valor, 0);

            const atrasado = weekOrders
                .filter(o => o.status_pagamento === 'atrasado')
                .reduce((sum, o) => sum + o.valor, 0);

            return {
                label: week.label,
                Recebido: recebido,
                Pendente: pendente,
                Atrasado: atrasado,
                total: recebido + pendente + atrasado
            };
        });
    }, [orders]);

    if (loading) {
        return (
            <div className="h-80 rounded-3xl glass-panel glass-tint border border-white/40 dark:border-white/10 animate-pulse" />
        );
    }

    if (!chartData.length || chartData.every(d => d.total === 0)) {
        return (
            <div className="h-80 rounded-3xl glass-panel glass-tint border border-white/40 dark:border-white/10 flex items-center justify-center">
                <p className="text-slate-500">Sem dados para exibir o gráfico</p>
            </div>
        );
    }

    return (
        <div className="rounded-3xl glass-panel glass-tint border border-white/40 dark:border-white/10 p-6">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Evolução Semanal
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Distribuição de status por semana (últimas 8 semanas)
                </p>
            </div>

            <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barCategoryGap="20%">
                        <defs>
                            <linearGradient id="barRecebido" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0.6} />
                            </linearGradient>
                            <linearGradient id="barPendente" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.6} />
                            </linearGradient>
                            <linearGradient id="barAtrasado" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(148, 163, 184, 0.2)"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="label"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            tickFormatter={formatCurrency}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            wrapperStyle={{ paddingTop: 16 }}
                            iconType="circle"
                            iconSize={8}
                        />
                        <Bar
                            dataKey="Recebido"
                            fill="url(#barRecebido)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                        />
                        <Bar
                            dataKey="Pendente"
                            fill="url(#barPendente)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                        />
                        <Bar
                            dataKey="Atrasado"
                            fill="url(#barAtrasado)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
