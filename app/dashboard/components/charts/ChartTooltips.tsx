'use client';

import type { ReactNode } from 'react';

export type ChartTooltipValue = number | string;
export type CustomTooltipFormatter = (value: ChartTooltipValue) => ReactNode;

export type ChartTooltipPayload = {
  value?: ChartTooltipValue;
  name?: string;
  color?: string;
  fill?: string;
  payload?: Record<string, unknown> | null;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
  formatter?: CustomTooltipFormatter;
};

type CustomPieTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
};

type ChannelPercentLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  percent?: number;
  payload?: { percentage?: number };
};

const PIE_LABEL_RAD = Math.PI / 180;

export function CustomTooltip({ active, payload, label, formatter }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const toReadableColor = (color: string | undefined) => {
    if (!color) return 'var(--text-main)';
    const normalized = color.toLowerCase();
    if (normalized === '#e4e4e9' || normalized === 'rgb(228, 228, 233)') {
      return '#475569'; // cinza mais escuro para legibilidade
    }
    return color;
  };

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
      <p style={{ margin: '0 0 6px 0', fontWeight: 600 }}>{label ? `Dia ${label}` : 'Data'}</p>
      {payload.map((entry, index) => {
        const rawValue = entry?.value;
        const formattedValue =
          formatter && (typeof rawValue === 'number' || typeof rawValue === 'string')
            ? formatter(rawValue)
            : rawValue;
        const extraData =
          (entry?.payload as { quantidade?: number; quantidadeOntem?: number } | undefined) ?? null;
        const quantidade =
          entry?.name?.toString().toLowerCase().includes('ontem')
            ? typeof extraData?.quantidadeOntem === 'number'
              ? extraData.quantidadeOntem
              : null
            : typeof extraData?.quantidade === 'number'
              ? extraData.quantidade
              : null;
        const lineStyle = {
          margin: '0',
          color: toReadableColor(entry?.color),
          fontWeight: 600,
        } as const;
        return (
          <div key={entry?.name ?? index} style={{ margin: '4px 0' }}>
            <p style={lineStyle}>{formattedValue}</p>
            {quantidade != null ? (
              <p style={{ ...lineStyle, marginTop: '2px' }}>
                {quantidade.toLocaleString('pt-BR')} un
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function CustomPieTooltip({ active, payload }: CustomPieTooltipProps) {
  if (!active || !payload?.length || !payload[0]) return null;

  const [first] = payload;
  const data = (first?.payload as { name?: string; pedidos?: number }) ?? {};
  const value = first?.value;
  const formattedValue =
    typeof value === 'number'
      ? value.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })
      : value;

  return (
    <div
      className="rounded-lg p-3 border border-white/40 dark:border-slate-700/40"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'var(--text-main)',
        fontSize: '11px',
        zIndex: 9999,
      }}
    >
      <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>{data.name}</p>
      <p style={{ margin: '2px 0', color: first?.fill }}>
        <strong>Faturamento:</strong> {formattedValue}
      </p>
      <p style={{ margin: '2px 0', fontSize: '10px', color: 'var(--text-muted)' }}>
        ({data.pedidos ?? 0} pedidos)
      </p>
    </div>
  );
}

export const renderChannelPercentLabel = ({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent,
  payload,
}: ChannelPercentLabelProps) => {
  const resolvedPercent =
    typeof percent === 'number'
      ? percent
      : typeof payload?.percentage === 'number'
        ? payload.percentage / 100
        : 0;

  if (!cx || !cy || !outerRadius || typeof midAngle !== 'number' || resolvedPercent <= 0 || resolvedPercent * 100 < 4) {
    return null;
  }

  const radius = Number(outerRadius ?? 0) * 1.12;
  const x = cx + radius * Math.cos(-midAngle * PIE_LABEL_RAD);
  const y = cy + radius * Math.sin(-midAngle * PIE_LABEL_RAD);

  return (
    <text
      x={x}
      y={y}
      fill="var(--text-main)"
      fontSize={12}
      fontWeight={600}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      opacity={resolvedPercent > 0 ? 0.9 : 0}
    >
      {(resolvedPercent * 100).toFixed(0)}%
    </text>
  );
};
