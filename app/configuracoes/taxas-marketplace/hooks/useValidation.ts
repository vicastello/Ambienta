'use client';

/**
 * Hook para validação em tempo real de configurações de Marketplace
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Marketplace,
    MarketplaceConfig,
    ShopeeConfig,
    MercadoLivreConfig,
    MagaluConfig,
    ConfigValidationResult,
    isShopeeConfig,
    isMercadoLivreConfig,
    isMagaluConfig,
} from '../lib/types';
import { VALIDATION_THRESHOLDS } from '../lib/defaults';
import { validateAllConfigs } from '@/lib/validations/marketplace-config';

interface UseValidationReturn {
    // Estado
    validationResults: Record<string, ConfigValidationResult>;
    dateError: string | null;
    warnings: Record<string, string[]>;
    hasErrors: boolean;

    // Ações
    validateDateRange: (startDate: string, endDate: string) => boolean;
    validateField: (marketplace: string, config: MarketplaceConfig) => string[];
    getMarketplaceValidation: (marketplace: Marketplace) => ConfigValidationResult | null;
}

export function useValidation(
    configs: Record<string, MarketplaceConfig>
): UseValidationReturn {
    const [validationResults, setValidationResults] = useState<Record<string, ConfigValidationResult>>({});
    const [dateError, setDateError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<Record<string, string[]>>({});

    // Valida todas as configs quando mudam
    useEffect(() => {
        if (Object.keys(configs).length > 0) {
            const results = validateAllConfigs(configs);
            setValidationResults(results);
        }
    }, [configs]);

    // Valida intervalo de datas
    const validateDateRange = useCallback((startDate: string, endDate: string): boolean => {
        if (!startDate || !endDate) {
            setDateError(null);
            return true;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start >= end) {
            setDateError('A data de término deve ser posterior à data de início');
            return false;
        }

        setDateError(null);
        return true;
    }, []);

    // Valida campos específicos e retorna warnings
    const validateField = useCallback((marketplace: string, config: MarketplaceConfig): string[] => {
        const fieldWarnings: string[] = [];
        const { MAX_NORMAL_COMMISSION, MAX_NORMAL_FIXED_COST } = VALIDATION_THRESHOLDS;

        if (isShopeeConfig(config)) {
            const shopeeConfig = config as ShopeeConfig;

            if (shopeeConfig.base_commission > MAX_NORMAL_COMMISSION) {
                fieldWarnings.push('Taxa base acima de 30% - valor incomum');
            }
            if (shopeeConfig.base_commission < 0) {
                fieldWarnings.push('Taxa base não pode ser negativa');
            }
            if (shopeeConfig.free_shipping_commission > MAX_NORMAL_COMMISSION) {
                fieldWarnings.push('Taxa com frete grátis acima de 30% - valor incomum');
            }
            if (shopeeConfig.fixed_cost_per_product > MAX_NORMAL_FIXED_COST) {
                fieldWarnings.push('Custo fixo muito alto (> R$ 50)');
            }
            if (shopeeConfig.fixed_cost_per_product < 0) {
                fieldWarnings.push('Custo fixo não pode ser negativo');
            }
        }

        if (isMercadoLivreConfig(config)) {
            const mlConfig = config as MercadoLivreConfig;

            if (mlConfig.premium_commission > MAX_NORMAL_COMMISSION) {
                fieldWarnings.push('Taxa premium acima de 30% - valor incomum');
            }
            if (mlConfig.premium_commission < 0) {
                fieldWarnings.push('Taxa premium não pode ser negativa');
            }
        }

        if (isMagaluConfig(config)) {
            const magaluConfig = config as MagaluConfig;

            if (magaluConfig.commission > MAX_NORMAL_COMMISSION) {
                fieldWarnings.push('Taxa acima de 30% - valor incomum');
            }
            if (magaluConfig.commission < 0) {
                fieldWarnings.push('Taxa não pode ser negativa');
            }
            if (magaluConfig.fixed_cost > MAX_NORMAL_FIXED_COST) {
                fieldWarnings.push('Custo fixo muito alto (> R$ 50)');
            }
            if (magaluConfig.fixed_cost < 0) {
                fieldWarnings.push('Custo fixo não pode ser negativo');
            }
        }

        // Atualiza estado de warnings
        setWarnings(prev => ({
            ...prev,
            [marketplace]: fieldWarnings,
        }));

        return fieldWarnings;
    }, []);

    // Retorna validação de um marketplace específico
    const getMarketplaceValidation = useCallback((marketplace: Marketplace): ConfigValidationResult | null => {
        return validationResults[marketplace] || null;
    }, [validationResults]);

    // Verifica se há erros em qualquer marketplace
    const hasErrors = useMemo(() => {
        return Object.values(validationResults).some(r => !r.valid);
    }, [validationResults]);

    return {
        validationResults,
        dateError,
        warnings,
        hasErrors,
        validateDateRange,
        validateField,
        getMarketplaceValidation,
    };
}
