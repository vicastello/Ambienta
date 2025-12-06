"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  description?: string;
  rightSlot?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, rightSlot, className }: SectionHeaderProps) {
  return (
    <div className={clsx("flex items-center justify-between gap-3 mb-4", className)}>
      <div>
        <h2 className="text-sm font-medium tracking-wide text-zinc-200">{title}</h2>
        {description && <p className="mt-1 text-xs text-zinc-400">{description}</p>}
      </div>
      {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
