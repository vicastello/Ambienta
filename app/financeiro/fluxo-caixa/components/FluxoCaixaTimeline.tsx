'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

type TimelineData = {
    dia: string;
    label: string;
    receitasProjetadas: number;
    despesasProjetadas: number;
    saldo: number;
};

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};

export function FluxoCaixaTimeline({
    aReceber,
    aPagar
}: {
    aReceber: { total: number; proximos7dias: number; proximos30dias: number };
    aPagar: { total: number; proximos7dias: number; proximos30dias: number };
}) {
    // Gerar dados para 90 dias
    const hoje = new Date();
    const data: TimelineData[] = [];

    for (let i = 0; i <= 90; i += 7) {
        const dia = new Date(hoje.getTime() + i * 24 * 60 * 60 * 1000);
        const label = i === 0 ? 'Hoje' : `${i}d`;

        // Projeção simplificada: distribuir uniformemente
        let receitasProjetadas = 0;
        let despesasProjetadas = 0;

        if (i <= 7) {
            receitasProjetadas = aReceber.proximos7dias / 7 * (7 - i);
            despesasProjetadas = aPagar.proximos7dias / 7 * (7 - i);
        } else if (i <= 30) {
            receitasProjetadas = aReceber.proximos30dias / 30 * (30 - i);
            despesasProjetadas = aPagar.proximos30dias / 30 * (30 - i);
        } else if (i <= 60) {
            // Estimativa: 80% do mensal
            receitasProjetadas = (aReceber.proximos30dias * 0.8) / 30 * (60 - i);
            despesasProjetadas = (aPagar.proximos30dias * 0.8) / 30 * (60 - i);
        } else {
            // Estimativa: 60% do mensal
            receitasProjetadas = (aReceber.proximos30dias * 0.6) / 30 * (90 - i);
            despesasProjetadas = (aPagar.proximos30dias * 0.6) / 30 * (90 - i);
        }

        const saldo = receitasProjetadas - despesasProjetadas;

        data.push({
            dia: dia.toISOString().split('T')[0],
            label,
            receitasProjetadas,
            despesasProjetadas,
            saldo,
        });
    }

    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload || !payload[0]) return null;

        const data = payload[0].payload as TimelineData;

        return (
            <div className="glass-panel glass-tint p-3 rounded-xl border border-white/20 dark:border-white/10">
                <p className="font-semibold text-sm text-main mb-2">{data.label}</p>
                <div className="space-y-1 text-xs">
                    <p className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                            Receitas:
                        </span>
                        <span className="font-semibold text-emerald-500">{formatBRL(data.receitasProjetadas)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                            Despesas:
                        </span>
                        <span className="font-semibold text-orange-500">{formatBRL(data.despesasProjetadas)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-4 pt-1 border-t border-white/10">
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-accent"></span>
                            Saldo:
                        </span>
                        <span className={`font-semibold ${data.saldo >= 0 ? 'text-accent' : 'text-rose-500'}`}>
                            {formatBRL(data.saldo)}
                        </span>
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="h-[400px] w-full">
            <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                    />
                    <YAxis
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        wrapperStyle={{ fontSize: '14px' }}
                        iconType="circle"
                    />
                    <Area
                        type="monotone"
                        dataKey="receitasProjetadas"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#colorReceitas)"
                        name="Receitas Projetadas"
                    />
                    <Area
                        type="monotone"
                        dataKey="despesasProjetadas"
                        stroke="#f97316"
                        strokeWidth={2}
                        fill="url(#colorDespesas)"
                        name="Despesas Projetadas"
                    />
                    <Line
                        type="monotone"
                        dataKey="saldo"
                        stroke="var(--color-accent)"
                        strokeWidth={3}
                        dot={false}
                        name="Saldo Projetado"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
