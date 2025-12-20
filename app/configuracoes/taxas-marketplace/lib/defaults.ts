/**
 * Valores padrão para configurações de Marketplace
 * Extraído de app/configuracoes/taxas-marketplace/page.tsx
 */

import { ShopeeConfig, MercadoLivreConfig, MagaluConfig, Marketplace, MarketplaceConfig } from './types';

// =============================================================================
// SHOPEE DEFAULTS
// =============================================================================

export const SHOPEE_DEFAULTS: ShopeeConfig = {
    base_commission: 14,
    free_shipping_commission: 20,
    participates_in_free_shipping: false,
    campaign_fee_default: 2.5,
    campaign_fee_nov_dec: 3.5,
    campaign_start_date: '2024-11-01T00:00',
    campaign_end_date: '2024-12-31T23:59',
    campaigns: [],
    fixed_cost_per_product: 4,
};

// =============================================================================
// MERCADO LIVRE DEFAULTS
// =============================================================================

export const MERCADO_LIVRE_DEFAULTS: MercadoLivreConfig = {
    premium_commission: 16.5,
    fixed_cost_tiers: [
        { max: 79, cost: 5.00 },
        { min: 79, max: 140, cost: 9.00 },
        { min: 140, cost: 13.00 },
    ],
    // Tabela Seed de Frete (Valores Base)
    freight_weight_tiers: [
        { min: 0.5, max: 1, base: 44.90 },
        { min: 1, max: 2, base: 46.90 },
        { min: 2, max: 3, base: 49.90 },
        { min: 3, max: 4, base: 53.90 },
        { min: 4, max: 5, base: 56.90 },
        { min: 5, max: 9, base: 88.90 },
        // Fallback genérico para pesos menores que 0.5 ou maiores que 9 na seed inicial
        // (Usuário deve ajustar)
        { min: 0, max: 0.5, base: 39.90 },
        { min: 9, base: 100.00 }
    ],
    freight_seller_rate_normal: 0.40,
    freight_seller_rate_worst: 0.45,
};

// =============================================================================
// MAGALU DEFAULTS
// =============================================================================

export const MAGALU_DEFAULTS: MagaluConfig = {
    commission: 14.5,
    fixed_cost: 4,
};

// =============================================================================
// COMBINED DEFAULTS
// =============================================================================

export const MARKETPLACE_DEFAULTS: Record<Marketplace, MarketplaceConfig> = {
    shopee: SHOPEE_DEFAULTS,
    mercado_livre: MERCADO_LIVRE_DEFAULTS,
    magalu: MAGALU_DEFAULTS,
};

/**
 * Retorna os valores padrão para um marketplace específico
 */
export function getDefaultConfig(marketplace: Marketplace): MarketplaceConfig {
    return { ...MARKETPLACE_DEFAULTS[marketplace] };
}

// =============================================================================
// MARKETPLACE METADATA
// =============================================================================

export interface MarketplaceInfo {
    id: Marketplace;
    name: string;
    displayName: string;
    color: string;
    colorClass: string;
    logo?: string;
}

export const MARKETPLACE_INFO: Record<Marketplace, MarketplaceInfo> = {
    shopee: {
        id: 'shopee',
        name: 'shopee',
        displayName: 'Shopee',
        color: '#EE4D2D',
        colorClass: 'orange',
        logo: '/logos/shopee.svg',
    },
    mercado_livre: {
        id: 'mercado_livre',
        name: 'mercado_livre',
        displayName: 'Mercado Livre',
        color: '#FFE600',
        colorClass: 'yellow',
        logo: '/logos/mercadolivre.svg',
    },
    magalu: {
        id: 'magalu',
        name: 'magalu',
        displayName: 'Magalu',
        color: '#0086FF',
        colorClass: 'blue',
        logo: '/logos/magalu.svg',
    },
};

/**
 * Lista ordenada de marketplaces
 */
export const MARKETPLACE_ORDER: Marketplace[] = ['shopee', 'mercado_livre', 'magalu'];

// =============================================================================
// VALIDATION THRESHOLDS
// =============================================================================

export const VALIDATION_THRESHOLDS = {
    /** Taxa máxima considerada "normal" (%) */
    MAX_NORMAL_COMMISSION: 30,
    /** Custo fixo máximo considerado "normal" (R$) */
    MAX_NORMAL_FIXED_COST: 50,
    /** Diferença significativa para pedir confirmação (%) */
    SIGNIFICANT_CHANGE_THRESHOLD: 5,
};

// =============================================================================
// SIMULATION DEFAULTS
// =============================================================================

export const SIMULATION_DEFAULTS = {
    /** Valor padrão para simulação de impacto (R$) */
    DEFAULT_SALE_VALUE: 100,
    /** Valores para gráficos de rentabilidade */
    RENTABILITY_CHART: {
        minPrice: 50,
        maxPrice: 500,
        step: 10,
        defaultCost: 50,
    },
};
