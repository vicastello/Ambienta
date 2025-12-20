'use client';

/**
 * Cards de impacto rápido mostrando melhor opção
 */

import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { MarketplaceComparison } from '../../lib/calculations';
import { MARKETPLACE_INFO } from '../../lib/defaults';
import { formatCurrency } from '../../lib/calculations';

interface QuickImpactCardsProps {
    /** Comparações ordenadas (melhor primeiro) */
    comparison: MarketplaceComparison[];
    /** Valor da venda simulada */
    saleValue?: number;
    /** Classes CSS adicionais */
    className?: string;
}

const positionStyles = {
    0: {
        badge: '🥇',
        bgClass: 'bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border-yellow-500/30',
        textClass: 'text-yellow-600 dark:text-yellow-400',
    },
    1: {
        badge: '🥈',
        bgClass: 'bg-slate-500/10 border-slate-500/20',
        textClass: 'text-slate-600 dark:text-slate-400',
    },
    2: {
        badge: '🥉',
        bgClass: 'bg-orange-500/10 border-orange-500/20',
        textClass: 'text-orange-600 dark:text-orange-400',
    },
};

export function QuickImpactCards({
    comparison,
    saleValue = 100,
    className = '',
}: QuickImpactCardsProps) {
    if (comparison.length === 0) return null;

    const best = comparison[0];

    return (
        <div className={`glass-panel glass-tint rounded-[32px] p-5 border border-white/30 dark:border-white/10 ${className}`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h3 className="text-sm font-bold text-main">Melhor Opção</h3>
            </div>

            {/* Descrição */}
            <p className="text-xs text-muted mb-4">
                Para vendas de {formatCurrency(saleValue)}:
            </p>

            {/* Lista de comparação */}
            <div className="space-y-2">
                {comparison.map((item, index) => {
                    const info = MARKETPLACE_INFO[item.marketplace];
                    const style = positionStyles[index as 0 | 1 | 2] || positionStyles[2];
                    const diff = item.net - best.net;

                    return (
                        <div
                            key={item.marketplace}
                            className={`
                                flex items-center justify-between
                                p-3 rounded-lg border
                                ${style.bgClass}
                                transition-all
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-lg" role="img" aria-label={`Posição ${index + 1}`}>
                                    {style.badge}
                                </span>
                                <div>
                                    <span className="font-semibold text-main text-sm">
                                        {info.displayName}
                                    </span>
                                    {index > 0 && (
                                        <span className="ml-2 text-[10px] text-red-500/80 inline-flex items-center gap-0.5">
                                            <TrendingDown className="w-3 h-3" />
                                            {formatCurrency(Math.abs(diff))}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="text-right">
                                <span className={`font-bold ${index === 0 ? 'text-green-600 dark:text-green-400' : 'text-main'}`}>
                                    {formatCurrency(item.net)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Insight */}
            {comparison.length >= 2 && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-xs text-green-700 dark:text-green-400">
                        <TrendingUp className="w-3 h-3 inline mr-1" />
                        Vendendo por <strong>{MARKETPLACE_INFO[best.marketplace].displayName}</strong>, você ganha{' '}
                        <strong>{formatCurrency(best.net - comparison[comparison.length - 1].net)}</strong> a mais
                        comparado ao pior.
                    </p>
                </div>
            )}
        </div>
    );
}
