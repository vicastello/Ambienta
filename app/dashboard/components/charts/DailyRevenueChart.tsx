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

const AMBIENTA_PRIMARY = '#009DA8';

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
              <stop offset="0%" stopColor={AMBIENTA_PRIMARY} stopOpacity={0.5} />
              <stop offset="100%" stopColor={AMBIENTA_PRIMARY} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="colorAnterior" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a5b4fc" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#a5b4fc" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={false} />
          <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="values" ticks={chartTicks} hide />
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Area yAxisId="values" type="monotone" dataKey="anterior" name="Período anterior" stroke="#a5b4fc" fill="url(#colorAnterior)" strokeWidth={3} strokeDasharray="6 6" />
          <Area yAxisId="values" type="monotone" dataKey="atual" name="Período atual" stroke={AMBIENTA_PRIMARY} fill="url(#colorAtual)" strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const DailyRevenueChart = memo(DailyRevenueChartComponent);
