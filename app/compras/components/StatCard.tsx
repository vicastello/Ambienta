
import React from 'react';

export type StatCardProps = {
    id: string;
    label: string;
    value: string;
    helper: string;
    tone: 'primary' | 'success' | 'neutral' | 'warning';
};

const STAT_TONE_CLASSES: Record<StatCardProps['tone'], string> = {
    primary: 'text-[#5b21b6] dark:text-[#c4b5fd]',
    success: 'text-emerald-600 dark:text-emerald-400',
    neutral: 'text-slate-900 dark:text-white',
    warning: 'text-amber-600 dark:text-amber-400',
};

export function StatCard({ label, value, helper, tone }: StatCardProps) {
    return (
        <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-3 transition-transform duration-300 hover:scale-[1.02] hover:shadow-lg">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-medium">{label}</p>
            <p className={`text-2xl font-semibold font-display ${STAT_TONE_CLASSES[tone]}`}>{value}</p>
            <p className="text-xs text-slate-500">{helper}</p>
        </div>
    );
}
