'use client';

/**
 * Painel de configuração do Mercado Livre - Layout 2 colunas
 * Simulação de Impacto e Ações movidas para sidebar da página principal
 */

import { ShieldCheck, Coins, Package, Info } from 'lucide-react';
import { MercadoLivreConfig, MercadoLivreTier } from '../../lib/types';
import { FeeRateInput } from '../Shared';

interface MercadoLivreConfigPanelProps {
    /** Configuração atual do Mercado Livre */
    config: MercadoLivreConfig;
    /** Callback para atualizar configuração */
    onUpdate: (updates: Partial<MercadoLivreConfig>) => void;
}

export function MercadoLivreConfigPanel({
    config,
    onUpdate,
}: MercadoLivreConfigPanelProps) {
    const handleTierCostChange = (index: number, newCost: number) => {
        const newTiers = [...config.fixed_cost_tiers];
        newTiers[index] = { ...newTiers[index], cost: newCost };
        onUpdate({ fixed_cost_tiers: newTiers });
    };

    const formatTierLabel = (tier: MercadoLivreTier): string => {
        if (tier.min !== undefined && tier.max !== undefined) {
            return `R$ ${tier.min.toFixed(2)} - R$ ${tier.max.toFixed(2)}`;
        }
        if (tier.max !== undefined) {
            return `Até R$ ${tier.max.toFixed(2)}`;
        }
        if (tier.min !== undefined) {
            return `Acima de R$ ${tier.min.toFixed(2)}`;
        }
        return 'Todas as faixas';
    };

    return (
        <div className="space-y-6">
            {/* Comissões + Custos Fixos */}
            <div className="glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10">
                <div className="flex items-center gap-2 mb-6">
                    <ShieldCheck className="w-5 h-5 text-yellow-500" />
                    <h2 className="text-lg font-semibold text-main">Anúncios e Comissões</h2>
                </div>

                <div className="max-w-sm mb-6">
                    <FeeRateInput
                        value={config.premium_commission}
                        onChange={(value) => onUpdate({ premium_commission: value })}
                        label="Taxa Anúncios Premium (%)"
                        tooltip="Comissão para anúncios tipo 'Premium' (mais comum). Varia entre 15-18% dependendo da categoria do produto."
                        colorScheme="yellow"
                        helpText="Aplicado sobre o valor total do produto"
                    />
                </div>

                {/* Custos Fixos por Faixa */}
                <div className="pt-4 border-t border-white/20 dark:border-white/10">
                    <div className="flex items-center gap-2 mb-4">
                        <Coins className="w-5 h-5 text-yellow-600" />
                        <h3 className="text-lg font-semibold text-main">Custos Fixos por Faixa</h3>
                    </div>

                    <div className="space-y-4">
                        {config.fixed_cost_tiers.map((tier, index) => (
                            <div
                                key={index}
                                className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-slate-500/5 rounded-xl border border-slate-500/10"
                            >
                                <div className="flex-1">
                                    <span className="text-sm font-bold text-main block mb-1">
                                        {formatTierLabel(tier)}
                                    </span>
                                    <p className="text-[10px] text-muted">
                                        Pedidos nesta faixa de valor total
                                    </p>
                                </div>
                                <div className="relative md:w-32">
                                    <span className="app-input-addon app-input-addon-left-compact app-input-addon-compact">R$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={tier.cost}
                                        onChange={(e) => handleTierCostChange(index, parseFloat(e.target.value) || 0)}
                                        className="app-input app-input-compact app-input-prefix-compact focus:ring-2 focus:ring-yellow-500"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        ))}

                        {/* Dica especial */}
                        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                                💡 Regra do Mercado Livre: Produtos abaixo de R$ 12,50 pagam apenas 50% do custo fixo da faixa correspondente.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- SEÇÃO DE FRETE --- */}
            <div className="glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10">
                <div className="flex items-center gap-2 mb-6">
                    <Package className="w-5 h-5 text-yellow-600" />
                    <h2 className="text-lg font-semibold text-main">Frete (Mercado Envios)</h2>
                </div>

                <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-2xl mb-6">
                    <div className="flex gap-2">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5" />
                        <div className="space-y-1">
                            <h3 className="text-xs font-bold text-blue-700 dark:text-blue-300">Como funciona o Frete?</h3>
                            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                                O custo do frete é calculado com base no peso e dimensões do produto.
                                Você paga apenas uma porcentagem (Repasse) sobre o valor da tabela cheia do ML.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Taxas de Repasse (Normal vs Pior Caso) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <div className="max-w-[200px]">
                            <FeeRateInput
                                value={(config.freight_seller_rate_normal || 0.40) * 100}
                                onChange={(val) => onUpdate({ freight_seller_rate_normal: val / 100 })}
                                label="Repasse Normal"
                                tooltip="Porcentagem do Frete Base que você paga (ex: 40% = 0.40)"
                                colorScheme="emerald"
                                helpText="Para produtos com boa reputação"
                            />
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <div className="max-w-[200px]">
                            <FeeRateInput
                                value={(config.freight_seller_rate_worst || 0.45) * 100}
                                onChange={(val) => onUpdate({ freight_seller_rate_worst: val / 100 })}
                                label="Repasse (Pior Caso)"
                                tooltip="Cenário pessimista de repasse (ex: 45% = 0.45)"
                                colorScheme="yellow"
                                helpText="Para produtos sem reputação ou novos"
                            />
                        </div>
                    </div>
                </div>

                {/* Editor de Tabela de Frete (Estilo Card List) */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-main">Tabela Base de Frete</h3>
                        <span className="text-[10px] text-muted uppercase font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                            Preços Cheios
                        </span>
                    </div>

                    <div className="space-y-3">
                        {(config.freight_weight_tiers || []).map((tier, idx) => (
                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-500/5 rounded-xl border border-slate-500/10">
                                {/* Faixa de Peso */}
                                <div className="flex-1 flex items-center gap-2">
                                    <div className="relative w-24">
                                        <input
                                            type="number" step="0.1"
                                            value={tier.min}
                                            onChange={(e) => {
                                                const newTiers = [...config.freight_weight_tiers];
                                                newTiers[idx] = { ...tier, min: parseFloat(e.target.value) || 0 };
                                                onUpdate({ freight_weight_tiers: newTiers });
                                            }}
                                            className="app-input app-input-compact text-center"
                                            placeholder="Min"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted font-bold pointer-events-none">kg</span>
                                    </div>
                                    <span className="text-muted text-xs font-medium">até</span>
                                    <div className="relative w-24">
                                        {tier.max === undefined ? (
                                            <div className="w-full h-9 flex items-center justify-center text-xs text-muted font-medium italic bg-slate-200/50 dark:bg-slate-700/50 rounded-lg border border-transparent">
                                                Acima
                                            </div>
                                        ) : (
                                            <>
                                                <input
                                                    type="number" step="0.1"
                                                    value={tier.max}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                                        const newTiers = [...config.freight_weight_tiers];
                                                        newTiers[idx] = { ...tier, max: val };
                                                        onUpdate({ freight_weight_tiers: newTiers });
                                                    }}
                                                    className="app-input app-input-compact text-center"
                                                    placeholder="Max"
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted font-bold pointer-events-none">kg</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Preço Base */}
                                <div className="relative w-full sm:w-32">
                                    <span className="app-input-addon app-input-addon-left-compact app-input-addon-compact">R$</span>
                                    <input
                                        type="number" step="0.01"
                                        value={tier.base}
                                        onChange={(e) => {
                                            const newTiers = [...config.freight_weight_tiers];
                                            newTiers[idx] = { ...tier, base: parseFloat(e.target.value) || 0 };
                                            onUpdate({ freight_weight_tiers: newTiers });
                                        }}
                                        className="app-input app-input-compact app-input-prefix-compact text-right font-bold text-main"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-[10px] text-muted text-center mt-2">
                        * Deixe o peso final vazio para criar uma faixa "E acima"
                    </p>
                </div>
            </div>
        </div>
    );
}
