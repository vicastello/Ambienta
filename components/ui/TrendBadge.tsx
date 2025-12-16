import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface TrendBadgeProps {
    /** Valor da variação (pode ser positivo ou negativo) */
    delta: number;
    /** Delta em percentual (se disponível) */
    deltaPercent?: number | null;
    /** Mostrar valor absoluto ou percentual */
    mode?: 'absolute' | 'percent';
    /** Tamanho do badge */
    size?: 'sm' | 'md' | 'lg';
    /** Formatador customizado para valor absoluto */
    formatter?: (value: number) => string;
    /** Inverter cores (útil para métricas onde queda é positiva, ex: custos) */
    invertColors?: boolean;
}

const defaultFormatter = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(abs / 1000).toFixed(1)}k`;
    return abs.toFixed(1);
};

export function TrendBadge({
    delta,
    deltaPercent = null,
    mode = 'percent',
    size = 'md',
    formatter = defaultFormatter,
    invertColors = false,
}: TrendBadgeProps) {
    const isPositive = delta > 0;
    const isNeutral = delta === 0;
    const isNegative = delta < 0;

    // Determinar cor baseado em direção e inversão
    const colorClass = isNeutral
        ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400'
        : (isPositive && !invertColors) || (isNegative && invertColors)
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400';

    const sizeClasses = {
        sm: 'text-[10px] px-1.5 py-0.5 gap-0.5',
        md: 'text-xs px-2 py-1 gap-1',
        lg: 'text-sm px-2.5 py-1.5 gap-1.5',
    };

    const iconSizes = {
        sm: 'w-2.5 h-2.5',
        md: 'w-3 h-3',
        lg: 'w-4 h-4',
    };

    const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

    // Valor a exibir
    const displayValue = mode === 'percent' && deltaPercent !== null
        ? `${Math.abs(deltaPercent).toFixed(1)}%`
        : formatter(delta);

    const prefix = isNeutral ? '' : (isPositive ? '+' : '−');

    return (
        <span
            className={`inline-flex items-center rounded-full font-semibold transition-all ${sizeClasses[size]} ${colorClass}`}
            title={`Variação: ${delta >= 0 ? '+' : ''}${delta}${deltaPercent !== null ? ` (${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(2)}%)` : ''}`}
        >
            <Icon className={iconSizes[size]} />
            <span>{prefix}{displayValue}</span>
        </span>
    );
}
