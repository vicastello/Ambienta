'use client';

/**
 * Painel de configuração da Shopee - Layout 2 colunas
 * Simulação de Impacto e Ações movidas para sidebar da página principal
 */

import { useState } from 'react';
import { Coins, TrendingUp, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { ShopeeConfig, Campaign } from '../../lib/types';
import { Tooltip } from '@/components/ui/Tooltip';
import { AppDatePicker } from '@/components/ui/AppDatePicker';
import { FeeRateInput, FixedCostInput } from '../Shared';
import { CampaignManager } from '@/components/configuracoes/CampaignManager';

interface ShopeeConfigPanelProps {
    /** Configuração atual da Shopee */
    config: ShopeeConfig;
    /** Callback para atualizar configuração */
    onUpdate: (updates: Partial<ShopeeConfig>) => void;
    /** Erro de data (se houver) */
    dateError?: string | null;
    /** Callback para auto-save após mudanças de campanha - recebe campanhas atualizadas */
    onAutoSave?: (updatedCampaigns: Campaign[]) => void;
}

export function ShopeeConfigPanel({
    config,
    onUpdate,
    dateError,
    onAutoSave,
}: ShopeeConfigPanelProps) {
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        commissions: true,
        campaigns: true,
    });

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const SectionHeader = ({
        id,
        icon: Icon,
        color,
        title
    }: {
        id: string;
        icon: typeof Coins;
        color: string;
        title: string;
    }) => (
        <button
            onClick={() => toggleSection(id)}
            className="flex items-center justify-between w-full mb-4"
            aria-expanded={expandedSections[id]}
        >
            <div className="flex items-center gap-2">
                <Icon className={`w-5 h-5 ${color}`} />
                <h2 className="text-lg font-semibold text-main">{title}</h2>
            </div>
            {expandedSections[id] ? (
                <ChevronUp className="w-4 h-4 text-muted" />
            ) : (
                <ChevronDown className="w-4 h-4 text-muted" />
            )}
        </button>
    );

    return (
        <div className="space-y-6">
            {/* Comissões e Programa + Custos Fixos */}
            <div className="glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10">
                <SectionHeader id="commissions" icon={Coins} color="text-blue-500" title="Comissões e Programa" />

                {expandedSections.commissions && (
                    <div className="space-y-6">
                        {/* Toggle Frete Grátis */}
                        <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className="relative inline-flex items-center">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.participates_in_free_shipping}
                                        onChange={(e) => onUpdate({ participates_in_free_shipping: e.target.checked })}
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                                </div>
                                <span className="text-sm font-semibold text-main">Participa do Programa de Frete Grátis</span>
                            </label>
                            <p className="text-xs text-muted leading-relaxed ml-14 mt-2">
                                Ao ativar, o sistema aplicará automaticamente a taxa de comissão do programa (20%) como padrão para os pedidos Shopee.
                            </p>
                        </div>

                        {/* Taxas de Comissão + Custo Fixo - todos em uma linha */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FeeRateInput
                                value={config.base_commission}
                                onChange={(value) => onUpdate({ base_commission: value })}
                                label="Taxa Base do Marketplace (%)"
                                tooltip="Comissão cobrada pela Shopee quando o pedido NÃO está no programa de frete grátis. Geralmente entre 12-16%."
                                colorScheme="blue"
                                helpText="Comissão padrão sem frete grátis"
                            />

                            <FeeRateInput
                                value={config.free_shipping_commission}
                                onChange={(value) => onUpdate({ free_shipping_commission: value })}
                                label="Taxa com Frete Grátis (%)"
                                tooltip="Comissão aplicada quando você participa do programa de frete grátis da Shopee. Normalmente 20% ou mais."
                                colorScheme="blue"
                                helpText="Comissão quando o programa está ativo"
                            />

                            <FixedCostInput
                                value={config.fixed_cost_per_product}
                                onChange={(value) => onUpdate({ fixed_cost_per_product: value })}
                                label="Custo por Produto (R$)"
                                tooltip="Taxa fixa cobrada por produto vendido."
                                colorScheme="amber"
                                helpText="Cobrado por produto ou kit"
                            />
                        </div>

                    </div>
                )}
            </div>

            {/* Taxas de Campanha */}
            <div className="glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10">
                <SectionHeader id="campaigns" icon={TrendingUp} color="text-emerald-500" title="Taxas de Campanha" />

                {expandedSections.campaigns && (
                    <div className="space-y-6">
                        {/* All 4 fields in one row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <FeeRateInput
                                value={config.campaign_fee_default}
                                onChange={(value) => onUpdate({ campaign_fee_default: value })}
                                label="Taxa Padrão (%)"
                                tooltip="Taxa adicional durante campanhas regulares (9.9, 10.10, etc)"
                                colorScheme="emerald"
                            />

                            <FeeRateInput
                                value={config.campaign_fee_nov_dec}
                                onChange={(value) => onUpdate({ campaign_fee_nov_dec: value })}
                                label="Taxa Nov/Dez (%)"
                                tooltip="Taxa especial durante Black Friday, Natal, Ano Novo"
                                colorScheme="emerald"
                            />

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 min-h-[20px]">
                                    <label className="block text-sm font-medium text-main">Início Nov/Dez</label>
                                </div>
                                <AppDatePicker
                                    value={config.campaign_start_date?.split('T')[0] || ''}
                                    onChange={(value) => onUpdate({ campaign_start_date: value ? `${value}T00:00` : '' })}
                                    placeholder="Selecionar"
                                    className="max-w-[140px] app-input-compact"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 min-h-[20px]">
                                    <label className="block text-sm font-medium text-main">Término Nov/Dez</label>
                                </div>
                                <AppDatePicker
                                    value={config.campaign_end_date?.split('T')[0] || ''}
                                    onChange={(value) => onUpdate({ campaign_end_date: value ? `${value}T23:59` : '' })}
                                    placeholder="Selecionar"
                                    className="max-w-[140px] app-input-compact"
                                />
                            </div>
                        </div>

                        {dateError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                                <p className="text-xs text-red-700 dark:text-red-300 font-medium">{dateError}</p>
                            </div>
                        )}

                        <p className="text-[10px] text-muted italic">
                            * Fora deste período, o sistema utilizará a Taxa de Campanha Padrão.
                        </p>
                    </div>
                )}
            </div>

            {/* Períodos de Campanha Personalizados */}
            <div className="glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10">
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
                    campaigns={config.campaigns || []}
                    onChange={(newCampaigns: Campaign[]) => onUpdate({ campaigns: newCampaigns })}
                    onAutoSave={onAutoSave}
                />

                <p className="text-[10px] text-muted italic mt-4">
                    * Campanhas ativas sobrescrevem a taxa padrão durante seu período de vigência.
                </p>
            </div>
        </div>
    );
}
