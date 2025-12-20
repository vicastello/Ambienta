/**
 * Tipos e interfaces para configurações de Marketplace
 * Extraído de app/configuracoes/taxas-marketplace/page.tsx
 */

// =============================================================================
// CAMPAIGN TYPES
// =============================================================================

/**
 * Representa uma campanha promocional com taxa diferenciada
 */
export interface Campaign {
    /** UUID único da campanha */
    id: string;
    /** Nome descritivo (ex: "Black Friday 2024") */
    name: string;
    /** Taxa percentual da campanha */
    fee_rate: number;
    /** Data/hora de início (ISO 8601) */
    start_date: string;
    /** Data/hora de término (ISO 8601) */
    end_date: string;
    /** Se a campanha está ativa (pode ser desativada sem excluir) */
    is_active: boolean;
}

/**
 * Dados do formulário de campanha (sem ID)
 */
export interface CampaignFormData {
    name: string;
    fee_rate: number;
    start_date: string;
    end_date: string;
    is_active: boolean;
}

// =============================================================================
// MARKETPLACE CONFIG TYPES
// =============================================================================

/**
 * Configuração completa da Shopee
 */
export interface ShopeeConfig {
    /** Comissão base do marketplace (%) */
    base_commission: number;
    /** Comissão com programa de frete grátis (%) */
    free_shipping_commission: number;
    /** Se participa do programa de frete grátis */
    participates_in_free_shipping: boolean;
    /** Taxa de campanha padrão fora de Nov/Dez (%) */
    campaign_fee_default: number;
    /** Taxa de campanha em Nov/Dez (%) */
    campaign_fee_nov_dec: number;
    /** Data de início do período Nov/Dez */
    campaign_start_date: string;
    /** Data de término do período Nov/Dez */
    campaign_end_date: string;
    /** Campanhas personalizadas */
    campaigns?: Campaign[];
    /** Custo fixo por produto (R$) */
    fixed_cost_per_product: number;
}

/**
 * Faixa de custo fixo do Mercado Livre
 */
export interface MercadoLivreTier {
    /** Valor mínimo da faixa (R$) */
    min?: number;
    /** Valor máximo da faixa (R$) */
    max?: number;
    /** Custo fixo dessa faixa (R$) */
    cost: number;
}

/**
 * Configuração completa do Mercado Livre
 */
export interface MercadoLivreConfig {
    /** Comissão para anúncios Premium (%) */
    premium_commission: number;
    /** Faixas de custo fixo por valor do pedido */
    fixed_cost_tiers: MercadoLivreTier[];
    /** Faixas de peso para frete base */
    freight_weight_tiers: FreightWeightTier[];
    /** Taxa de repasse do frete (Cenário Normal - ex: 0.40) */
    freight_seller_rate_normal: number;
    /** Taxa de repasse do frete (Pior Cenário - ex: 0.45) */
    freight_seller_rate_worst: number;
}

/**
 * Faixa de peso para cálculo de frete base
 */
export interface FreightWeightTier {
    /** Peso mínimo (kg) */
    min: number;
    /** Peso máximo (kg) - null/undefined significa "acima de" */
    max?: number;
    /** Valor base do frete (R$) */
    base: number;
}

/**
 * Configuração completa da Magalu
 */
export interface MagaluConfig {
    /** Comissão do marketplace (%) */
    commission: number;
    /** Custo fixo por venda (R$) */
    fixed_cost: number;
}

/**
 * Union type para qualquer configuração de marketplace
 */
export type MarketplaceConfig = ShopeeConfig | MercadoLivreConfig | MagaluConfig;

/**
 * Identificadores dos marketplaces suportados
 */
export type Marketplace = 'shopee' | 'mercado_livre' | 'magalu';

/**
 * Mapa de configurações por marketplace
 */
export type MarketplaceConfigs = Record<Marketplace, MarketplaceConfig>;

// =============================================================================
// VALIDATION TYPES
// =============================================================================

/**
 * Resultado de validação de configuração
 */
export interface ConfigValidationResult {
    /** Se a configuração é válida */
    valid: boolean;
    /** Lista de erros críticos */
    errors: string[];
    /** Lista de avisos (não bloqueantes) */
    warnings: string[];
}

/**
 * Mapa de resultados de validação por marketplace
 */
export type ValidationResults = Record<Marketplace, ConfigValidationResult>;

// =============================================================================
// IMPACT PREVIEW TYPES
// =============================================================================

/**
 * Resultado do cálculo de impacto de taxas
 */
export interface ImpactPreview {
    /** Valor líquido após taxas (R$) */
    net: number;
    /** Total de taxas descontadas (R$) */
    fees: number;
    /** Breakdown das taxas */
    breakdown?: {
        commission: number;
        fixedCost: number;
        campaignFee?: number;
        freightCost?: number;
        freightBase?: number; // Opcional, para display
    };
}

// =============================================================================
// UI STATE TYPES
// =============================================================================

/**
 * Estado de mensagem do sistema
 */
export interface SystemMessage {
    type: 'success' | 'error' | 'warning';
    text: string;
}

/**
 * Dados para confirmação de salvamento
 */
export interface PendingSave {
    marketplace: Marketplace;
    config: MarketplaceConfig;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Verifica se a config é do tipo ShopeeConfig
 */
export function isShopeeConfig(config: MarketplaceConfig): config is ShopeeConfig {
    return 'base_commission' in config && 'participates_in_free_shipping' in config;
}

/**
 * Verifica se a config é do tipo MercadoLivreConfig
 */
export function isMercadoLivreConfig(config: MarketplaceConfig): config is MercadoLivreConfig {
    return 'premium_commission' in config && 'fixed_cost_tiers' in config;
}

/**
 * Verifica se a config é do tipo MagaluConfig
 */
export function isMagaluConfig(config: MarketplaceConfig): config is MagaluConfig {
    return 'commission' in config && 'fixed_cost' in config && !('base_commission' in config);
}
