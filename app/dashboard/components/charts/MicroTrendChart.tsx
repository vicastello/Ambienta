'use client';

import { memo, useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CustomTooltip, type CustomTooltipFormatter } from './ChartTooltips';

type SparkDatum = {
  label: string;
  valor?: number;
  hoje?: number;
  ontem?: number;
  quantidade?: number;
  quantidadeOntem?: number;
};

type MicroTrendChartProps = {
  data: SparkDatum[];
  formatter: CustomTooltipFormatter;
};

const MicroTrendChartComponent = ({ data, formatter }: MicroTrendChartProps) => {
  const chartData = useMemo(() => data, [data]);
  const hasComparison = useMemo(() => chartData.some((item) => item.ontem !== undefined), [chartData]);

  return (
    <div className="h-32 sm:h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
        >
          <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="rgba(148,163,184,0.15)" />
          <XAxis dataKey="horaIndex" height={0} tick={false} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip
            content={
              <CustomTooltip
                formatter={(value, payloadItem) => {
                  const raw = (payloadItem?.payload as SparkDatum | undefined) ?? null;
                  if (!raw) {
                    return formatter ? formatter(value) : value;
                  }
                  const quantidade =
                    payloadItem?.dataKey === 'ontem'
                      ? raw.quantidadeOntem ?? null
                      : raw.quantidade ?? null;
                  const formatted = formatter ? formatter(value) : value;
                  if (quantidade != null) {
                    return (
                      <div className="space-y-1">
                        <span>{formatted}</span>
                        <span className="text-xs text-slate-500">
                          {quantidade.toLocaleString('pt-BR')} un
                        </span>
                      </div>
                    );
                  }
                  return formatted;
                }}
              />
            }
          />
          {hasComparison && (
            <Line
              type="monotone"
              dataKey="ontem"
              name="24h anteriores"
              stroke="#CBD5E1"
              strokeWidth={1.35}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="hoje"
            name="Últimas 24h"
            stroke="rgb(168, 85, 247)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MicroTrendChart = memo(MicroTrendChartComponent);
