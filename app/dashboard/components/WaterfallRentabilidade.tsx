'use client';

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';

type DataPoint = {
    name: string;
    value: number;
    color: string;
    type: 'positive' | 'negative' | 'total';
};

const formatBRL = (value: number) => {
    return Math.abs(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    });
};

export function WaterfallRentabilidade({
    data
}: {
    data: {
        receitaBruta: number;
        frete: number;
        margemBruta: number;
        despesasOp: number;
        lucroLiquido: number;
    }
}) {
    const receitaLiquida = data.receitaBruta - data.frete;
    const cmv = receitaLiquida - data.margemBruta;

    const waterfallData: DataPoint[] = [
        {
            name: 'Receita Bruta',
            value: data.receitaBruta,
            color: '#0ea5e9', // sky-500
            type: 'total',
        },
        {
            name: '- Frete',
            value: -data.frete,
            color: '#f97316', // orange-500
            type: 'negative',
        },
        {
            name: 'Receita Líquida',
            value: receitaLiquida,
            color: '#0ea5e9',
            type: 'total',
        },
        {
            name: '- CMV (est)',
            value: -cmv,
            color: '#f97316',
            type: 'negative',
        },
        {
            name: 'Margem Bruta',
            value: data.margemBruta,
            color: '#10b981', // emerald-500
            type: 'positive',
        },
        {
            name: '- Despesas Op',
            value: -data.despesasOp,
            color: '#f97316',
            type: 'negative',
        },
        {
            name: 'Lucro Líquido',
            value: data.lucroLiquido,
            color: data.lucroLiquido >= 0 ? '#10b981' : '#ef4444', // emerald-500 ou red-500
            type: 'total',
        },
    ];

    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload || !payload[0]) return null;

        const dataPoint = payload[0].payload as DataPoint;
        const value = dataPoint.value;
        const isNegative = value < 0;

        return (
            <div className="glass-panel glass-tint p-3 rounded-xl border border-white/20 dark:border-white/10">
                <p className="font-semibold text-sm text-main mb-1">{dataPoint.name}</p>
                <p className="text-lg font-bold" style={{ color: dataPoint.color }}>
                    {isNegative && '- '}{formatBRL(value)}
                </p>
            </div>
        );
    };

    return (
        <div className="h-[400px] w-full">
            <ResponsiveContainer>
                <BarChart
                    data={waterfallData}
                    margin={{ top: 20, right: 30, bottom: 80, left: 60 }}
                >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                    />
                    <YAxis
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine
                        y={0}
                        stroke="var(--text-muted)"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {waterfallData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.color}
                                opacity={entry.type === 'total' ? 1 : 0.85}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
