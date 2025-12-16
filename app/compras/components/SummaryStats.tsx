
import React from 'react';

type SummaryStatsProps = {
    totalCompra: number;
    totalValorCompra: number;
};

export function SummaryStats({ totalCompra, totalValorCompra }: SummaryStatsProps) {
    return (
        <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Total sugerido</p>
            <div className="flex flex-col">
                <p className="text-3xl font-semibold text-slate-900 dark:text-white">
                    {totalCompra.toLocaleString('pt-BR')} <span className="text-base text-slate-500 font-normal">unid.</span>
                </p>
                <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
                    {totalValorCompra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
            </div>
        </div>
    );
}
