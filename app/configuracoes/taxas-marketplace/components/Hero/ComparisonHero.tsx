'use client';

/**
 * Hero Section com Gráfico de Comparação de Valores Líquidos
 * Mostra visualmente a diferença de rendimento entre marketplaces
 */

import { useMemo } from 'react';
import { Trophy, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { Marketplace, MarketplaceConfig } from '../../lib/types';
import { calculateImpact, formatCurrency } from '../../lib/calculations';
import { MARKETPLACE_INFO, MARKETPLACE_ORDER } from '../../lib/defaults';

interface ComparisonHeroProps {
    configs: Record<string, MarketplaceConfig>;
    saleValue?: number;
    className?: string;
}

interface MarketplaceData {
    marketplace: Marketplace;
    name: string;
    color: string;
    net: number;
    fees: number;
    feePercent: number;
}

export function ComparisonHero({
    configs,
    saleValue = 100,
    className = '',
}: ComparisonHeroProps) {
    // Calcula dados para cada marketplace
    const data = useMemo(() => {
        const results: MarketplaceData[] = [];

        for (const mp of MARKETPLACE_ORDER) {
            const config = configs[mp];
            if (!config) continue;

            const impact = calculateImpact(mp, config, saleValue);
            const info = MARKETPLACE_INFO[mp];

            results.push({
                marketplace: mp,
                name: info.displayName,
                color: info.color,
                net: impact.net,
                fees: impact.fees,
                feePercent: (impact.fees / saleValue) * 100,
            });
        }

        // Ordena por maior valor líquido
        return results.sort((a, b) => b.net - a.net);
    }, [configs, saleValue]);

    const best = data[0];
    const worst = data[data.length - 1];
    const maxNet = best?.net || 0;
    const minNet = worst?.net || 0;
    const advantage = maxNet - minNet;

    if (data.length === 0) return null;

    return (
        <section className={`glass-panel glass-tint rounded-[32px] p-6 md:p-8 border border-white/30 dark:border-white/10 ${className}`}>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-main flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-accent/10">
                            <TrendingUp className="w-6 h-6 text-accent" />
                        </div>
                        Comparação de Valor Líquido
                    </h2>
                    <p className="text-sm text-muted mt-1">
                        Para uma venda de {formatCurrency(saleValue)}
                    </p>
                </div>

                {/* Best option badge */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
                    <Trophy className="w-5 h-5 text-emerald-500" />
                    <div>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Melhor Opção</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            {best?.name}
                        </p>
                    </div>
                    <div className="text-right ml-4">
                        <p className="text-xs text-muted">Vantagem</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency(advantage)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Horizontal Bar Chart */}
            <div className="space-y-4">
                {data.map((item, index) => {
                    // Calcula porcentagem relativa para a barra (0-100%)
                    const barWidth = (item.net / saleValue) * 100;
                    const isWinner = index === 0;
                    const diffFromBest = best.net - item.net;

                    return (
                        <div key={item.marketplace} className="group">
                            {/* Label row */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    {/* Position badge */}
                                    <span className={`
                                        w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                                        ${isWinner
                                            ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-900'
                                            : 'bg-slate-200 dark:bg-slate-700 text-muted'
                                        }
                                    `}>
                                        {index + 1}º
                                    </span>

                                    {/* Marketplace color dot + name */}
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: item.color }}
                                    />
                                    <span className="font-semibold text-main">
                                        {item.name}
                                    </span>

                                    {/* Fee percentage */}
                                    <span className="text-xs text-muted px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                        -{item.feePercent.toFixed(1)}% taxas
                                    </span>
                                </div>

                                {/* Net value */}
                                <div className="flex items-center gap-3">
                                    {!isWinner && diffFromBest > 0 && (
                                        <span className="text-xs text-red-500/80 flex items-center gap-1">
                                            <TrendingDown className="w-3 h-3" />
                                            -{formatCurrency(diffFromBest)}
                                        </span>
                                    )}
                                    <span className={`
                                        text-lg font-bold
                                        ${isWinner ? 'text-emerald-600 dark:text-emerald-400' : 'text-main'}
                                    `}>
                                        {formatCurrency(item.net)}
                                    </span>
                                </div>
                            </div>

                            {/* Bar */}
                            <div className="h-8 rounded-xl bg-slate-100 dark:bg-slate-800/50 overflow-hidden">
                                <div
                                    className={`
                                        h-full rounded-xl transition-all duration-500 ease-out
                                        flex items-center justify-end pr-3
                                        ${isWinner
                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                                            : 'bg-gradient-to-r from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-500'
                                        }
                                    `}
                                    style={{
                                        width: `${barWidth}%`,
                                        backgroundColor: isWinner ? undefined : item.color,
                                        opacity: isWinner ? 1 : 0.7,
                                    }}
                                >
                                    <span className="text-xs font-bold text-white drop-shadow-sm">
                                        {barWidth.toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer insight */}
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                <p className="text-sm text-muted">
                    💡 Vendendo pelo <strong className="text-main">{best?.name}</strong>, você ganha{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(advantage)}</strong>{' '}
                    a mais que pelo {worst?.name}
                </p>
                <button className="text-xs text-accent hover:text-accent/80 transition-colors flex items-center gap-1">
                    Ver detalhes <ArrowRight className="w-3 h-3" />
                </button>
            </div>
        </section>
    );
}
