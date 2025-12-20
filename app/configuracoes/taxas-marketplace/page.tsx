'use client';

import { useState, useMemo } from 'react';
import { Save, RotateCcw, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useMarketplaceConfigs, useImpactPreview } from './hooks';
import { MarketplaceTabs } from './components/Navigation';
import { SimulatorPanel } from './components/Sidebar';
import { ShopeeConfigPanel, MercadoLivreConfigPanel, MagaluConfigPanel } from './components/ConfigPanels';
import { ImpactPreviewCard } from './components/Shared';
import type { ShopeeConfig, MercadoLivreConfig, MagaluConfig, Marketplace, Campaign } from './lib/types';
import { MARKETPLACE_DEFAULTS } from './lib/defaults';

type TabId = 'shopee' | 'mercadoLivre' | 'magalu';

// Map tab ID to marketplace key
const TAB_TO_MARKETPLACE: Record<TabId, string> = {
    shopee: 'shopee',
    mercadoLivre: 'mercado_livre',
    magalu: 'magalu',
};

const TAB_COLOR_SCHEMES: Record<TabId, 'blue' | 'yellow' | 'indigo'> = {
    shopee: 'blue',
    mercadoLivre: 'yellow',
    magalu: 'indigo',
};

export default function TaxasMarketplacePage() {
    const [activeTab, setActiveTab] = useState<TabId>('shopee');

    const {
        configs,
        loading,
        saving,
        saveConfig,
        updateConfig,
        restoreDefaults,
        message,
    } = useMarketplaceConfigs();

    // Extract typed configs with defaults
    const shopeeConfig = useMemo(
        () => (configs['shopee'] as ShopeeConfig) || MARKETPLACE_DEFAULTS.shopee,
        [configs]
    );
    const mercadoLivreConfig = useMemo(
        () => (configs['mercado_livre'] as MercadoLivreConfig) || MARKETPLACE_DEFAULTS.mercado_livre,
        [configs]
    );
    const magaluConfig = useMemo(
        () => (configs['magalu'] as MagaluConfig) || MARKETPLACE_DEFAULTS.magalu,
        [configs]
    );

    // Get current config and impact for active tab
    const currentMarketplace = TAB_TO_MARKETPLACE[activeTab] as Marketplace;
    const currentConfig = useMemo(() => {
        if (activeTab === 'shopee') return shopeeConfig;
        if (activeTab === 'mercadoLivre') return mercadoLivreConfig;
        return magaluConfig;
    }, [activeTab, shopeeConfig, mercadoLivreConfig, magaluConfig]);

    const impact = useImpactPreview(currentMarketplace, currentConfig);

    // Handlers for config updates
    const handleShopeeUpdate = (updates: Partial<ShopeeConfig>) => {
        updateConfig('shopee', updates);
    };
    const handleMLUpdate = (updates: Partial<MercadoLivreConfig>) => {
        updateConfig('mercado_livre', updates);
    };
    const handleMagaluUpdate = (updates: Partial<MagaluConfig>) => {
        updateConfig('magalu', updates);
    };

    // Save and reset for current marketplace
    const handleSave = async () => {
        await saveConfig(currentMarketplace, configs[currentMarketplace]);
    };
    const handleReset = () => {
        restoreDefaults(currentMarketplace);
    };

    // Auto-save handler for Shopee campaigns - receives the updated campaigns directly
    const handleShopeeAutoSave = async (updatedCampaigns: Campaign[]) => {
        // Use the passed campaigns array directly (not from state that may be stale)
        const configWithUpdatedCampaigns: ShopeeConfig = {
            ...shopeeConfig,
            ...configs['shopee'],
            campaigns: updatedCampaigns,
        } as ShopeeConfig;
        await saveConfig('shopee', configWithUpdatedCampaigns);
    };

    if (loading) {
        return (
            <AppLayout title="Taxas de Marketplace">
                <div className="space-y-6 animate-pulse">
                    <div className="h-12 w-64 rounded-[20px] glass-panel glass-tint" />
                    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                        <div className="h-[600px] rounded-[32px] glass-panel glass-tint" />
                        <div className="h-[500px] rounded-[32px] glass-panel glass-tint" />
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Taxas de Marketplace">
            <div className="space-y-6 pb-10">
                {/* System Message */}
                {message && (
                    <div className={`px-4 py-3 rounded-2xl text-sm font-medium ${message.type === 'success' ? 'bg-emerald-100 text-emerald-700' :
                        message.type === 'error' ? 'bg-rose-100 text-rose-700' :
                            'bg-amber-100 text-amber-700'
                        }`}>
                        {message.text}
                    </div>
                )}

                {/* Breadcrumb */}
                <Breadcrumb
                    items={[
                        { label: 'Configurações', href: '/configuracoes' },
                        { label: 'Taxas de Marketplace' }
                    ]}
                />

                {/* Header: Title (left) | Tabs (center) | Actions (right) */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Left: Title */}
                    <div className="lg:flex-1">
                        <h1 className="text-2xl font-semibold text-main">Taxas de Marketplace</h1>
                        <p className="text-sm text-muted mt-1">
                            Configure as taxas e simule o impacto nas vendas
                        </p>
                    </div>

                    {/* Center: Tabs */}
                    <div className="lg:flex-1 flex justify-center">
                        <MarketplaceTabs activeTab={activeTab} onTabChange={setActiveTab} />
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="lg:flex-1 flex justify-end items-center gap-3">
                        <button
                            onClick={handleReset}
                            disabled={saving}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Restaurar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>

                {/* Main Grid: 2fr (Config) + 1fr (Sidebar with Impact + Actions) */}
                <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                    {/* Main Column - Config Panels */}
                    <div className="space-y-6">
                        {activeTab === 'shopee' && (
                            <ShopeeConfigPanel
                                config={shopeeConfig}
                                onUpdate={handleShopeeUpdate}
                                onAutoSave={handleShopeeAutoSave}
                            />
                        )}
                        {activeTab === 'mercadoLivre' && (
                            <MercadoLivreConfigPanel
                                config={mercadoLivreConfig}
                                onUpdate={handleMLUpdate}
                            />
                        )}
                        {activeTab === 'magalu' && (
                            <MagaluConfigPanel
                                config={magaluConfig}
                                onUpdate={handleMagaluUpdate}
                            />
                        )}
                    </div>

                    {/* Sidebar - Impact Preview + Save Actions + Simulator */}
                    <div className="lg:sticky lg:top-6 lg:self-start space-y-6">
                        {/* Simulação de Impacto */}
                        <ImpactPreviewCard
                            impact={impact}
                            colorScheme={TAB_COLOR_SCHEMES[activeTab]}
                        />

                        {/* Simulador de Comparação */}
                        <SimulatorPanel
                            shopeeConfig={shopeeConfig}
                            mercadoLivreConfig={mercadoLivreConfig}
                            magaluConfig={magaluConfig}
                            activeMarketplace={currentMarketplace}
                            config={currentConfig}
                        />
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
