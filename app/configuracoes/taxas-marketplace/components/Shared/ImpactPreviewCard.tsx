'use client';

/**
 * Card de preview de impacto de taxas
 * Mostra simulação do valor líquido após taxas
 */

import { Calculator } from 'lucide-react';
import { ImpactPreview } from '../../lib/types';
import { formatCurrency } from '../../lib/calculations';

interface ImpactPreviewCardProps {
    /** Dados de impacto calculados */
    impact: ImpactPreview;
    /** Valor da venda simulada */
    saleValue?: number;
    /** Esquema de cores do marketplace */
    colorScheme?: 'blue' | 'yellow' | 'indigo';
    /** Se deve ser sticky no scroll */
    sticky?: boolean;
    /** Classes CSS adicionais */
    className?: string;
}

const gradientClasses = {
    blue: 'from-blue-500/5 to-indigo-500/5',
    yellow: 'from-yellow-500/5 to-amber-500/5',
    indigo: 'from-indigo-500/5 to-purple-500/5',
};

const iconColorClasses = {
    blue: 'text-blue-500',
    yellow: 'text-yellow-500',
    indigo: 'text-indigo-500',
};

export function ImpactPreviewCard({
    impact,
    saleValue = 100,
    colorScheme = 'blue',
    sticky = false,
    className = '',
}: ImpactPreviewCardProps) {
    return (
        <div
            className={`
                glass-panel glass-tint rounded-[32px] p-5 
                border border-white/30 dark:border-white/10 
                bg-gradient-to-br ${gradientClasses[colorScheme]}
                ${sticky ? 'sticky top-4' : ''}
                ${className}
            `}
        >
            <div className="flex items-center gap-2 mb-4">
                <Calculator className={`w-4 h-4 ${iconColorClasses[colorScheme]}`} />
                <h3 className="text-sm font-bold text-main">Simulação de Impacto</h3>
            </div>

            <div className="space-y-2">
                {/* Valor da venda */}
                <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Venda de:</span>
                    <span className="font-bold text-main">{formatCurrency(saleValue)}</span>
                </div>

                {/* Breakdown das taxas (se disponível) */}
                {impact.breakdown && (
                    <>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-muted pl-2">• Comissão:</span>
                            <span className="text-red-600/80 dark:text-red-400/80">
                                -{formatCurrency(impact.breakdown.commission)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-muted pl-2">• Custo fixo:</span>
                            <span className="text-red-600/80 dark:text-red-400/80">
                                -{formatCurrency(impact.breakdown.fixedCost)}
                            </span>
                        </div>
                        {(impact.breakdown.campaignFee || 0) > 0 && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted pl-2">• Taxa campanha:</span>
                                <span className="text-red-600/80 dark:text-red-400/80">
                                    -{formatCurrency(impact.breakdown.campaignFee!)}
                                </span>
                            </div>
                        )}
                        {(impact.breakdown.freightCost || 0) > 0 && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted pl-2">• Frete (Minha parte):</span>
                                <span className="text-red-600/80 dark:text-red-400/80">
                                    -{formatCurrency(impact.breakdown.freightCost!)}
                                </span>
                            </div>
                        )}
                    </>
                )}

                {/* Total de taxas */}
                <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Taxas totais:</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                        -{formatCurrency(impact.fees)}
                    </span>
                </div>

                {/* Divisor */}
                <div className="border-t border-white/10 my-2" />

                {/* Valor líquido */}
                <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-muted">Você recebe:</span>
                    <span className="text-base font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(impact.net)}
                    </span>
                </div>

                {/* Nota de rodapé */}
                <p className="text-[9px] text-muted italic mt-2">
                    * Valores aproximados, baseados nas taxas atuais
                </p>
            </div>
        </div>
    );
}
