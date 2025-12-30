'use client';

import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface CopilotChartProps {
    type: 'area' | 'bar';
    data: any[];
    dataKey: string;
    labelKey: string;
    color?: string;
    title?: string;
    height?: number;
}

export function CopilotChart({
    type = 'area',
    data,
    dataKey,
    labelKey,
    color = '#009CA6', // Accent color
    title,
    height = 150
}: CopilotChartProps) {
    if (!data || data.length === 0) return null;

    const ChartComponent = type === 'bar' ? BarChart : AreaChart;

    return (
        <div className="mt-3 mb-2 p-3 bg-white/5 rounded-xl border border-white/5">
            {title && (
                <div className="text-xs font-semibold text-white/80 mb-2 px-1">
                    {title}
                </div>
            )}
            <div style={{ width: '100%', height: height }}>
                <ResponsiveContainer>
                    <ChartComponent data={data}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                        <XAxis
                            dataKey={labelKey}
                            hide={data.length > 10}
                            tick={{ fontSize: 10, fill: '#ffffff60' }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#0f172a',
                                border: '1px solid #ffffff20',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: '#fff'
                            }}
                            cursor={{ fill: '#ffffff05' }}
                        />
                        {type === 'area' ? (
                            <Area
                                type="monotone"
                                dataKey={dataKey}
                                stroke={color}
                                fill={`${color}20`}
                                strokeWidth={2}
                            />
                        ) : (
                            <Bar
                                dataKey={dataKey}
                                fill={color}
                                radius={[4, 4, 0, 0]}
                                maxBarSize={40}
                            />
                        )}
                    </ChartComponent>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
