'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingDown } from 'lucide-react';

interface MarketplaceFeeComparisonProps {
    shopeeRate: number;
    mercadoLivreRate: number;
    magaluRate: number;
    testValue?: number;
}

export function MarketplaceFeeComparison({
    shopeeRate,
    mercadoLivreRate,
    magaluRate,
    testValue = 100,
}: MarketplaceFeeComparisonProps) {
    const calculateNet = (marketplace: string, rate: number) => {
        const commission = (testValue * rate) / 100;
        let fixedCost = 0;

        // Simple approximation for fixed costs
        if (marketplace === 'Shopee') fixedCost = 4;
        else if (marketplace === 'Mercado Livre') fixedCost = testValue < 79 ? 5 : testValue < 140 ? 9 : 13;
        else if (marketplace === 'Magalu') fixedCost = 4;

        const totalFees = commission + fixedCost;
        return testValue - totalFees;
    };

    const data = [
        {
            marketplace: 'Shopee',
            'Valor Líquido': calculateNet('Shopee', shopeeRate),
            'Taxas': testValue - calculateNet('Shopee', shopeeRate),
        },
        {
            marketplace: 'Mercado Livre',
            'Valor Líquido': calculateNet('Mercado Livre', mercadoLivreRate),
            'Taxas': testValue - calculateNet('Mercado Livre', mercadoLivreRate),
        },
        {
            marketplace: 'Magalu',
            'Valor Líquido': calculateNet('Magalu', magaluRate),
            'Taxas': testValue - calculateNet('Magalu', magaluRate),
        },
    ];

    return (
        <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10">
            <div className="flex items-center gap-2 mb-6">
                <TrendingDown className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-main">Comparação Visual</h2>
            </div>

            <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm text-muted">Simulando venda de:</span>
                    <span className="text-xl font-bold text-main">R$ {testValue.toFixed(2)}</span>
                </div>

                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="marketplace"
                            tick={{ fill: 'currentColor', fontSize: 12 }}
                            stroke="rgba(255,255,255,0.2)"
                        />
                        <YAxis
                            tick={{ fill: 'currentColor', fontSize: 12 }}
                            stroke="rgba(255,255,255,0.2)"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                fontSize: '12px',
                            }}
                            labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                            formatter={(value: number | undefined) => value !== undefined ? [`R$ ${value.toFixed(2)}`, ''] : ['', '']}
                        />
                        <Legend
                            wrapperStyle={{ fontSize: '12px' }}
                            iconType="circle"
                        />
                        <Bar dataKey="Valor Líquido" fill="#22c55e" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="Taxas" fill="#ef4444" radius={[8, 8, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/10">
                    {data.map((item, idx) => {
                        const isWinner = item['Valor Líquido'] === Math.max(...data.map(d => d['Valor Líquido']));
                        return (
                            <div
                                key={idx}
                                className={`p-3 rounded-lg text-center ${isWinner ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-500/5'
                                    }`}
                            >
                                <p className="text-[10px] uppercase font-bold text-muted mb-1">
                                    {item.marketplace}
                                </p>
                                <p className="text-base font-bold text-green-600 dark:text-green-400">
                                    R$ {item['Valor Líquido'].toFixed(2)}
                                </p>
                                {isWinner && (
                                    <p className="text-[9px] text-green-600 dark:text-green-400 font-semibold mt-1">
                                        ★ Melhor opção
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
