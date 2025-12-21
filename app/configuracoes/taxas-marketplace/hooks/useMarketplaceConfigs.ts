'use client';

/**
 * Hook para gerenciar estado e operações de configurações de Marketplace
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Marketplace,
    MarketplaceConfig,
    ShopeeConfig,
    MercadoLivreConfig,
    SystemMessage,
    PendingSave,
} from '../lib/types';
import { MARKETPLACE_DEFAULTS } from '../lib/defaults';
import { saveBackup, getLastBackup, restoreBackup } from '@/lib/config-backup';

interface UseMarketplaceConfigsReturn {
    // Estado
    configs: Record<string, MarketplaceConfig>;
    originalConfigs: Record<string, MarketplaceConfig>;
    loading: boolean;
    saving: boolean;
    message: SystemMessage | null;
    canUndo: boolean;

    // Ações
    loadConfigs: () => Promise<void>;
    saveConfig: (marketplace: string, config: MarketplaceConfig) => Promise<void>;
    updateConfig: (marketplace: string, updates: Partial<MarketplaceConfig>) => void;
    restoreDefaults: (marketplace: Marketplace) => void;
    handleUndo: () => void;
    showMessage: (type: SystemMessage['type'], text: string) => void;
    clearMessage: () => void;
}

export function useMarketplaceConfigs(): UseMarketplaceConfigsReturn {
    const [configs, setConfigs] = useState<Record<string, MarketplaceConfig>>({});
    const [originalConfigs, setOriginalConfigs] = useState<Record<string, MarketplaceConfig>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<SystemMessage | null>(null);
    const [canUndo, setCanUndo] = useState(false);

    // Carrega configurações da API
    const loadConfigs = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/configuracoes/taxas-marketplace');
            const data = await response.json();

            const configMap: Record<string, MarketplaceConfig> = {};
            data.forEach((item: { marketplace: string; config: MarketplaceConfig }) => {
                const defaultConfig = MARKETPLACE_DEFAULTS[item.marketplace as Marketplace];
                let config = { ...defaultConfig, ...item.config } as MarketplaceConfig;

                // Critical Fix: Ensure Mercado Livre has fixed_cost_tiers covering all ranges
                if (item.marketplace === 'mercado_livre') {
                    const mlConfig = config as MercadoLivreConfig;
                    const defaultTiers = (MARKETPLACE_DEFAULTS['mercado_livre'] as MercadoLivreConfig).fixed_cost_tiers;

                    // Case 1: Empty tiers -> Use defaults
                    if (!mlConfig.fixed_cost_tiers || mlConfig.fixed_cost_tiers.length === 0) {
                        config = { ...config, fixed_cost_tiers: defaultTiers };
                    }
                    // Case 2: Incomplete tiers (ends with a max limit) -> Append defaults for higher values
                    else {
                        const hasOpenEndedTier = mlConfig.fixed_cost_tiers.some(t => t.max === undefined);
                        console.log('DEBUG: ML Config check', { tiers: mlConfig.fixed_cost_tiers, hasOpenEndedTier });

                        if (!hasOpenEndedTier) {
                            // Find the highest max covered by current config
                            const maxCovered = Math.max(...mlConfig.fixed_cost_tiers.map(t => t.max || 0));
                            console.log('DEBUG: Max covered', maxCovered);

                            // Find default tiers that start at or above this max
                            const missingTiers = defaultTiers.filter(t => (t.min || 0) >= maxCovered);
                            console.log('DEBUG: Missing tiers to append', missingTiers);

                            // Append missing tiers
                            config = {
                                ...config,
                                fixed_cost_tiers: [...mlConfig.fixed_cost_tiers, ...missingTiers]
                            };
                        }
                    }


                    // Critical Fix 2: Backfill missing Freight Configs (for legacy data)
                    const defaultML = MARKETPLACE_DEFAULTS['mercado_livre'] as MercadoLivreConfig;
                    if (!mlConfig.freight_weight_tiers || mlConfig.freight_weight_tiers.length === 0) {
                        config = {
                            ...config,
                            freight_weight_tiers: defaultML.freight_weight_tiers,
                        };
                    }
                    if (mlConfig.freight_seller_rate_normal === undefined) {
                        config = { ...config, freight_seller_rate_normal: defaultML.freight_seller_rate_normal };
                    }
                    if (mlConfig.freight_seller_rate_worst === undefined) {
                        config = { ...config, freight_seller_rate_worst: defaultML.freight_seller_rate_worst };
                    }
                }

                // Special handling for Shopee
                if (item.marketplace === 'shopee') {
                    const shopeeConfig = config as ShopeeConfig;

                    config = {
                        ...config,
                        campaigns: shopeeConfig.campaigns || [],
                    } as ShopeeConfig;
                }

                configMap[item.marketplace] = config;
            });

            setConfigs(configMap);
            setOriginalConfigs(configMap);
        } catch (error) {
            console.error('Error loading configs:', error);
            showMessage('error', 'Erro ao carregar configurações');
        } finally {
            setLoading(false);
        }
    }, []);

    // Salva configuração na API
    const saveConfig = useCallback(async (marketplace: string, config: MarketplaceConfig) => {
        try {
            setSaving(true);

            // Backup antes de salvar
            saveBackup(configs, `Before updating ${marketplace}`);

            const response = await fetch('/api/configuracoes/taxas-marketplace', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ marketplace, config }),
            });

            if (!response.ok) {
                throw new Error('Failed to save config');
            }

            showMessage('success', 'Configuração salva com sucesso!');
            await loadConfigs();
        } catch (error) {
            console.error('Error saving config:', error);
            showMessage('error', 'Erro ao salvar configuração');
        } finally {
            setSaving(false);
        }
    }, [configs, loadConfigs]);

    // Atualiza configuração localmente (sem salvar)
    const updateConfig = useCallback((marketplace: string, updates: Partial<MarketplaceConfig>) => {
        setConfigs(prev => ({
            ...prev,
            [marketplace]: { ...prev[marketplace], ...updates } as MarketplaceConfig,
        }));
    }, []);

    // Restaura valores padrão
    const restoreDefaults = useCallback((marketplace: Marketplace) => {
        if (confirm(`Restaurar valores padrão para ${marketplace}?`)) {
            setConfigs(prev => ({
                ...prev,
                [marketplace]: MARKETPLACE_DEFAULTS[marketplace],
            }));
            showMessage('success', 'Valores padrão restaurados! Lembre-se de salvar.');
        }
    }, []);

    // Desfaz última alteração
    const handleUndo = useCallback(() => {
        const backup = restoreBackup(0);
        if (backup) {
            setConfigs(backup);
            showMessage('success', 'Configurações restauradas!');
        }
    }, []);

    // Mostra mensagem temporária
    const showMessage = useCallback((type: SystemMessage['type'], text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    }, []);

    // Limpa mensagem
    const clearMessage = useCallback(() => {
        setMessage(null);
    }, []);

    // Carrega configs na montagem
    useEffect(() => {
        loadConfigs();
    }, [loadConfigs]);

    // Verifica se pode desfazer
    useEffect(() => {
        const lastBackup = getLastBackup();
        setCanUndo(lastBackup !== null);
    }, [configs]);

    return {
        configs,
        originalConfigs,
        loading,
        saving,
        message,
        canUndo,
        loadConfigs,
        saveConfig,
        updateConfig,
        restoreDefaults,
        handleUndo,
        showMessage,
        clearMessage,
    };
}
