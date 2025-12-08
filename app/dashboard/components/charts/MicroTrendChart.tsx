'use client';

import { memo, useCallback, useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartTooltipPayload, ChartTooltipValue, CustomTooltipFormatter } from './ChartTooltips';

type SparkDatum = {
  label: string;
  horaIndex?: number;
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

type MicroTooltipEntry = {
  value?: ChartTooltipValue;
  name?: string;
  color?: string;
  dataKey?: string | number;
  payload?: SparkDatum;
  fill?: string;
};

type MicroTooltipProps = {
  active?: boolean;
  payload?: readonly MicroTooltipEntry[];
};

const MicroTrendChartComponent = ({ data, formatter }: MicroTrendChartProps) => {
  const chartData = useMemo(() => data, [data]);
  const hasComparison = useMemo(() => chartData.some((item) => item.ontem !== undefined), [chartData]);

  const renderTooltip = useCallback(
    ({ active, payload }: MicroTooltipProps) => {
      if (!active || !payload?.length) return null;

      const firstPayload = (payload[0]?.payload as SparkDatum | undefined) ?? null;
      const labelResolved = firstPayload?.label ?? (typeof firstPayload?.horaIndex === 'number' ? `${firstPayload.horaIndex}h` : 'Hora');

      return (
        <div
          className="glass-tooltip text-[12px] p-3"
          style={{
            zIndex: 9999,
            background: 'rgba(255, 255, 255, 0.92)',
            color: 'var(--text-main, #0f172a)',
            backdropFilter: 'blur(35px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(35px) saturate(1.4)',
          }}
        >
          <p style={{ margin: '0 0 6px 0', fontWeight: 600 }}>{labelResolved}</p>
          {payload.map((entry, idx) => {
            const raw = entry?.payload ?? null;
            const quantidade = entry?.dataKey === 'ontem' ? raw?.quantidadeOntem : raw?.quantidade;
            const rawValue = entry?.value as ChartTooltipValue | undefined;
            const payloadForFormatter: ChartTooltipPayload = {
              value: rawValue,
              name: entry?.name,
              color: entry?.color,
              fill: entry?.fill,
              dataKey: entry?.dataKey?.toString(),
              payload: raw,
            };
            const valueForFormatter =
              typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : 0;
            const formattedValue = formatter(valueForFormatter, payloadForFormatter);
            return (
              <div key={entry?.dataKey ?? idx} style={{ margin: '4px 0' }}>
                <p
                  style={{
                    margin: 0,
                    color: entry?.color ?? 'var(--text-main, #0f172a)',
                    fontWeight: 600,
                  }}
                >
                  {entry?.name ?? entry?.dataKey}: {formattedValue}
                </p>
                {typeof quantidade === 'number' ? (
                  <p style={{ margin: '2px 0', color: 'var(--text-muted, #475569)', fontWeight: 600 }}>
                    {quantidade.toLocaleString('pt-BR')} un
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    },
    [formatter]
  );

  return (
    <div className="h-32 sm:h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 1, right: 6, bottom: 1, left: 6 }}
        >
          <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="rgba(148,163,184,0.15)" />
          <XAxis dataKey="horaIndex" height={0} tick={false} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip content={renderTooltip} />
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
