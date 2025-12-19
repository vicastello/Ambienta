'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { calculateMarketplaceFees } from '@/lib/marketplace-fees';

interface RentabilityChartProps {
    cost: number;
    minPrice?: number;
    maxPrice?: number;
    step?: number;
    freeShippingShopee?: boolean;
    campaignShopee?: boolean;
}

interface ChartDataPoint {
    price: number;
    shopee: number;
    mercadoLivre: number;
    magalu: number;
}

export function RentabilityChart({
    cost,
    minPrice = 50,
    maxPrice = 500,
    step = 10,
    freeShippingShopee = false,
    campaignShopee = false,
}: RentabilityChartProps) {
    const chartData = useMemo(() => {
        const data: ChartDataPoint[] = [];

        for (let price = minPrice; price <= maxPrice; price += step) {
            const point: ChartDataPoint = {
                price,
                shopee: 0,
                mercadoLivre: 0,
                magalu: 0,
            };

            // Calculate for each marketplace
            const marketplaces = [
                { key: 'shopee' as const, name: 'shopee' },
                { key: 'mercadoLivre' as const, name: 'mercado_livre' },
                { key: 'magalu' as const, name: 'magalu' },
            ];

            marketplaces.forEach(async ({ key, name }) => {
                try {
                    const feeCalc = await calculateMarketplaceFees({
                        marketplace: name,
                        orderValue: price,
                        usesFreeShipping: name === 'shopee' ? freeShippingShopee : undefined,
                        isCampaignOrder: name === 'shopee' ? campaignShopee : undefined,
                        orderDate: new Date(),
                    });

                    const profit = feeCalc.netValue - cost;
                    point[key] = profit;
                } catch (error) {
                    point[key] = 0;
                }
            });

            data.push(point);
        }

        return data;
    }, [cost, minPrice, maxPrice, step, freeShippingShopee, campaignShopee]);

    const formatCurrency = (value: number) => {
        return `R$ ${value.toFixed(0)}`;
    };

    const formatPrice = (value: number) => {
        return `R$ ${value}`;
    };

    // Find crossover points (where lines intersect)
    const crossoverPoints = useMemo(() => {
        const points: { price: number; label: string }[] = [];

        for (let i = 1; i < chartData.length; i++) {
            const curr = chartData[i];
            const prev = chartData[i - 1];

            // Check Shopee vs Mercado Livre
            if (
                (prev.shopee <= prev.mercadoLivre && curr.shopee > curr.mercadoLivre) ||
                (prev.shopee >= prev.mercadoLivre && curr.shopee < curr.mercadoLivre)
            ) {
                points.push({ price: curr.price, label: 'Shopee ≈ ML' });
            }

            // Check Shopee vs Magalu
            if (
                (prev.shopee <= prev.magalu && curr.shopee > curr.magalu) ||
                (prev.shopee >= prev.magalu && curr.shopee < curr.magalu)
            ) {
                points.push({ price: curr.price, label: 'Shopee ≈ Magalu' });
            }

            // Check Mercado Livre vs Magalu
            if (
                (prev.mercadoLivre <= prev.magalu && curr.mercadoLivre > curr.magalu) ||
                (prev.mercadoLivre >= prev.magalu && curr.mercadoLivre < curr.magalu)
            ) {
                points.push({ price: curr.price, label: 'ML ≈ Magalu' });
            }
        }

        return points;
    }, [chartData]);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-bold text-main mb-2">Rentabilidade por Faixa de Preço</h3>
                <p className="text-xs text-muted">
                    Como o lucro líquido varia conforme o preço de venda em cada marketplace
                </p>
            </div>

            <div className="glass-card rounded-xl p-6 border border-white/20 dark:border-white/10">
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="price"
                            tickFormatter={formatPrice}
                            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                            stroke="rgba(255,255,255,0.2)"
                        />
                        <YAxis
                            tickFormatter={formatCurrency}
                            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                            stroke="rgba(255,255,255,0.2)"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: '8px',
                                fontSize: '12px',
                            }}
                            labelFormatter={formatPrice}
                            formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : 'N/A'}
                        />
                        <Legend
                            wrapperStyle={{ fontSize: '12px' }}
                            iconType="line"
                        />

                        {/* Zero profit line */}
                        <ReferenceLine y={0} stroke="rgba(255, 255, 255, 0.3)" strokeDasharray="5 5" />

                        {/* Crossover points */}
                        {crossoverPoints.map((point, idx) => (
                            <ReferenceLine
                                key={idx}
                                x={point.price}
                                stroke="rgba(156, 163, 175, 0.4)"
                                strokeDasharray="3 3"
                                label={{
                                    value: point.label,
                                    position: 'top',
                                    fontSize: 9,
                                    fill: 'var(--color-muted)',
                                }}
                            />
                        ))}

                        <Line
                            type="monotone"
                            dataKey="shopee"
                            name="Shopee"
                            stroke="#FF6600"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="mercadoLivre"
                            name="Mercado Livre"
                            stroke="#FFE600"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="magalu"
                            name="Magalu"
                            stroke="#0086FF"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                        />
                    </LineChart>
                </ResponsiveContainer>

                {/* Insights */}
                {crossoverPoints.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        <p className="text-xs font-bold text-main mb-2">💡 Insights</p>
                        <ul className="text-xs text-muted space-y-1">
                            {crossoverPoints.slice(0, 2).map((point, idx) => (
                                <li key={idx}>
                                    • A partir de {formatPrice(point.price)}, a rentabilidade muda entre marketplaces
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
