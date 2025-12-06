"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { chartColors, chartDefaults } from "./chartTheme";

type BaseAreaChartProps<T extends Record<string, unknown>> = {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  valueFormatter?: (value: number) => string;
  className?: string;
};

export function BaseAreaChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  valueFormatter,
  className,
}: BaseAreaChartProps<T>) {
  return (
    <div className={className ?? "h-64 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="areaPrimary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="10%" stopColor={chartColors.primary} stopOpacity={0.8} />
              <stop offset="100%" stopColor={chartColors.primary} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.backgroundGrid} vertical={false} />
          <XAxis dataKey={xKey} stroke={chartColors.axis} tickLine={false} />
          <YAxis stroke={chartColors.axis} tickLine={false} tickFormatter={valueFormatter} />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              borderRadius: 12,
              border: "1px solid rgba(148, 163, 184, 0.4)",
            }}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={chartColors.primary}
            strokeWidth={chartDefaults.strokeWidth}
            fill="url(#areaPrimary)"
            dot={{ r: chartDefaults.dotRadius }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
