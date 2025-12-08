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
  hoje?: number | null;
  ontem?: number | null;
  quantidade?: number | null;
  quantidadeOntem?: number | null;
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

type MicroDotProps = {
  index?: number;
  cx?: number;
  cy?: number;
  stroke?: string;
};

const MicroTrendChartComponent = ({ data, formatter }: MicroTrendChartProps) => {
  const chartData = useMemo(() => data, [data]);
  const lastHojeIndex = useMemo(() => {
    for (let idx = chartData.length - 1; idx >= 0; idx -= 1) {
      const value = chartData[idx]?.hoje;
      if (value !== null && value !== undefined) return idx;
    }
    return null;
  }, [chartData]);
  const hasComparison = useMemo(() => chartData.some((item) => item.ontem !== undefined), [chartData]);

  const renderLastDot = useCallback(
    (props: MicroDotProps) => {
      if (lastHojeIndex === null || props?.index !== lastHojeIndex) return null;
      if (typeof props?.cx !== 'number' || typeof props?.cy !== 'number') return null;
      const stroke = props?.stroke ?? 'rgb(168, 85, 247)';
      return (
        <g>
          <circle cx={props.cx} cy={props.cy} r={4.5} fill="#fff" stroke={stroke} strokeWidth={2} />
          <circle cx={props.cx} cy={props.cy} r={2.2} fill={stroke} />
        </g>
      );
    },
    [lastHojeIndex]
  );

  const renderTooltip = useCallback(
    ({ active, payload }: MicroTooltipProps) => {
      if (!active || !payload?.length) return null;

      const firstPayload = (payload[0]?.payload as SparkDatum | undefined) ?? null;
      const labelResolved = firstPayload?.label ?? (typeof firstPayload?.horaIndex === 'number' ? `${firstPayload.horaIndex}h` : 'Hora');
      const ontemEntry = payload.find((entry) => entry?.dataKey === 'ontem');
      const hojeEntry = payload.find((entry) => entry?.dataKey === 'hoje');

      const formatValue = (entry?: MicroTooltipEntry) => {
        const raw = entry?.payload ?? null;
        const rawValue = entry?.value as ChartTooltipValue | undefined;
        const payloadForFormatter: ChartTooltipPayload = {
          value: rawValue,
          name: entry?.name,
          color: entry?.color,
          fill: entry?.fill,
          dataKey: entry?.dataKey?.toString(),
          payload: raw,
        };
        const valueForFormatter = typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : 0;
        return formatter(valueForFormatter, payloadForFormatter);
      };

      const renderSection = (title: string, entry?: MicroTooltipEntry, isOntem?: boolean) => {
        if (!entry) return null;
        const quantidadeKey = entry.dataKey === 'ontem' ? 'quantidadeOntem' : 'quantidade';
        const quantidade = (entry.payload as SparkDatum | undefined)?.[quantidadeKey] ?? null;
        const titleColor = isOntem ? '#334155' : '#6b21a8';
        const valueColor = isOntem ? '#1f2937' : '#6b21a8';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <p style={{ margin: 0, fontWeight: 700, color: titleColor, fontSize: 12 }}>{title}</p>
            <p style={{ margin: 0, fontWeight: 700, color: valueColor, fontSize: 13 }}>{formatValue(entry)}</p>
            {typeof quantidade === 'number' ? (
              <p style={{ margin: 0, fontWeight: 600, color: '#475569', fontSize: 12 }}>
                {quantidade.toLocaleString('pt-BR')} pedidos
              </p>
            ) : null}
          </div>
        );
      };

      return (
        <div
          className="glass-tooltip text-[12px] p-3"
          style={{
            zIndex: 9999,
            background: 'rgba(255, 255, 255, 0.95)',
            color: 'var(--text-main, #0f172a)',
            backdropFilter: 'blur(35px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(35px) saturate(1.4)',
            minWidth: 240,
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>{labelResolved}</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr max-content 1fr',
              alignItems: 'stretch',
              columnGap: 10,
            }}
          >
            {renderSection('Ontem:', ontemEntry, true)}
            <div style={{ width: 1, background: 'rgba(148, 163, 184, 0.4)', borderRadius: 9999 }} />
            {renderSection('Hoje:', hojeEntry, false)}
          </div>
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
            dot={renderLastDot}
            isAnimationActive={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MicroTrendChart = memo(MicroTrendChartComponent);
