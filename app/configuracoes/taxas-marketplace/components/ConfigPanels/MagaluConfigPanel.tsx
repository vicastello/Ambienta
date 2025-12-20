'use client';

/**
 * Painel de configuração da Magalu - Layout 2 colunas
 * Simulação de Impacto e Ações movidas para sidebar da página principal
 */

import { Coins } from 'lucide-react';
import { MagaluConfig } from '../../lib/types';
import { FeeRateInput, FixedCostInput } from '../Shared';

interface MagaluConfigPanelProps {
    /** Configuração atual da Magalu */
    config: MagaluConfig;
    /** Callback para atualizar configuração */
    onUpdate: (updates: Partial<MagaluConfig>) => void;
}

export function MagaluConfigPanel({
    config,
    onUpdate,
}: MagaluConfigPanelProps) {
    return (
        <div className="space-y-6">
            {/* Comissões e Taxas */}
            <div className="glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10">
                <div className="flex items-center gap-2 mb-6">
                    <Coins className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-lg font-semibold text-main">Comissões e Taxas</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FeeRateInput
                        value={config.commission}
                        onChange={(value) => onUpdate({ commission: value })}
                        label="Taxa do Marketplace (%)"
                        tooltip="Comissão padrão cobrada pela Magalu. Geralmente entre 12-16% dependendo da categoria."
                        colorScheme="indigo"
                    />

                    <FixedCostInput
                        value={config.fixed_cost}
                        onChange={(value) => onUpdate({ fixed_cost: value })}
                        label="Custo Fixo por Venda (R$)"
                        tooltip="Taxa fixa cobrada uma vez por cada pedido realizado na Magalu, independentemente da quantidade de produtos."
                        colorScheme="indigo"
                    />
                </div>
            </div>
        </div>
    );
}
