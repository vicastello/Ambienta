'use client';

import { memo, useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartTooltipPayload, ChartTooltipValue, CustomTooltipFormatter } from './ChartTooltips';

const PRIMARY_COLOR = 'rgb(168, 85, 247)';
const SECONDARY_COLOR = '#E4E4E9';

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
  formatter?: CustomTooltipFormatter;
  containerClassName?: string;
};

type MicroTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: SparkDatum; value?: ChartTooltipValue; dataKey?: string }>;
};

const MicroTrendChartComponent = ({ data, formatter, containerClassName }: MicroTrendChartProps) => {
  const gradientId = 'microTrendFill';
  const gradientPrevId = 'microTrendPrevFill';
  const chartData = useMemo(() => data, [data]);
  const processedData = useMemo(() => {
    const lastHojeIdx = [...chartData]
      .map((p, idx) => ({ idx, hasValue: (p.hoje ?? 0) > 0 || (p.quantidade ?? 0) > 0 }))
      .filter((x) => x.hasValue)
      .map((x) => x.idx)
      .reduce((acc, curr) => Math.max(acc, curr), -1);

    const lastOntemIdx = [...chartData]
      .map((p, idx) => ({ idx, hasValue: (p.ontem ?? 0) > 0 || (p.quantidadeOntem ?? 0) > 0 }))
      .filter((x) => x.hasValue)
      .map((x) => x.idx)
      .reduce((acc, curr) => Math.max(acc, curr), -1);

    return chartData.map((point, idx) => {
      const withinHoje = idx <= lastHojeIdx || lastHojeIdx === -1;
      const withinOntem = idx <= lastOntemIdx || lastOntemIdx === -1;
      return {
        ...point,
        hojeDisplay: withinHoje ? point.hoje : undefined,
        ontemDisplay: withinOntem ? point.ontem : undefined,
        quantidadeDisplay: withinHoje ? point.quantidade : undefined,
        quantidadeOntemDisplay: withinOntem ? point.quantidadeOntem : undefined,
        isLastActive: lastHojeIdx >= 0 && idx === lastHojeIdx,
      };
    });
  }, [chartData]);
  const hasComparison = useMemo(() => chartData.some((item) => item.ontem !== undefined), [chartData]);

  const renderTooltip = (props: MicroTooltipProps) => {
    const { active, payload } = props;
    if (!active || !payload?.length) return null;

    const payloadArr = payload as ReadonlyArray<{ payload?: SparkDatum; value?: ChartTooltipValue; dataKey?: string }>;
    const point = (payloadArr[0]?.payload as SparkDatum | undefined) ?? null;
    if (!point) return null;

    const label = typeof point.horaIndex === 'number' ? `${point.horaIndex}h` : point.label ?? 'Hora';
    const formatValue = (raw: ChartTooltipValue | undefined, key: string) => {
      const entry: ChartTooltipPayload = {
        value: raw,
        name: key,
        color: '',
        fill: '',
        dataKey: key,
        payload: point,
      };
      if (!formatter) return typeof raw === 'number' ? raw.toLocaleString('pt-BR') : raw ?? '—';
      const safeValue = typeof raw === 'number' || typeof raw === 'string' ? raw : 0;
      return formatter(safeValue, entry);
    };

    return (
      <div className="glass-tooltip text-[12px] p-3 min-w-[180px] rounded-xl bg-white/90 shadow-xl backdrop-blur-3xl border border-white/60">
        <p className="m-0 mb-2 font-semibold text-slate-700">{label}</p>
        <div className="flex justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase text-slate-500">Ontem</span>
            <span className="font-semibold text-slate-700">{formatValue(point.ontem ?? 0, 'ontem')}</span>
            {typeof point.quantidadeOntem === 'number' ? (
              <span className="text-xs text-slate-500">{point.quantidadeOntem.toLocaleString('pt-BR')} pedidos</span>
            ) : null}
          </div>
          <div className="w-px bg-slate-200" />
          <div className="flex flex-col gap-1 items-end">
            <span className="text-xs uppercase text-purple-600">Hoje</span>
            <span className="font-semibold text-purple-700">{formatValue(point.hoje ?? 0, 'hoje')}</span>
            {typeof point.quantidade === 'number' ? (
              <span className="text-xs text-slate-500">{point.quantidade.toLocaleString('pt-BR')} pedidos</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={containerClassName ?? 'h-32 sm:h-36 w-full'}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={processedData}
          margin={{ top: 1, right: 6, bottom: 1, left: 6 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY_COLOR} stopOpacity={0.6} />
              <stop offset="100%" stopColor={PRIMARY_COLOR} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={gradientPrevId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SECONDARY_COLOR} stopOpacity={0.5} />
              <stop offset="100%" stopColor={SECONDARY_COLOR} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="rgba(148,163,184,0.15)" />
          <XAxis dataKey="horaIndex" height={0} tick={false} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip content={renderTooltip} />
          {hasComparison && (
            <>
              <Area
                type="monotone"
                dataKey="ontemDisplay"
                stroke="none"
                fill={`url(#${gradientPrevId})`}
                fillOpacity={1}
                connectNulls
                baseValue={0}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ontemDisplay"
                name="24h anteriores"
                stroke={SECONDARY_COLOR}
                strokeWidth={1.35}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
            </>
          )}
          <Area
            type="monotone"
            dataKey="hojeDisplay"
            stroke="none"
            fill={`url(#${gradientId})`}
            fillOpacity={1}
            connectNulls
            baseValue={0}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="hojeDisplay"
            name="Últimas 24h"
            stroke={PRIMARY_COLOR}
            strokeWidth={2}
            dot={({ cx, cy, payload }) => {
              const isLast = (payload as SparkDatum & { isLastActive?: boolean }).isLastActive;
              if (!isLast || typeof cx !== 'number' || typeof cy !== 'number') return null;
              return (
                <g>
                  <circle cx={cx} cy={cy} r={5} fill="#fff" stroke={PRIMARY_COLOR} strokeWidth={2} />
                  <circle cx={cx} cy={cy} r={2.4} fill={PRIMARY_COLOR} />
                </g>
              );
            }}
            isAnimationActive={false}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MicroTrendChart = memo(MicroTrendChartComponent);
