'use client';

import { memo, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  const hasComparison = useMemo(
    () => chartData.some((item) => item.ontem !== undefined && item.ontem !== null),
    [chartData]
  );

  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="microTrendPrimary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(168, 85, 247)" stopOpacity={0.6} />
              <stop offset="100%" stopColor="rgb(168, 85, 247)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="microTrendSecondary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E4E4E9" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#E4E4E9" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="label" hide />
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
          {hasComparison ? (
            <>
              <Area
                type="monotone"
                dataKey="ontem"
                name="Ontem"
                stroke="#E4E4E9"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="url(#microTrendSecondary)"
                strokeWidth={1.35}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="hoje"
                name="Hoje"
                stroke="rgb(168, 85, 247)"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="url(#microTrendPrimary)"
                strokeWidth={1.35}
                dot={false}
                isAnimationActive={false}
              />
            </>
          ) : (
            <Area
              type="monotone"
              dataKey="valor"
              name="Período"
              stroke="rgb(168, 85, 247)"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#microTrendPrimary)"
              strokeWidth={1.35}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MicroTrendChart = memo(MicroTrendChartComponent);
