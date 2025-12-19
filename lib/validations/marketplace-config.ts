export interface ValidationResult {
    valid: boolean;
    error?: string;
    warning?: string;
}

export interface ConfigValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Mensagens de erro em português
 */
export const ERROR_MESSAGES = {
    COMMISSION_NEGATIVE: 'Comissão não pode ser negativa',
    COMMISSION_OVER_100: 'Comissão não pode exceder 100%',
    COMMISSION_HIGH: 'Comissão muito alta (acima de 30%)',
    COST_NEGATIVE: 'Custo não pode ser negativo',
    COST_HIGH: 'Custo fixo suspeito (acima de R$ 50)',
    DATE_INVALID: 'Data inválida',
    DATE_RANGE_INVALID: 'Data final deve ser posterior à inicial',
    FREE_SHIPPING_LOW: 'Frete grátis geralmente tem comissão maior que base',
    CAMPAIGN_FEE_HIGH: 'Taxa de campanha muito alta (acima de 10%)',
};

/**
 * Valida comissão (porcentagem)
 */
export function validateCommission(value: number, fieldName: string = 'Comissão'): ValidationResult {
    if (value < 0) {
        return { valid: false, error: `${fieldName}: ${ERROR_MESSAGES.COMMISSION_NEGATIVE}` };
    }
    if (value > 100) {
        return { valid: false, error: `${fieldName}: ${ERROR_MESSAGES.COMMISSION_OVER_100}` };
    }
    if (value > 30) {
        return { valid: true, warning: `${fieldName}: ${ERROR_MESSAGES.COMMISSION_HIGH}` };
    }
    return { valid: true };
}

/**
 * Valida custo fixo
 */
export function validateFixedCost(value: number, fieldName: string = 'Custo fixo'): ValidationResult {
    if (value < 0) {
        return { valid: false, error: `${fieldName}: ${ERROR_MESSAGES.COST_NEGATIVE}` };
    }
    if (value > 50) {
        return { valid: true, warning: `${fieldName}: ${ERROR_MESSAGES.COST_HIGH}` };
    }
    return { valid: true };
}

/**
 * Valida range de datas
 */
export function validateDateRange(start: string, end: string): ValidationResult {
    if (!start || !end) {
        return { valid: true }; // Optional fields
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime())) {
        return { valid: false, error: `Data inicial: ${ERROR_MESSAGES.DATE_INVALID}` };
    }
    if (isNaN(endDate.getTime())) {
        return { valid: false, error: `Data final: ${ERROR_MESSAGES.DATE_INVALID}` };
    }
    if (endDate <= startDate) {
        return { valid: false, error: ERROR_MESSAGES.DATE_RANGE_INVALID };
    }

    return { valid: true };
}

/**
 * Valida configuração Shopee completa
 */
