'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tooltip } from '@/components/ui/Tooltip';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { MarketplaceFeeComparison } from '@/components/configuracoes/MarketplaceFeeComparison';
import { CampaignManager } from '@/components/configuracoes/CampaignManager';
import { ProfitCalculator } from '@/components/configuracoes/ProfitCalculator';
import { RentabilityChart } from '@/components/configuracoes/RentabilityChart';
import { ImportUploader } from '@/components/configuracoes/ImportUploader';
import { ValidationErrors, ValidationBadge } from '@/components/configuracoes/ValidationErrors';
import { exportConfiguration, getExportFilename, downloadBlob } from '@/lib/export-config';
import { validateAllConfigs, ConfigValidationResult } from '@/lib/validations/marketplace-config';
import { saveBackup, getLastBackup, restoreBackup } from '@/lib/config-backup';
import { Settings, Save, RotateCcw, CheckCircle, AlertCircle, Coins, TrendingUp, Calendar, ShoppingBag, ShieldCheck, Calculator, Download, Upload, FileText, FileSpreadsheet, Undo } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Campaign {
    id: string; // UUID for unique identification
    name: string; // e.g., "Black Friday 2024", "9.9 Sale"
    fee_rate: number; // Campaign fee percentage
    start_date: string; // ISO 8601 datetime
    end_date: string; // ISO 8601 datetime
    is_active: boolean; // Toggle to enable/disable without deleting
}

interface ShopeeConfig {
    base_commission: number;
    free_shipping_commission: number;
    participates_in_free_shipping: boolean;
    campaign_fee_default: number;
    campaign_fee_nov_dec: number;
    campaign_start_date: string;
    campaign_end_date: string;
    campaigns?: Campaign[]; // NEW: Array of campaign periods
    fixed_cost_per_product: number;
}

interface MercadoLivreConfig {
    premium_commission: number;
    fixed_cost_tiers: Array<{
        min?: number;
        max?: number;
        cost: number;
    }>;
}

interface MagaluConfig {
    commission: number;
    fixed_cost: number;
}

type MarketplaceConfig = ShopeeConfig | MercadoLivreConfig | MagaluConfig;

