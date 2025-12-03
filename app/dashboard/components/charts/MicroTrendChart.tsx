'use client';

import { memo, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CustomTooltip, type CustomTooltipFormatter } from './ChartTooltips';

type SparkDatum = {
  label: string;
  value: number;
  quantidade: number;
};

type MicroTrendChartProps = {
  data: SparkDatum[];
  formatter: CustomTooltipFormatter;
};

const MicroTrendChartComponent = ({ data, formatter }: MicroTrendChartProps) => {
  const chartData = useMemo(() => data, [data]);

  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="microSpark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="label" hide />
          <YAxis hide />
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          <Area
            type="monotone"
            dataKey="value"
            name="Receita"
            stroke="#a855f7"
            fill="url(#microSpark)"
            strokeWidth={3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MicroTrendChart = memo(MicroTrendChartComponent);
