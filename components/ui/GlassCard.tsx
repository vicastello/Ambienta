"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
};

export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/10 dark:border-white/10",
        "bg-gradient-to-br from-white/10 to-white/5 dark:from-white/5 dark:to-slate-900/40",
        "backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.35)] transition-colors",
        className
      )}
    >
      {children}
    </div>
  );
}
