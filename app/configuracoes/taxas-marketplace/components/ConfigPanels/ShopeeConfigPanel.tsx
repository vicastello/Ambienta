'use client';

/**
 * Painel de configuração da Shopee - Layout simplificado
 * Apenas configurações base - períodos históricos são configurados via FeePeriodsPanel
 */

import { useState } from 'react';
import { Coins, ChevronDown, ChevronUp } from 'lucide-react';
import { ShopeeConfig } from '../../lib/types';
import { FeeRateInput, FixedCostInput } from '../Shared';

interface ShopeeConfigPanelProps {
    /** Configuração atual da Shopee */
    config: ShopeeConfig;
    /** Callback para atualizar configuração */
    onUpdate: (updates: Partial<ShopeeConfig>) => void;
}

export function ShopeeConfigPanel({
    config,
    onUpdate,
}: ShopeeConfigPanelProps) {
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        commissions: true,
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
            className="flex items-center justify-between w-full mb-4 px-4 py-2 rounded-full bg-white/30 dark:bg-white/10 hover:bg-white/50 dark:hover:bg-white/15 transition-colors border border-white/20 dark:border-white/10"
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
                <SectionHeader id="commissions" icon={Coins} color="text-blue-500" title="Comissões e Custos" />

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

                        {/* Taxas de Comissão + Custo Fixo */}
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
                                colorScheme="yellow"
                                helpText="Cobrado por produto ou kit"
                            />
                        </div>

                        <p className="text-[10px] text-muted italic">
                            * Para taxas de outros períodos (históricos ou campanhas), use o &quot;Histórico de Taxas&quot; abaixo.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