export default function TaxasMarketplacePage() {
    const [activeTab, setActiveTab] = useState<'shopee' | 'mercado_livre' | 'magalu'>('shopee');
    const [configs, setConfigs] = useState<Record<string, MarketplaceConfig>>({});
    const [originalConfigs, setOriginalConfigs] = useState<Record<string, MarketplaceConfig>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [dateError, setDateError] = useState<string | null>(null);
    const [validationWarnings, setValidationWarnings] = useState<Record<string, string[]>>({});
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingSave, setPendingSave] = useState<{ marketplace: string; config: MarketplaceConfig } | null>(null);
    const [showCalculator, setShowCalculator] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [validationResults, setValidationResults] = useState<Record<string, ConfigValidationResult>>({});
    const [canUndo, setCanUndo] = useState(false);

    useEffect(() => {
        loadConfigs();
    }, []);

    // Real-time validation
    useEffect(() => {
        if (Object.keys(configs).length > 0) {
            const results = validateAllConfigs(configs);
            setValidationResults(results);
        }
    }, [configs]);

    // Check if we can undo
    useEffect(() => {
        const lastBackup = getLastBackup();
        setCanUndo(lastBackup !== null);
    }, [configs]);

    // Keyboard shortcuts (ESC to close modals)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showCalculator) setShowCalculator(false);
                if (showImportModal) setShowImportModal(false);
                if (showConfirmModal) setShowConfirmModal(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showCalculator, showImportModal, showConfirmModal]);

    const loadConfigs = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/configuracoes/taxas-marketplace');
            const data = await response.json();

            const configMap: Record<string, MarketplaceConfig> = {};
            data.forEach((item: any) => {
                let config = item.config;
                if (item.marketplace === 'shopee') {
                    // Backfill default values for new fields
                    config = {
                        participates_in_free_shipping: false,
                        campaign_start_date: '2024-10-29T00:00',
                        campaign_end_date: '2024-12-31T23:59',
                        ...config
                    };
                }
                configMap[item.marketplace] = config;
            });

            setConfigs(configMap);
            setOriginalConfigs(configMap); // Store for comparison
        } catch (error) {
            console.error('Error loading configs:', error);
            showMessage('error', 'Erro ao carregar configurações');
        } finally {
            setLoading(false);
        }
    };

    const saveConfig = async (marketplace: string, config: MarketplaceConfig) => {
        try {
            setSaving(true);
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
    };

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    };

    const updateConfig = (marketplace: string, updates: Partial<MarketplaceConfig>) => {
        const newConfig = { ...configs[marketplace], ...updates } as MarketplaceConfig;
        setConfigs(prev => ({
            ...prev,
            [marketplace]: newConfig,
        }));

        // Validate dates for Shopee
        if (marketplace === 'shopee' && ((updates as Partial<ShopeeConfig>).campaign_start_date || (updates as Partial<ShopeeConfig>).campaign_end_date)) {
            const config = newConfig as ShopeeConfig;
            if (config.campaign_start_date && config.campaign_end_date) {
                const start = new Date(config.campaign_start_date);
                const end = new Date(config.campaign_end_date);
                if (start >= end) {
                    setDateError('A data de término deve ser posterior à data de início');
                } else {
                    setDateError(null);
                }
            }
        }

        // Validate suspicious values
        validateField(marketplace, newConfig);
    };

    const validateField = (marketplace: string, config: MarketplaceConfig) => {
        const warnings: string[] = [];

        if ('base_commission' in config) {
            const shopeeConfig = config as ShopeeConfig;
            if (shopeeConfig.base_commission > 30) {
                warnings.push('Taxa base acima de 30% - valor incomum');
            }
            if (shopeeConfig.base_commission < 0) {
                warnings.push('Taxa base não pode ser negativa');
            }
            if (shopeeConfig.free_shipping_commission > 30) {
                warnings.push('Taxa com frete grátis acima de 30% - valor incomum');
            }
            if (shopeeConfig.fixed_cost_per_product > 50) {
                warnings.push('Custo fixo muito alto (> R$ 50)');
            }
            if (shopeeConfig.fixed_cost_per_product < 0) {
                warnings.push('Custo fixo não pode ser negativo');
            }
        }

        if ('premium_commission' in config) {
            const mlConfig = config as MercadoLivreConfig;
            if (mlConfig.premium_commission > 30) {
                warnings.push('Taxa premium acima de 30% - valor incomum');
            }
            if (mlConfig.premium_commission < 0) {
                warnings.push('Taxa premium não pode ser negativa');
            }
        }

        if ('commission' in config && 'fixed_cost' in config) {
            const magaluConfig = config as MagaluConfig;
            if (magaluConfig.commission > 30) {
                warnings.push('Taxa acima de 30% - valor incomum');
            }
            if (magaluConfig.commission < 0) {
                warnings.push('Taxa não pode ser negativa');
            }
            if (magaluConfig.fixed_cost > 50) {
                warnings.push('Custo fixo muito alto (> R$ 50)');
            }
            if (magaluConfig.fixed_cost < 0) {
                warnings.push('Custo fixo não pode ser negativo');
            }
        }

        setValidationWarnings(prev => ({
            ...prev,
            [marketplace]: warnings
        }));
    };

    const handleSaveWithConfirmation = (marketplace: string, config: MarketplaceConfig) => {
        const original = originalConfigs[marketplace];
        if (!original) {
            saveConfig(marketplace, config);
            return;
        }

        // Check if changes are significant (> 5%)
        let hasSignificantChange = false;
        let oldValue = '';
        let newValue = '';

        if ('base_commission' in config && 'base_commission' in original) {
            const shopeeConfig = config as ShopeeConfig;
            const shopeeOriginal = original as ShopeeConfig;
            const diff = Math.abs(shopeeConfig.base_commission - shopeeOriginal.base_commission);
            if (diff > 5) {
                hasSignificantChange = true;
                oldValue = `${shopeeOriginal.base_commission}%`;
                newValue = `${shopeeConfig.base_commission}%`;
            }
        }

        if ('premium_commission' in config && 'premium_commission' in original) {
            const mlConfig = config as MercadoLivreConfig;
            const mlOriginal = original as MercadoLivreConfig;
            const diff = Math.abs(mlConfig.premium_commission - mlOriginal.premium_commission);
            if (diff > 5) {
                hasSignificantChange = true;
                oldValue = `${mlOriginal.premium_commission}%`;
                newValue = `${mlConfig.premium_commission}%`;
            }
        }

        if (hasSignificantChange) {
            setPendingSave({ marketplace, config });
            setShowConfirmModal(true);
        } else {
            saveConfig(marketplace, config);
        }
    };

    const confirmSave = async () => {
        if (!pendingSave) return;

        // Backup before saving
        saveBackup(configs, `Before updating ${pendingSave.marketplace}`);

        await saveConfig(pendingSave.marketplace, pendingSave.config, true);
        setShowConfirmModal(false);
        setPendingSave(null);
    };

    const handleExport = async (format: 'json' | 'csv' | 'pdf') => {
        try {
            const blob = await exportConfiguration(configs, { format, includeMetadata: true });
            const filename = getExportFilename(format);
            downloadBlob(blob, filename);
            setMessage({ type: 'success', text: `Configurações exportadas com sucesso em ${format.toUpperCase()}!` });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            setMessage({ type: 'error', text: 'Erro ao exportar configurações' });
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleImportComplete = (newConfigs: any) => {
        setConfigs(newConfigs);
        setShowImportModal(false);
        setMessage({ type: 'success', text: 'Configurações importadas com sucesso!' });
        setTimeout(() => setMessage(null), 3000);
        loadConfigs(); // Reload from DB
    };

    const handleUndo = () => {
        const backup = restoreBackup(0);
        if (backup) {
            setConfigs(backup);
            setMessage({ type: 'success', text: 'Configurações restauradas!' });
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const restoreDefaults = (marketplace: string) => {
        const defaults: Record<string, MarketplaceConfig> = {
            shopee: {
                base_commission: 14,
                free_shipping_commission: 20,
                participates_in_free_shipping: false,
                campaign_fee_default: 2.5,
                campaign_fee_nov_dec: 3.5,
                campaign_start_date: '2024-11-01T00:00',
                campaign_end_date: '2024-12-31T23:59',
                fixed_cost_per_product: 4,
            } as ShopeeConfig,
            mercado_livre: {
                premium_commission: 16.5,
                fixed_cost_tiers: [
                    { max: 79, cost: 5.00 },
                    { min: 79, max: 140, cost: 9.00 },
                    { min: 140, cost: 13.00 },
                ],
            } as MercadoLivreConfig,
            magalu: {
                commission: 14.5,
                fixed_cost: 4,
            } as MagaluConfig,
        };

        if (confirm(`Restaurar valores padrão para ${marketplace}?`)) {
            setConfigs(prev => ({ ...prev, [marketplace]: defaults[marketplace] }));
            showMessage('success', 'Valores padrão restaurados! Lembre-se de salvar.');
        }
    };

    const calculateImpactPreview = (marketplace: string): { net: number; fees: number } => {
        const testValue = 100;

        if (marketplace === 'shopee' && configs.shopee) {
            const config = configs.shopee as ShopeeConfig;
            const commissionRate = config.participates_in_free_shipping
                ? config.free_shipping_commission
                : config.base_commission;
            const commission = (testValue * commissionRate) / 100;
            const fixedCost = config.fixed_cost_per_product;
            const totalFees = commission + fixedCost;
            return { net: testValue - totalFees, fees: totalFees };
        }

        if (marketplace === 'mercado_livre' && configs.mercado_livre) {
            const config = configs.mercado_livre as MercadoLivreConfig;
            const commission = (testValue * config.premium_commission) / 100;
            let fixedCost = 0;
            for (const tier of config.fixed_cost_tiers) {
                const minOk = !tier.min || testValue >= tier.min;
                const maxOk = !tier.max || testValue < tier.max;
                if (minOk && maxOk) {
                    fixedCost = tier.cost;
                    break;
                }
            }
            const totalFees = commission + fixedCost;
            return { net: testValue - totalFees, fees: totalFees };
        }

        if (marketplace === 'magalu' && configs.magalu) {
            const config = configs.magalu as MagaluConfig;
            const commission = (testValue * config.commission) / 100;
            const totalFees = commission + config.fixed_cost;
            return { net: testValue - totalFees, fees: totalFees };
        }

        return { net: 0, fees: 0 };
    };

    // Memoized configs (must be before any early returns)
    const shopeeConfig = useMemo(
        () => configs.shopee as ShopeeConfig | undefined,
        [configs.shopee]
    );
    const mercadoLivreConfig = useMemo(
        () => configs.mercado_livre as MercadoLivreConfig | undefined,
        [configs.mercado_livre]
    );
    const magaluConfig = useMemo(
        () => configs.magalu as MagaluConfig | undefined,
        [configs.magalu]
    );

    // Memoized validation check
    const hasValidationErrors = useMemo(() => {
        return Object.values(validationResults).some(r => !r.valid);
    }, [validationResults]);

    if (loading) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-screen">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
                        <p className="text-muted">Carregando configurações...</p>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="space-y-6 pb-6">
                <Breadcrumb
                    items={[
                        { label: 'Configurações', href: '/configuracoes' },
                        { label: 'Taxas de Marketplace' },
                    ]}
                />

                <section>
                    <div className="flex items-center gap-3 mb-2">
                        <Settings className="w-6 h-6 text-accent" />
                        <h1 className="text-2xl font-bold text-main">Configurações de Taxas - Marketplaces</h1>
                    </div>
                    <p className="text-sm text-muted mt-1">
                        Configure as taxas e custos de cada marketplace para cálculo automático do valor líquido esperado
                    </p>

                    {/* Export/Import Buttons */}
                    <div className="flex gap-2 mt-4" role="toolbar" aria-label="Ferramentas de exportação e importação">
                        <button
                            onClick={() => handleExport('json')}
                            className="px-3 py-2 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all inline-flex items-center gap-2 focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                            title="Exportar como JSON"
                            aria-label="Exportar configurações como arquivo JSON"
                        >
                            <Download className="w-3 h-3" aria-hidden="true" />
                            JSON
                        </button>
                        <button
                            onClick={() => handleExport('csv')}
                            className="px-3 py-2 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all inline-flex items-center gap-2 focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
                            title="Exportar como CSV"
                            aria-label="Exportar configurações como arquivo CSV"
                        >
                            <FileSpreadsheet className="w-3 h-3" aria-hidden="true" />
                            CSV
                        </button>
                        <button
                            onClick={() => handleExport('pdf')}
                            className="px-3 py-2 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all inline-flex items-center gap-2 focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                            title="Exportar como PDF"
                            aria-label="Exportar configurações como documento PDF"
                        >
                            <FileText className="w-3 h-3" aria-hidden="true" />
                            PDF
                        </button>
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="px-3 py-2 text-xs rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-all inline-flex items-center gap-2 focus:ring-2 focus:ring-purple-400 focus:ring-offset-2"
                            title="Importar configurações"
                            aria-label="Importar configurações de arquivo"
                        >
                            <Upload className="w-3 h-3" aria-hidden="true" />
                            Importar
                        </button>
                        {canUndo && (
                            <button
                                onClick={handleUndo}
                                className="px-3 py-2 text-xs rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-all inline-flex items-center gap-2 focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
                                title="Desfazer última alteração"
                                aria-label="Desfazer última alteração nas configurações"
                            >
                                <Undo className="w-3 h-3" aria-hidden="true" />
                                Desfazer
                            </button>
                        )}
                    </div>
                </section>

                {/* Validation Errors */}
                <ValidationErrors validationResults={validationResults} className="mb-6" />

                {/* Message */}
                {message && (
                    <div
                        className={cn(
                            'glass-card p-4 rounded-xl flex items-center gap-3',
                            message.type === 'success' ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'
                        )}
                    >
                        {message.type === 'success' ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                        <p className={message.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {message.text}
                        </p>
                    </div>
                )}

                {/* Validation Warnings */}
                {validationWarnings[activeTab] && validationWarnings[activeTab].length > 0 && (
                    <div className="glass-card p-4 rounded-xl border-l-4 border-yellow-500">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300 mb-2">
                                    Atenção: Valores Suspeitos Detectados
                                </p>
                                <ul className="text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                                    {validationWarnings[activeTab].map((warning, idx) => (
                                        <li key={idx}>• {warning}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirmation Modal */}
                <ConfirmationModal
                    isOpen={showConfirmModal}
                    onClose={() => {
                        setShowConfirmModal(false);
                        setPendingSave(null);
                    }}
                    onConfirm={confirmSave}
                    title="Confirmar Alteração Significativa"
                    message="Você está prestes a fazer uma alteração maior que 5% na taxa. Esta mudança pode afetar vários pedidos futuros."
                    type="warning"
                    confirmText="Confirmar e Salvar"
                    impact={pendingSave ? {
                        oldValue: originalConfigs[pendingSave.marketplace] ?
                            ('base_commission' in originalConfigs[pendingSave.marketplace] ?
                                `${(originalConfigs[pendingSave.marketplace] as ShopeeConfig).base_commission}%` :
                                `${(originalConfigs[pendingSave.marketplace] as MercadoLivreConfig).premium_commission}%`) : '',
                        newValue: pendingSave.config ?
                            ('base_commission' in pendingSave.config ?
                                `${(pendingSave.config as ShopeeConfig).base_commission}%` :
                                `${(pendingSave.config as MercadoLivreConfig).premium_commission}%`) : '',
                    } : undefined}
                />

                {/* Tabs */}
                <div className="flex gap-3">
                    <button
                        onClick={() => setActiveTab('shopee')}
                        className={activeTab === 'shopee' ? 'app-btn-primary' : 'app-btn-secondary'}
                    >
                        Shopee
                    </button>
                    <button
                        onClick={() => setActiveTab('mercado_livre')}
                        className={activeTab === 'mercado_livre' ? 'app-btn-primary' : 'app-btn-secondary'}
                    >
                        Mercado Livre
                    </button>
                    <button
                        onClick={() => setActiveTab('magalu')}
                        className={activeTab === 'magalu' ? 'app-btn-primary' : 'app-btn-secondary'}
                    >
                        Magalu
                    </button>
                </div>

                {/* Marketplace Comparison Chart */}
                {shopeeConfig && mercadoLivreConfig && magaluConfig && (
                    <MarketplaceFeeComparison
                        shopeeRate={shopeeConfig.participates_in_free_shipping ? shopeeConfig.free_shipping_commission : shopeeConfig.base_commission}
                        mercadoLivreRate={mercadoLivreConfig.premium_commission}
                        magaluRate={magaluConfig.commission}
                    />
                )}

                {/* Shopee Config */}
                {activeTab === 'shopee' && shopeeConfig && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Commission & Program Status */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10">
                                    <div className="flex items-center gap-2 mb-6">
                                        <Coins className="w-5 h-5 text-blue-500" />
                                        <h2 className="text-lg font-semibold text-main">Comissões e Programa</h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4 md:col-span-2 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <div className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={shopeeConfig.participates_in_free_shipping}
                                                        onChange={(e) => updateConfig('shopee', { participates_in_free_shipping: e.target.checked })}
                                                    />
                                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                                </div>
                                                <span className="text-sm font-semibold text-main">Participa do Programa de Frete Grátis</span>
                                            </label>
                                            <p className="text-xs text-muted leading-relaxed ml-14">
                                                Ao ativar, o sistema aplicará automaticamente a taxa de comissão do programa (20%) como padrão para os pedidos Shopee.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <label className="block text-sm font-medium text-main">
                                                    Taxa Base do Marketplace (%)
                                                </label>
                                                <Tooltip content="Comissão cobrada pela Shopee quando o pedido NÃO está no programa de frete grátis. Geralmente entre 12-16%.">
                                                    <span className="text-muted text-xs cursor-help">ⓘ</span>
                                                </Tooltip>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={shopeeConfig.base_commission}
                                                    onChange={(e) => updateConfig('shopee', { base_commission: parseFloat(e.target.value) })}
                                                    className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">%</span>
                                            </div>
                                            <p className="text-[10px] text-muted">Comissão padrão sem frete grátis</p>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <label className="block text-sm font-medium text-main">
                                                    Taxa com Frete Grátis (%)
                                                </label>
                                                <Tooltip content="Comissão aplicada quando você participa do programa de frete grátis da Shopee. Normalmente 20% ou mais.">
                                                    <span className="text-muted text-xs cursor-help">ⓘ</span>
                                                </Tooltip>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={shopeeConfig.free_shipping_commission}
                                                    onChange={(e) => updateConfig('shopee', { free_shipping_commission: parseFloat(e.target.value) })}
                                                    className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">%</span>
                                            </div>
                                            <p className="text-[10px] text-muted">Comissão quando o programa está ativo</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Campaign Configuration */}
                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10">
                                    <div className="flex items-center gap-2 mb-6">
                                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                                        <h2 className="text-lg font-semibold text-main">Taxas de Campanha</h2>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <label className="block text-sm font-medium text-main">
                                                        Taxa de Campanha Padrão (%)
                                                    </label>
                                                    <Tooltip content="Taxa adicional cobrada pela Shopee durante campanhas regulares (ex: 9.9, 10.10, etc). Aplicada fora do período Nov/Dez.">
                                                        <span className="text-muted text-xs cursor-help">ⓘ</span>
                                                    </Tooltip>
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={shopeeConfig.campaign_fee_default}
                                                        onChange={(e) => updateConfig('shopee', { campaign_fee_default: parseFloat(e.target.value) })}
                                                        className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">%</span>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <label className="block text-sm font-medium text-main">
                                                        Taxa de Campanha Nov/Dez (%)
                                                    </label>
                                                    <Tooltip content="Taxa especial aplicada durante o período de alta temporada (Black Friday, Natal, Ano Novo). Configure as datas exatas abaixo.">
                                                        <span className="text-muted text-xs cursor-help">ⓘ</span>
                                                    </Tooltip>
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={shopeeConfig.campaign_fee_nov_dec}
                                                        onChange={(e) => updateConfig('shopee', { campaign_fee_nov_dec: parseFloat(e.target.value) })}
                                                        className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">%</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10 space-y-4">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                                <Calendar className="w-4 h-4" />
                                                Vigência da Taxa Nov/Dez
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] uppercase font-bold text-muted px-1">Início</span>
                                                    <input
                                                        type="datetime-local"
                                                        value={shopeeConfig.campaign_start_date}
                                                        onChange={(e) => updateConfig('shopee', { campaign_start_date: e.target.value })}
                                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] uppercase font-bold text-muted px-1">Término</span>
                                                    <input
                                                        type="datetime-local"
                                                        value={shopeeConfig.campaign_end_date}
                                                        onChange={(e) => updateConfig('shopee', { campaign_end_date: e.target.value })}
                                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                                    />
                                                </div>
                                            </div>
                                            {dateError && (
                                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2 mt-3">
                                                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                                    <p className="text-xs text-red-700 dark:text-red-300 font-medium">{dateError}</p>
                                                </div>
                                            )}
                                            <p className="text-[10px] text-muted italic">
                                                * Fora deste período, o sistema utilizará a Taxa de Campanha Padrão.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Campaign Periods Manager */}
                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-5 h-5 text-purple-500" />
                                            <h2 className="text-lg font-semibold text-main">Períodos de Campanha</h2>
                                        </div>
                                        <Tooltip content="Configure múltiplos períodos de campanha com datas e taxas personalizadas. Campanhas ativas sobrescrevem a taxa padrão.">
                                            <span className="text-muted text-xs cursor-help">ⓘ</span>
                                        </Tooltip>
                                    </div>

                                    <CampaignManager
                                        campaigns={shopeeConfig.campaigns || []}
                                        onChange={(newCampaigns) => updateConfig('shopee', { campaigns: newCampaigns })}
                                    />

                                    <p className="text-[10px] text-muted italic mt-4">
                                        * Campanhas ativas sobrescrevem a taxa padrão durante seu período de vigência.
                                    </p>
                                </div>
                            </div>

                            {/* Sidebar Configs */}
                            <div className="space-y-6">
                                {/* Impact Preview */}
                                <div className="glass-card rounded-2xl p-5 border border-white/20 dark:border-white/10 bg-gradient-to-br from-blue-500/5 to-indigo-500/5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Calculator className="w-4 h-4 text-blue-500" />
                                        <h3 className="text-sm font-bold text-main">Simulação de Impacto</h3>
                                    </div>
                                    {(() => {
                                        const preview = calculateImpactPreview('shopee');
                                        return (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-muted">Venda de:</span>
                                                    <span className="font-bold text-main">R$ 100,00</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-muted">Taxas totais:</span>
                                                    <span className="font-semibold text-red-600 dark:text-red-400">-R$ {preview.fees.toFixed(2)}</span>
                                                </div>
                                                <div className="border-t border-white/10 my-2"></div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-medium text-muted">Você recebe:</span>
                                                    <span className="text-base font-bold text-green-600 dark:text-green-400">R$ {preview.net.toFixed(2)}</span>
                                                </div>
                                                <p className="text-[9px] text-muted italic mt-2">* Valores aproximados, baseados nas taxas atuais</p>
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10 h-full">
                                    <div className="flex items-center gap-2 mb-6">
                                        <ShoppingBag className="w-5 h-5 text-amber-500" />
                                        <h2 className="text-lg font-semibold text-main">Custos Fixos</h2>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <label className="block text-sm font-medium text-main">
                                                    Custo por Produto (R$)
                                                </label>
                                                <Tooltip content="Taxa fixa cobrada por produto vendido. Se vender um kit com vários itens, a taxa é cobrada apenas uma vez por pedido.">
                                                    <span className="text-muted text-xs cursor-help">ⓘ</span>
                                                </Tooltip>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={shopeeConfig.fixed_cost_per_product}
                                                    onChange={(e) => updateConfig('shopee', { fixed_cost_per_product: parseFloat(e.target.value) })}
                                                    className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-medium"
                                                />
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">R$</span>
                                            </div>
                                            <p className="text-[10px] text-muted leading-relaxed">
                                                Cobrado por produto individual ou uma vez por kit (conforme configurado no anúncio).
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-12 flex flex-col gap-3">
                                        <button
                                            onClick={() => handleSaveWithConfirmation('shopee', shopeeConfig)}
                                            disabled={saving || !!dateError}
                                            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Save className="w-4 h-4" />
                                            {saving ? 'Gravando...' : 'Salvar Alterações'}
                                        </button>
                                        <button
                                            onClick={() => restoreDefaults('shopee')}
                                            className="w-full py-3 px-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all inline-flex items-center justify-center gap-2"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            Restaurar Padrão
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mercado Livre Config */}
                {activeTab === 'mercado_livre' && mercadoLivreConfig && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10">
                                    <div className="flex items-center gap-2 mb-6">
                                        <ShieldCheck className="w-5 h-5 text-yellow-500" />
                                        <h2 className="text-lg font-semibold text-main">Anúncios e Comissões</h2>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2 max-w-sm">
                                            <div className="flex items-center gap-2">
                                                <label className="block text-sm font-medium text-main">
                                                    Taxa Anúncios Premium (%)
                                                </label>
                                                <Tooltip content="Comissão para anúncios tipo 'Premium' (mais comum). Varia entre 15-18% dependendo da categoria do produto.">
                                                    <span className="text-muted text-xs cursor-help">ⓘ</span>
                                                </Tooltip>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={mercadoLivreConfig.premium_commission}
                                                    onChange={(e) => updateConfig('mercado_livre', { premium_commission: parseFloat(e.target.value) })}
                                                    className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">%</span>
                                            </div>
                                            <p className="text-[10px] text-muted italic">* Aplicado sobre o valor total do produto</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10">
                                    <div className="flex items-center gap-2 mb-6">
                                        <Coins className="w-5 h-5 text-yellow-600" />
                                        <h2 className="text-lg font-semibold text-main">Custos Fixos por Faixa</h2>
                                    </div>

                                    <div className="space-y-4">
                                        {mercadoLivreConfig.fixed_cost_tiers.map((tier, index) => (
                                            <div key={index} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-slate-500/5 rounded-xl border border-slate-500/10">
                                                <div className="flex-1">
                                                    <span className="text-sm font-bold text-main block mb-1">
                                                        {tier.min !== undefined && tier.max !== undefined
                                                            ? `R$ ${tier.min.toFixed(2)} - R$ ${tier.max.toFixed(2)}`
                                                            : tier.max !== undefined
                                                                ? `Até R$ ${tier.max.toFixed(2)}`
                                                                : tier.min !== undefined
                                                                    ? `Acima de R$ ${tier.min.toFixed(2)}`
                                                                    : 'Todas as faixas'}
                                                    </span>
                                                    <p className="text-[10px] text-muted">Pedidos nesta faixa de valor total</p>
                                                </div>
                                                <div className="relative md:w-48">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={tier.cost}
                                                        onChange={(e) => {
                                                            const newTiers = [...mercadoLivreConfig.fixed_cost_tiers];
                                                            newTiers[index].cost = parseFloat(e.target.value);
                                                            updateConfig('mercado_livre', { fixed_cost_tiers: newTiers });
                                                        }}
                                                        className="w-full pl-8 pr-4 py-2 rounded-lg bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-medium text-sm"
                                                        placeholder="0.00"
                                                    />
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted">R$</span>
                                                </div>
                                            </div>
                                        ))}

                                        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                            <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                                                💡 Regra do Mercado Livre: Produtos abaixo de R$ 12,50 pagam apenas 50% do custo fixo da faixa correspondente.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Impact Preview for Mercado Livre */}
                                <div className="glass-card rounded-2xl p-5 border border-white/20 dark:border-white/10 bg-gradient-to-br from-yellow-500/5 to-amber-500/5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Calculator className="w-4 h-4 text-yellow-500" />
                                        <h3 className="text-sm font-bold text-main">Simulação de Impacto</h3>
                                    </div>
                                    {(() => {
                                        const preview = calculateImpactPreview('mercado_livre');
                                        return (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-muted">Venda de:</span>
                                                    <span className="font-bold text-main">R$ 100,00</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-muted">Taxas totais:</span>
                                                    <span className="font-semibold text-red-600 dark:text-red-400">-R$ {preview.fees.toFixed(2)}</span>
                                                </div>
                                                <div className="border-t border-white/10 my-2"></div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-medium text-muted">Você recebe:</span>
                                                    <span className="text-base font-bold text-green-600 dark:text-green-400">R$ {preview.net.toFixed(2)}</span>
                                                </div>
                                                <p className="text-[9px] text-muted italic mt-2">* Valores aproximados, baseados nas taxas atuais</p>
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10 h-full flex flex-col">
                                    <div className="flex-1">
                                        <h3 className="text-sm font-bold text-main mb-4">Ações</h3>
                                        <p className="text-xs text-muted mb-6 leading-relaxed">
                                            As alterações salvas afetarão o cálculo do valor líquido esperado tanto na prévia de importação quanto no fluxo de caixa.
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={() => handleSaveWithConfirmation('mercado_livre', mercadoLivreConfig)}
                                            disabled={saving}
                                            className="w-full py-3 px-4 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-yellow-500/10 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <Save className="w-4 h-4" />
                                            {saving ? 'Gravando...' : 'Salvar Alterações'}
                                        </button>
                                        <button
                                            onClick={loadConfigs}
                                            className="w-full py-3 px-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all inline-flex items-center justify-center gap-2"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            Resetar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Magalu Config */}
                {activeTab === 'magalu' && magaluConfig && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10">
                                    <div className="flex items-center gap-2 mb-6">
                                        <Coins className="w-5 h-5 text-indigo-500" />
                                        <h2 className="text-lg font-semibold text-main">Comissões e Taxas</h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <label className="block text-sm font-medium text-main">
                                                    Taxa do Marketplace (%)
                                                </label>
                                                <Tooltip content="Comissão padrão cobrada pela Magalu. Geralmente entre 12-16% dependendo da categoria.">
                                                    <span className="text-muted text-xs cursor-help">ⓘ</span>
                                                </Tooltip>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={magaluConfig.commission}
                                                    onChange={(e) => updateConfig('magalu', { commission: parseFloat(e.target.value) })}
                                                    className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">%</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <label className="block text-sm font-medium text-main">
                                                    Custo Fixo por Venda (R$)
                                                </label>
                                                <Tooltip content="Taxa fixa cobrada uma vez por cada pedido realizado na Magalu, independentemente da quantidade de produtos.">
                                                    <span className="text-muted text-xs cursor-help">ⓘ</span>
                                                </Tooltip>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={magaluConfig.fixed_cost}
                                                    onChange={(e) => updateConfig('magalu', { fixed_cost: parseFloat(e.target.value) })}
                                                    className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-main focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                                                />
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-xs font-bold">R$</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Impact Preview for Magalu */}
                                <div className="glass-card rounded-2xl p-5 border border-white/20 dark:border-white/10 bg-gradient-to-br from-indigo-500/5 to-purple-500/5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Calculator className="w-4 h-4 text-indigo-500" />
                                        <h3 className="text-sm font-bold text-main">Simulação de Impacto</h3>
                                    </div>
                                    {(() => {
                                        const preview = calculateImpactPreview('magalu');
                                        return (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-muted">Venda de:</span>
                                                    <span className="font-bold text-main">R$ 100,00</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-muted">Taxas totais:</span>
                                                    <span className="font-semibold text-red-600 dark:text-red-400">-R$ {preview.fees.toFixed(2)}</span>
                                                </div>
                                                <div className="border-t border-white/10 my-2"></div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-medium text-muted">Você recebe:</span>
                                                    <span className="text-base font-bold text-green-600 dark:text-green-400">R$ {preview.net.toFixed(2)}</span>
                                                </div>
                                                <p className="text-[9px] text-muted italic mt-2">* Valores aproximados, baseados nas taxas atuais</p>
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className="glass-card rounded-2xl p-6 border border-white/20 dark:border-white/10 h-full flex flex-col">
                                    <div className="flex-1">
                                        <h3 className="text-sm font-bold text-main mb-4">Ações</h3>
                                        <p className="text-xs text-muted mb-6 leading-relaxed">
                                            As configurações da Magalu são aplicadas uniformemente em todos os pedidos do canal.
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={() => handleSaveWithConfirmation('magalu', magaluConfig)}
                                            disabled={saving}
                                            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/10 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <Save className="w-4 h-4" />
                                            {saving ? 'Gravando...' : 'Salvar Alterações'}
                                        </button>
                                        <button
                                            onClick={loadConfigs}
                                            className="w-full py-3 px-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all inline-flex items-center justify-center gap-2"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            Resetar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Profit Calculator Modal */}
            {showCalculator && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="calculator-title"
                >
                    <div className="bg-background rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 space-y-6">
                            <ProfitCalculator onClose={() => setShowCalculator(false)} />
                            <RentabilityChart
                                cost={50}
                                minPrice={50}
                                maxPrice={500}
                                step={10}
                                freeShippingShopee={shopeeConfig?.participates_in_free_shipping || false}
                                campaignShopee={false}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="import-title"
                >
                    <div className="bg-background rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <ImportUploader
                                onImportComplete={handleImportComplete}
                                onClose={() => setShowImportModal(false)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Calculator Button */}
            <button
                onClick={() => setShowCalculator(true)}
                className="fixed bottom-8 right-8 z-40 p-4 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-110 focus:ring-4 focus:ring-purple-400 focus:ring-offset-2"
                title="Calcular Lucro"
                aria-label="Abrir calculadora de lucro"
            >
                <Calculator className="w-6 h-6" aria-hidden="true" />
            </button>
        </AppLayout>
    );
}
