'use client';

import { memo, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CustomTooltip, type CustomTooltipFormatter } from './ChartTooltips';

const PRIMARY_COLOR = 'rgb(168, 85, 247)'; // novo roxo
const SECONDARY_COLOR = '#E4E4E9';

type RevenueDatum = {
  data: string;
  atual: number;
  anterior: number;
};

type DailyRevenueChartProps = {
  data: RevenueDatum[];
  ticks: number[];
  formatter: CustomTooltipFormatter;
};

const DailyRevenueChartComponent = ({ data, ticks, formatter }: DailyRevenueChartProps) => {
  const chartData = useMemo(() => data, [data]);
  const chartTicks = useMemo(() => ticks, [ticks]);

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorAtual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY_COLOR} stopOpacity={0.6} />
              <stop offset="100%" stopColor={PRIMARY_COLOR} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="colorAnterior" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SECONDARY_COLOR} stopOpacity={0.5} />
              <stop offset="100%" stopColor={SECONDARY_COLOR} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={false} />
          <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="values" ticks={chartTicks} hide />
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
            formatter={(value, entry) => {
              const legendEntry = entry as { color?: string } | undefined;
              const color =
                legendEntry?.color === SECONDARY_COLOR ? '#475569' : legendEntry?.color;
              return <span style={{ color }}>{value}</span>;
            }}
          />
          <Area
            yAxisId="values"
            type="monotone"
            dataKey="anterior"
            name="Período anterior"
            stroke={SECONDARY_COLOR}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="url(#colorAnterior)"
            strokeWidth={1.75}
            strokeDasharray="6 6"
          />
          <Area
            yAxisId="values"
            type="monotone"
            dataKey="atual"
            name="Período atual"
            stroke={PRIMARY_COLOR}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="url(#colorAtual)"
            strokeWidth={1.75}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const DailyRevenueChart = memo(DailyRevenueChartComponent);
