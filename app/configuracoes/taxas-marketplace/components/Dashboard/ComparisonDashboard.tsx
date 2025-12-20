'use client';

/**
 * Dashboard de comparação entre marketplaces
 * Combina MarketplaceCards e QuickImpactCards
 */

import { Marketplace, MarketplaceConfig, ConfigValidationResult } from '../../lib/types';
import { calculateImpact, compareMarketplaces } from '../../lib/calculations';
import { MARKETPLACE_ORDER } from '../../lib/defaults';
import { MarketplaceCard } from './MarketplaceCard';
import { QuickImpactCards } from './QuickImpactCards';

interface ComparisonDashboardProps {
    /** Configurações de todos os marketplaces */
    configs: Record<string, MarketplaceConfig>;
    /** Resultados de validação */
    validationResults: Record<string, ConfigValidationResult>;
    /** Marketplace ativo/selecionado */
    activeMarketplace: Marketplace;
    /** Callback ao selecionar marketplace */
    onSelectMarketplace: (marketplace: Marketplace) => void;
    /** Valor para simulação */
    saleValue?: number;
    /** Classes CSS adicionais */
    className?: string;
}

export function ComparisonDashboard({
    configs,
    validationResults,
    activeMarketplace,
    onSelectMarketplace,
    saleValue = 100,
    className = '',
}: ComparisonDashboardProps) {
    // Calcula comparação
    const comparison = compareMarketplaces(
        configs as Record<Marketplace, MarketplaceConfig>,
        saleValue
    );

    return (
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${className}`}>
            {/* Cards de Marketplace */}
            <div className="lg:col-span-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {MARKETPLACE_ORDER.map((marketplace) => {
                        const config = configs[marketplace];
                        if (!config) return null;

                        const impact = calculateImpact(marketplace, config, saleValue);

                        return (
                            <MarketplaceCard
                                key={marketplace}
                                marketplace={marketplace}
                                isActive={activeMarketplace === marketplace}
                                impact={impact}
                                validation={validationResults[marketplace]}
                                onClick={() => onSelectMarketplace(marketplace)}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Quick Impact Cards */}
            <div>
                <QuickImpactCards
                    comparison={comparison}
                    saleValue={saleValue}
                />
            </div>
        </div>
    );
}
