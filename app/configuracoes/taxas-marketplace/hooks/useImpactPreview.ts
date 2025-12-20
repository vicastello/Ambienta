'use client';

/**
 * Hook para cálculo de preview de impacto de taxas
 */

import { useMemo } from 'react';
import {
    Marketplace,
    MarketplaceConfig,
    ImpactPreview,
} from '../lib/types';
import {
    calculateImpact,
    compareMarketplaces,
    getBestMarketplace,
    MarketplaceComparison,
} from '../lib/calculations';
import { SIMULATION_DEFAULTS } from '../lib/defaults';

interface UseImpactPreviewReturn {
    /** Impacto para o marketplace selecionado */
    impact: ImpactPreview;
    /** Comparação entre todos os marketplaces */
    comparison: MarketplaceComparison[];
    /** Melhor marketplace para o valor simulado */
    bestOption: MarketplaceComparison | null;
}

/**
 * Hook para calcular o impacto de taxas para um marketplace específico
 */
export function useImpactPreview(
    marketplace: Marketplace,
    config: MarketplaceConfig | undefined,
    saleValue: number = SIMULATION_DEFAULTS.DEFAULT_SALE_VALUE
): ImpactPreview {
    return useMemo(() => {
        if (!config) {
            return { net: 0, fees: 0 };
        }
        // Simulação padrão com 0.5kg para mostrar o impacto do frete no card de visualização
        return calculateImpact(marketplace, config, saleValue, {
            weightKg: 0.5,
            includeFreight: true
        });
    }, [marketplace, config, saleValue]);
}

/**
 * Hook para comparar impacto entre todos os marketplaces
 */
export function useMarketplaceComparison(
    configs: Record<Marketplace, MarketplaceConfig>,
    saleValue: number = SIMULATION_DEFAULTS.DEFAULT_SALE_VALUE
): UseImpactPreviewReturn {
    const comparison = useMemo(() => {
        return compareMarketplaces(configs, saleValue);
    }, [configs, saleValue]);

    const bestOption = useMemo(() => {
        return getBestMarketplace(configs, saleValue);
    }, [configs, saleValue]);

    const impact = useMemo(() => {
        // Retorna o impacto do primeiro (melhor) marketplace como padrão
        if (comparison.length > 0) {
            return {
                net: comparison[0].net,
                fees: comparison[0].fees,
            };
        }
        return { net: 0, fees: 0 };
    }, [comparison]);

    return {
        impact,
        comparison,
        bestOption,
    };
}

/**
 * Hook para obter dados formatados para o gráfico de comparação
 */
export function useComparisonChartData(
    configs: Record<string, MarketplaceConfig>,
    saleValue: number = SIMULATION_DEFAULTS.DEFAULT_SALE_VALUE
) {
    return useMemo(() => {
        const marketplaces = ['shopee', 'mercado_livre', 'magalu'] as Marketplace[];

        return marketplaces.map(mp => {
            const config = configs[mp];
            if (!config) {
                return {
                    marketplace: mp,
                    fees: 0,
                    net: 0,
                    label: mp === 'mercado_livre' ? 'ML' : mp.charAt(0).toUpperCase() + mp.slice(1),
                };
            }

            const impact = calculateImpact(mp, config, saleValue);

            return {
                marketplace: mp,
                fees: impact.fees,
                net: impact.net,
                label: mp === 'mercado_livre' ? 'ML' : mp.charAt(0).toUpperCase() + mp.slice(1),
            };
        });
    }, [configs, saleValue]);
}
