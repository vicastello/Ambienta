/**
 * Funções de cálculo de taxas e impacto para Marketplaces
 * Extraído de app/configuracoes/taxas-marketplace/page.tsx
 */

import {
    Marketplace,
    MarketplaceConfig,
    ShopeeConfig,
    MercadoLivreConfig,
    MagaluConfig,
    ImpactPreview,
    isShopeeConfig,
    isMercadoLivreConfig,
    isMagaluConfig,
} from './types';

// =============================================================================
// IMPACT CALCULATIONS
// =============================================================================

/**
 * Calcula o impacto das taxas para uma venda na Shopee
 * Inclui: comissão base/frete, taxa de campanha aplicável, e custo fixo por produto
 */
export function calculateShopeeImpact(
    config: ShopeeConfig,
    saleValue: number
): ImpactPreview {
    // 1. Comissão base (depende se participa do frete grátis)
    const baseCommissionRate = config.participates_in_free_shipping
        ? config.free_shipping_commission
        : config.base_commission;

    // 2. Taxa de campanha aplicável (considera campanhas ativas e período Nov/Dez)
    const campaignFeeRate = getApplicableCampaignFee(config);

    // 3. Total da comissão em %
    const totalCommissionRate = baseCommissionRate + campaignFeeRate;
    const commission = (saleValue * totalCommissionRate) / 100;

    // 5. Custo fixo por produto
    const fixedCost = config.fixed_cost_per_product;

    // 6. Total de taxas
    const totalFees = commission + fixedCost;

    return {
        net: saleValue - totalFees,
        fees: totalFees,
        breakdown: {
            commission,
            fixedCost,
            campaignFee: (saleValue * campaignFeeRate) / 100,
        },
    };
}

/**
 * Calcula o peso volumétrico (kg)
 * Fórmula: (C x L x A) / 6000
 * Dimensões em cm
 */
export function calculateVolumetricWeight(
    length: number,
    width: number,
    height: number
): number {
    return (length * width * height) / 6000;
}

/**
 * Calcula o peso tarifado (cobrável)
 * Maior valor entre peso físico e peso volumétrico
 */
export function calculateChargeableWeight(
    physicalWeight: number,
    volumetricWeight: number
): number {
    return Math.max(physicalWeight, volumetricWeight);
}

/**
 * Encontra a faixa de frete base para um determinado peso
 */
export function lookupBaseFreight(
    weight: number,
    tiers: { min: number; max?: number; base: number }[]
): { min: number; max?: number; base: number } | undefined {
    // Ordena faixas para garantir match correto
    const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);

    return sortedTiers.find(tier => {
        const minOk = weight >= tier.min;
        const maxOk = tier.max === undefined || weight < tier.max;
        return minOk && maxOk;
    });
}

/**
 * Calcula o impacto das taxas para uma venda no Mercado Livre
 */
export function calculateMercadoLivreImpact(
    config: MercadoLivreConfig,
    saleValue: number,
    freightOptions?: {
        weightKg: number;
        dimensions?: { length: number; width: number; height: number };
        includeFreight: boolean;
        isWorstCase: boolean;
    }
): ImpactPreview {
    const commission = (saleValue * config.premium_commission) / 100;

    // Encontra a faixa de custo fixo apropriada
    let fixedCost = 0;
    for (const tier of config.fixed_cost_tiers) {
        const minOk = tier.min === undefined || saleValue >= tier.min;
        const maxOk = tier.max === undefined || saleValue < tier.max;
        if (minOk && maxOk) {
            fixedCost = tier.cost;
            break;
        }
    }

    // Regra especial: produtos abaixo de R$ 12,50 pagam 50% do custo fixo
    if (saleValue < 12.50) {
        fixedCost = fixedCost * 0.5;
    }

    let freightCost = 0;

    // Frete
    // Obrigatório se preço >= 79
    const isFreightMandatory = saleValue >= 79.0;
    const shouldCalculateFreight = (freightOptions?.includeFreight || isFreightMandatory) &&
        (freightOptions?.weightKg || 0) > 0 &&
        !!config.freight_weight_tiers;

    if (shouldCalculateFreight && freightOptions) {
        let chargeableWeight = freightOptions.weightKg;

        // Se dimensões fornecidas, calcula volumétrico
        if (freightOptions.dimensions) {
            const volWeight = calculateVolumetricWeight(
                freightOptions.dimensions.length,
                freightOptions.dimensions.width,
                freightOptions.dimensions.height
            );
            chargeableWeight = calculateChargeableWeight(freightOptions.weightKg, volWeight);
        }

        const tierLookup = lookupBaseFreight(chargeableWeight, config.freight_weight_tiers);

        if (tierLookup) {
            const rate = freightOptions.isWorstCase
                ? config.freight_seller_rate_worst
                : config.freight_seller_rate_normal;

            freightCost = tierLookup.base * rate;
        }
    }

    const totalFees = commission + fixedCost + freightCost;

    return {
        net: saleValue - totalFees,
        fees: totalFees,
        breakdown: {
            commission,
            fixedCost,
            freightCost, // Campo novo
        },
    };
}

/**
 * Calcula o impacto das taxas para uma venda na Magalu
 */
