'use client';

import { memo, useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CustomTooltip, type CustomTooltipFormatter } from './ChartTooltips';

type SparkDatum = {
  label: string;
  hoje: number;
  ontem: number;
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
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis hide />
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          <Line
            type="monotone"
            dataKey="hoje"
            name="Hoje"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="ontem"
            name="Ontem"
            stroke="#a855f7"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MicroTrendChart = memo(MicroTrendChartComponent);
