'use client';

import { memo, useMemo } from 'react';
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useLazyMount } from '@/components/hooks/useLazyMount';
import { CustomPieTooltip, renderChannelPercentLabel } from './ChartTooltips';

type ChannelDatum = {
  name: string;
  value: number;
  color: string;
  percentage: number;
  pedidos?: number;
};

type ChannelDistributionChartProps = {
  data: ChannelDatum[];
  totalLabel: string;
};

type LabelViewBox = {
  cx?: number;
  cy?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

const ChannelDistributionChartComponent = ({ data, totalLabel }: ChannelDistributionChartProps) => {
  const { ref, isVisible } = useLazyMount<HTMLDivElement>();
  const chartData = useMemo(() => data, [data]);

  return (
    <div ref={ref} className="relative w-full max-w-full h-72 sm:h-80">
      {isVisible ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="68%"
              outerRadius="88%"
              paddingAngle={3}
              cornerRadius={18}
              stroke="transparent"
              labelLine={false}
              label={renderChannelPercentLabel}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} stroke={entry.color} />
              ))}
              <Label
                position="center"
                content={({ viewBox }) => {
                  if (!viewBox) return null;
                  const vb = viewBox as LabelViewBox;
                  const cxCoord =
                    typeof vb.cx === 'number'
                      ? vb.cx
                      : typeof vb.x === 'number' && typeof vb.width === 'number'
                        ? vb.x + vb.width / 2
                        : 0;
                  const cyCoord =
                    typeof vb.cy === 'number'
                      ? vb.cy
                      : typeof vb.y === 'number' && typeof vb.height === 'number'
                        ? vb.y + vb.height / 2
                        : 0;
                  return (
                    <g>
                      <text x={cxCoord} y={cyCoord - 6} textAnchor="middle" fill="var(--text-muted)" fontSize={12} fontWeight={500}>
                        Total
                      </text>
                      <text x={cxCoord} y={cyCoord + 14} textAnchor="middle" fill="var(--text-main)" fontSize={18} fontWeight={700}>
                        {totalLabel}
                      </text>
                    </g>
                  );
                }}
              />
            </Pie>
            <Tooltip content={<CustomPieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full w-full animate-pulse rounded-[36px] bg-white/60 dark:bg-slate-900/30" />
      )}
    </div>
  );
};

export const ChannelDistributionChart = memo(ChannelDistributionChartComponent);