export function validateShopeeConfig(config: any): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Base commission
    const baseCommCheck = validateCommission(config.base_commission, 'Comissão Base');
    if (!baseCommCheck.valid && baseCommCheck.error) errors.push(baseCommCheck.error);
    if (baseCommCheck.warning) warnings.push(baseCommCheck.warning);

    // Free shipping commission
    const freeShipCheck = validateCommission(config.free_shipping_commission, 'Comissão Frete Grátis');
    if (!freeShipCheck.valid && freeShipCheck.error) errors.push(freeShipCheck.error);
    if (freeShipCheck.warning) warnings.push(freeShipCheck.warning);

    // Cross-field: free shipping should be >= base
    if (config.free_shipping_commission < config.base_commission) {
        warnings.push(ERROR_MESSAGES.FREE_SHIPPING_LOW);
    }

    // Campaign fees
    const campaignDefaultCheck = validateCommission(config.campaign_fee_default, 'Taxa Campanha Padrão');
    if (!campaignDefaultCheck.valid && campaignDefaultCheck.error) errors.push(campaignDefaultCheck.error);
    if (config.campaign_fee_default > 10) {
        warnings.push(`Taxa Campanha Padrão: ${ERROR_MESSAGES.CAMPAIGN_FEE_HIGH}`);
    }

    const campaignNovDecCheck = validateCommission(config.campaign_fee_nov_dec, 'Taxa Campanha Nov/Dez');
    if (!campaignNovDecCheck.valid && campaignNovDecCheck.error) errors.push(campaignNovDecCheck.error);
    if (config.campaign_fee_nov_dec > 10) {
        warnings.push(`Taxa Campanha Nov/Dez: ${ERROR_MESSAGES.CAMPAIGN_FEE_HIGH}`);
    }

    // Fixed cost
    const fixedCostCheck = validateFixedCost(config.fixed_cost_per_product);
    if (!fixedCostCheck.valid && fixedCostCheck.error) errors.push(fixedCostCheck.error);
    if (fixedCostCheck.warning) warnings.push(fixedCostCheck.warning);

    // Campaign dates
    if (config.campaign_start_date && config.campaign_end_date) {
        const dateCheck = validateDateRange(config.campaign_start_date, config.campaign_end_date);
        if (!dateCheck.valid && dateCheck.error) errors.push(dateCheck.error);
    }

    // Validate campaigns array
    if (config.campaigns && Array.isArray(config.campaigns)) {
        config.campaigns.forEach((campaign: any, index: number) => {
            const campaignFeeCheck = validateCommission(campaign.fee_rate, `Campanha "${campaign.name}" - Taxa`);
            if (!campaignFeeCheck.valid && campaignFeeCheck.error) {
                errors.push(campaignFeeCheck.error);
            }

            const campaignDateCheck = validateDateRange(campaign.start_date, campaign.end_date);
            if (!campaignDateCheck.valid && campaignDateCheck.error) {
                errors.push(`Campanha "${campaign.name}": ${campaignDateCheck.error}`);
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Valida configuração Mercado Livre
 */
export function validateMercadoLivreConfig(config: any): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Premium commission
    const commCheck = validateCommission(config.premium_commission, 'Comissão Premium');
    if (!commCheck.valid && commCheck.error) errors.push(commCheck.error);
    if (commCheck.warning) warnings.push(commCheck.warning);

    // Fixed cost tiers
    if (config.fixed_cost_tiers && Array.isArray(config.fixed_cost_tiers)) {
        config.fixed_cost_tiers.forEach((tier: any, index: number) => {
            const costCheck = validateFixedCost(tier.cost, `Faixa ${index + 1} - Custo`);
            if (!costCheck.valid && costCheck.error) errors.push(costCheck.error);

            // Check for reasonable tier ranges
            if (tier.min !== undefined && tier.min < 0) {
                errors.push(`Faixa ${index + 1}: Valor mínimo não pode ser negativo`);
            }
            if (tier.max !== undefined && tier.max < 0) {
                errors.push(`Faixa ${index + 1}: Valor máximo não pode ser negativo`);
            }
            if (tier.min !== undefined && tier.max !== undefined && tier.max <= tier.min) {
                errors.push(`Faixa ${index + 1}: Valor máximo deve ser maior que o mínimo`);
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Valida configuração Magalu
 */
export function validateMagaluConfig(config: any): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Commission
    const commCheck = validateCommission(config.commission, 'Comissão');
    if (!commCheck.valid && commCheck.error) errors.push(commCheck.error);
    if (commCheck.warning) warnings.push(commCheck.warning);

    // Fixed cost
    const costCheck = validateFixedCost(config.fixed_cost);
    if (!costCheck.valid && costCheck.error) errors.push(costCheck.error);
    if (costCheck.warning) warnings.push(costCheck.warning);

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Valida todas as configurações
 */
export function validateAllConfigs(configs: Record<string, any>): Record<string, ConfigValidationResult> {
    const results: Record<string, ConfigValidationResult> = {};

    if (configs.shopee) {
        results.shopee = validateShopeeConfig(configs.shopee);
    }

    if (configs.mercado_livre) {
        results.mercado_livre = validateMercadoLivreConfig(configs.mercado_livre);
    }

    if (configs.magalu) {
        results.magalu = validateMagaluConfig(configs.magalu);
    }

    return results;
}
