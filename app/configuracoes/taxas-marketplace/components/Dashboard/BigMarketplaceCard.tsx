'use client';

/**
 * Card grande de marketplace com tipografia proeminente
 * Mostra taxa principal, valor líquido e sparkline de tendência
 */

import { TrendingUp, TrendingDown, ChevronDown, CheckCircle, AlertTriangle } from 'lucide-react';
import { Marketplace, ImpactPreview, ConfigValidationResult } from '../../lib/types';
import { MARKETPLACE_INFO } from '../../lib/defaults';
import { formatCurrency } from '../../lib/calculations';

interface BigMarketplaceCardProps {
    marketplace: Marketplace;
    /** Taxa principal a exibir (%) */
    mainRate: number;
    /** Label da taxa principal */
    rateLabel: string;
    /** Dados de impacto calculados */
    impact: ImpactPreview;
    /** Se está expandido/selecionado */
    isExpanded: boolean;
    /** Resultado de validação */
    validation?: ConfigValidationResult | null;
    /** Tendência (comparado com período anterior) */
    trend?: { value: number; isPositive: boolean } | null;
    /** Callback ao clicar */
    onClick: () => void;
    /** Classes CSS adicionais */
    className?: string;
}

export function BigMarketplaceCard({
    marketplace,
    mainRate,
    rateLabel,
    impact,
    isExpanded,
    validation,
    trend,
    onClick,
    className = '',
}: BigMarketplaceCardProps) {
    const info = MARKETPLACE_INFO[marketplace];
    const hasErrors = validation && !validation.valid;
    const hasWarnings = validation?.warnings && validation.warnings.length > 0;

    return (
        <button
            onClick={onClick}
            className={`
                relative w-full text-left
                glass-panel glass-tint rounded-[32px] p-6
                border-2 transition-all duration-300 ease-out
                hover:scale-[1.02] hover:shadow-xl
                focus:outline-none focus:ring-4 focus:ring-offset-2
                ${isExpanded
                    ? `border-[${info.color}] shadow-lg shadow-[${info.color}]/20 ring-2 ring-[${info.color}]/30`
                    : 'border-white/20 dark:border-white/10 hover:border-white/40'
                }
                ${className}
            `}
            style={{
                borderColor: isExpanded ? info.color : undefined,
                boxShadow: isExpanded ? `0 10px 40px -10px ${info.color}40` : undefined,
            }}
            aria-expanded={isExpanded}
            aria-label={`Configurar ${info.displayName}`}
        >
            {/* Status badge */}
            {(hasErrors || hasWarnings) && (
                <div className={`
                    absolute top-4 right-4 p-1.5 rounded-full
                    ${hasErrors ? 'bg-red-500/20' : 'bg-yellow-500/20'}
                `}>
                    {hasErrors ? (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : (
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    )}
                </div>
            )}

            {/* Expanded indicator */}
            {isExpanded && (
                <div className="absolute top-4 right-4">
                    <CheckCircle className="w-5 h-5" style={{ color: info.color }} />
                </div>
            )}

            {/* Header with color dot and name */}
            <div className="flex items-center gap-3 mb-4">
                <div
                    className="w-4 h-4 rounded-full shadow-lg"
                    style={{
                        backgroundColor: info.color,
                        boxShadow: `0 0 12px ${info.color}80`,
                    }}
                />
                <span className="text-sm font-medium text-muted uppercase tracking-wider">
                    {info.displayName}
                </span>
            </div>

            {/* Main rate - BIG Typography */}
            <div className="mb-2">
                <span
                    className="text-5xl md:text-6xl font-black tracking-tight"
                    style={{ color: info.color }}
                >
                    {mainRate.toFixed(1)}%
                </span>
            </div>
            <p className="text-xs text-muted mb-6">{rateLabel}</p>

            {/* Divider */}
            <div className="h-px bg-white/10 mb-4" />

            {/* Net value section */}
            <div className="flex items-end justify-between">
                <div>
                    <p className="text-xs text-muted uppercase tracking-wider mb-1">
                        Valor Líquido
                    </p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(impact.net)}
                    </p>
                    <p className="text-xs text-red-500/70 mt-0.5">
                        -{formatCurrency(impact.fees)} em taxas
                    </p>
                </div>

                {/* Trend indicator */}
                {trend && (
                    <div className={`
                        flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold
                        ${trend.isPositive
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-500/20 text-red-600 dark:text-red-400'
                        }
                    `}>
                        {trend.isPositive ? (
                            <TrendingUp className="w-3 h-3" />
                        ) : (
                            <TrendingDown className="w-3 h-3" />
                        )}
                        {trend.isPositive ? '+' : ''}{trend.value.toFixed(1)}%
                    </div>
                )}
            </div>

            {/* Expand indicator */}
            <div className={`
                absolute bottom-4 left-1/2 -translate-x-1/2
                transition-transform duration-300
                ${isExpanded ? 'rotate-180' : ''}
            `}>
                <ChevronDown className="w-5 h-5 text-muted" />
            </div>
        </button>
    );
}
