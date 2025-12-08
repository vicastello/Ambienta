'use client';

import { memo, useCallback, useMemo } from 'react';
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
import type { ChartTooltipPayload, ChartTooltipValue, CustomTooltipFormatter } from './ChartTooltips';

const PRIMARY_COLOR = 'rgb(168, 85, 247)'; // novo roxo
const SECONDARY_COLOR = '#E4E4E9';

type RevenueDatum = {
  data: string;
  atual: number | null;
  anterior: number | null;
  pedidosAtual?: number | null;
  pedidosAnterior?: number | null;
};

type DailyRevenueChartProps = {
  data: RevenueDatum[];
  ticks: number[];
  formatter: CustomTooltipFormatter;
};

type MicroDotProps = {
  index?: number;
  cx?: number;
  cy?: number;
  stroke?: string;
};

type TooltipEntry = {
  value?: ChartTooltipValue;
  name?: string;
  color?: string;
  fill?: string;
  dataKey?: string | number;
  payload?: RevenueDatum;
};

type TooltipProps = {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
};

const DailyRevenueChartComponent = ({ data, ticks, formatter }: DailyRevenueChartProps) => {
  const chartData = useMemo(() => data, [data]);
  const chartTicks = useMemo(() => ticks, [ticks]);
  const lastAtualIndex = useMemo(() => {
    for (let idx = chartData.length - 1; idx >= 0; idx -= 1) {
      const value = chartData[idx]?.atual;
      if (value !== null && value !== undefined) return idx;
    }
    return null;
  }, [chartData]);

  const renderLastDot = useCallback(
    (props: MicroDotProps) => {
      if (lastAtualIndex === null || props?.index !== lastAtualIndex) return null;
      if (typeof props?.cx !== 'number' || typeof props?.cy !== 'number') return null;
      const stroke = props?.stroke ?? PRIMARY_COLOR;
      return (
        <g>
          <circle cx={props.cx} cy={props.cy} r={4.5} fill="#fff" stroke={stroke} strokeWidth={2} />
          <circle cx={props.cx} cy={props.cy} r={2.2} fill={stroke} />
        </g>
      );
    },
    [lastAtualIndex]
  );

  const renderTooltip = useCallback(
    ({ active, payload, label }: TooltipProps) => {
      if (!active || !payload?.length) return null;
      const anteriorEntry = payload.find((p) => p?.dataKey === 'anterior');
      const atualEntry = payload.find((p) => p?.dataKey === 'atual');

      const formatValue = (entry?: TooltipEntry) => {
        const rawValue = entry?.value as ChartTooltipValue | undefined;
        const payloadForFormatter: ChartTooltipPayload = {
          value: rawValue,
          name: entry?.name,
          color: entry?.color,
          fill: entry?.fill,
          dataKey: entry?.dataKey?.toString(),
          payload: entry?.payload as Record<string, unknown> | null,
        };
        const valueForFormatter = typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : 0;
        return formatter(valueForFormatter, payloadForFormatter);
      };

      const renderSection = (title: string, entry?: TooltipEntry, isAnterior?: boolean) => {
        if (!entry || entry.value === null || entry.value === undefined) return null;
        const titleColor = isAnterior ? '#334155' : PRIMARY_COLOR;
        const valueColor = isAnterior ? '#1f2937' : PRIMARY_COLOR;
        const rawPayload = entry.payload as RevenueDatum | undefined;
        const pedidos = isAnterior ? rawPayload?.pedidosAnterior : rawPayload?.pedidosAtual;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <p style={{ margin: 0, fontWeight: 700, color: titleColor, fontSize: 12 }}>{title}</p>
            <p style={{ margin: 0, fontWeight: 700, color: valueColor, fontSize: 13 }}>{formatValue(entry)}</p>
            {typeof pedidos === 'number' ? (
              <p style={{ margin: 0, fontWeight: 600, color: '#475569', fontSize: 12 }}>
                {pedidos.toLocaleString('pt-BR')} pedidos
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
          <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>{label ? `Dia ${label}` : 'Dia'}</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr max-content 1fr',
              alignItems: 'stretch',
              columnGap: 10,
            }}
          >
            {renderSection('Período anterior', anteriorEntry, true)}
            <div style={{ width: 1, background: 'rgba(148, 163, 184, 0.4)', borderRadius: 9999 }} />
            {renderSection('Período atual', atualEntry, false)}
          </div>
        </div>
      );
    },
    [formatter]
  );

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
          <Tooltip content={renderTooltip} />
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
            dot={renderLastDot}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const DailyRevenueChart = memo(DailyRevenueChartComponent);