export function calculateMagaluImpact(
    config: MagaluConfig,
    saleValue: number
): ImpactPreview {
    const commission = (saleValue * config.commission) / 100;
    const fixedCost = config.fixed_cost;
    const totalFees = commission + fixedCost;

    return {
        net: saleValue - totalFees,
        fees: totalFees,
        breakdown: {
            commission,
            fixedCost,
        },
    };
}

/**
 * Calcula o impacto das taxas para qualquer marketplace
 */
export function calculateImpact(
    marketplace: Marketplace,
    config: MarketplaceConfig,
    saleValue: number = 100,
    options?: {
        weightKg?: number;
        dimensions?: { length: number; width: number; height: number };
        includeFreight?: boolean;
        isWorstCase?: boolean;
    }
): ImpactPreview {
    if (marketplace === 'shopee' && isShopeeConfig(config)) {
        return calculateShopeeImpact(config, saleValue);
    }

    if (marketplace === 'mercado_livre' && isMercadoLivreConfig(config)) {
        return calculateMercadoLivreImpact(config, saleValue, options ? {
            weightKg: options.weightKg || 0,
            dimensions: options.dimensions,
            includeFreight: options.includeFreight || false,
            isWorstCase: options.isWorstCase || false
        } : undefined);
    }

    if (marketplace === 'magalu' && isMagaluConfig(config)) {
        return calculateMagaluImpact(config, saleValue);
    }

    // Fallback
    return { net: 0, fees: 0 };
}

/**
 * Calcula a taxa total em porcentagem para qualquer marketplace
 */
export function calculateTotalTax(
    config: MarketplaceConfig
): number {
    if (isShopeeConfig(config)) {
        const baseRate = config.participates_in_free_shipping
            ? config.free_shipping_commission
            : config.base_commission;
        return baseRate + config.campaign_fee_default;
    }

    if (isMercadoLivreConfig(config)) {
        return config.premium_commission;
    }

    if (isMagaluConfig(config)) {
        return config.commission;
    }

    return 0;
}


// =============================================================================
// COMPARISON CALCULATIONS
// =============================================================================

export interface MarketplaceComparison {
    marketplace: Marketplace;
    net: number;
    fees: number;
    feePercentage: number;
}

/**
 * Compara o impacto entre todos os marketplaces
 */
export function compareMarketplaces(
    configs: Record<Marketplace, MarketplaceConfig>,
    saleValue: number = 100
): MarketplaceComparison[] {
    const comparisons: MarketplaceComparison[] = [];

    for (const marketplace of ['shopee', 'mercado_livre', 'magalu'] as Marketplace[]) {
        const config = configs[marketplace];
        if (!config) continue;

        const impact = calculateImpact(marketplace, config, saleValue);
        comparisons.push({
            marketplace,
            net: impact.net,
            fees: impact.fees,
            feePercentage: (impact.fees / saleValue) * 100,
        });
    }

    // Ordena por maior valor líquido (melhor opção primeiro)
    return comparisons.sort((a, b) => b.net - a.net);
}

/**
 * Retorna o marketplace com melhor valor líquido
 */
export function getBestMarketplace(
    configs: Record<Marketplace, MarketplaceConfig>,
    saleValue: number = 100
): MarketplaceComparison | null {
    const comparisons = compareMarketplaces(configs, saleValue);
    return comparisons[0] || null;
}

// =============================================================================
// CAMPAIGN CALCULATIONS
// =============================================================================

/**
 * Verifica se uma data está dentro do período de uma campanha
 */
export function isDateInCampaign(
    date: Date,
    startDate: string,
    endDate: string
): boolean {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return date >= start && date <= end;
}

/**
 * Retorna a taxa de campanha aplicável para uma data específica (Shopee)
 */
export function getApplicableCampaignFee(
    config: ShopeeConfig,
    date: Date = new Date()
): number {
    // Verifica campanhas personalizadas primeiro (ordem de prioridade)
    if (config.campaigns && config.campaigns.length > 0) {
        // Ordena por data de criação (mais recente tem prioridade)
        const activeCampaigns = config.campaigns
            .filter(c => c.is_active && isDateInCampaign(date, c.start_date, c.end_date));

        if (activeCampaigns.length > 0) {
            // Retorna a taxa da campanha mais recente
            return activeCampaigns[activeCampaigns.length - 1].fee_rate;
        }
    }

    // Verifica período Nov/Dez
    if (isDateInCampaign(date, config.campaign_start_date, config.campaign_end_date)) {
        return config.campaign_fee_nov_dec;
    }

    // Taxa padrão
    return config.campaign_fee_default;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Formata um valor como moeda brasileira
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

/**
 * Formata um valor como porcentagem
 */
export function formatPercentage(value: number, decimals: number = 1): string {
    return `${value.toFixed(decimals)}%`;
}

/**
 * Calcula a diferença percentual entre dois valores
 */
export function calculatePercentageDiff(oldValue: number, newValue: number): number {
    return Math.abs(newValue - oldValue);
}

/**
 * Verifica se uma mudança é "significativa" (> threshold)
 */
export function isSignificantChange(
    oldValue: number,
    newValue: number,
    threshold: number = 5
): boolean {
    return calculatePercentageDiff(oldValue, newValue) > threshold;
}
