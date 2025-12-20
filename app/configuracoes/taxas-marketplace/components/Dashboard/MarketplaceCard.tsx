'use client';

/**
 * Card interativo para seleção de marketplace
 * Mostra preview de impacto e status de validação
 */

import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { Marketplace, ImpactPreview, ConfigValidationResult } from '../../lib/types';
import { MARKETPLACE_INFO } from '../../lib/defaults';
import { formatCurrency } from '../../lib/calculations';

interface MarketplaceCardProps {
    /** Identificador do marketplace */
    marketplace: Marketplace;
    /** Se está selecionado/ativo */
    isActive: boolean;
    /** Dados de impacto calculados */
    impact: ImpactPreview;
    /** Resultado de validação */
    validation?: ConfigValidationResult | null;
    /** Callback ao clicar */
    onClick: () => void;
    /** Classes CSS adicionais */
    className?: string;
}

type ValidationStatus = 'ok' | 'warning' | 'error';

function getValidationStatus(validation?: ConfigValidationResult | null): ValidationStatus {
    if (!validation) return 'ok';
    if (!validation.valid) return 'error';
    if (validation.warnings && validation.warnings.length > 0) return 'warning';
    return 'ok';
}

const statusIcons = {
    ok: CheckCircle,
    warning: AlertTriangle,
    error: AlertCircle,
};

const statusColors = {
    ok: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-red-500',
};

const borderColors: Record<Marketplace, string> = {
    shopee: 'border-orange-500',
    mercado_livre: 'border-yellow-500',
    magalu: 'border-blue-500',
};

const bgColors: Record<Marketplace, string> = {
    shopee: 'bg-orange-500/10',
    mercado_livre: 'bg-yellow-500/10',
    magalu: 'bg-blue-500/10',
};

export function MarketplaceCard({
    marketplace,
    isActive,
    impact,
    validation,
    onClick,
    className = '',
}: MarketplaceCardProps) {
    const info = MARKETPLACE_INFO[marketplace];
    const status = getValidationStatus(validation);
    const StatusIcon = statusIcons[status];

    return (
        <button
            onClick={onClick}
            className={`
                relative p-4 rounded-2xl 
                border-2 transition-all duration-200
                text-left w-full
                focus:outline-none focus:ring-2 focus:ring-offset-2
                ${isActive
                    ? `${borderColors[marketplace]} ${bgColors[marketplace]} shadow-lg glass-panel`
                    : 'border-white/20 dark:border-white/10 hover:border-white/40 dark:hover:border-white/20 bg-white/50 dark:bg-white/5 glass-panel glass-tint'
                }
                ${className}
            `}
            aria-pressed={isActive}
            aria-label={`Selecionar ${info.displayName}`}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {/* Indicador de cor do marketplace */}
                    <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: info.color }}
                    />
                    <span className="font-bold text-main text-sm">
                        {info.displayName}
                    </span>
                </div>

                {/* Status de validação */}
                <StatusIcon
                    className={`w-4 h-4 ${statusColors[status]}`}
                    aria-label={status === 'ok' ? 'Válido' : status === 'warning' ? 'Atenção' : 'Erro'}
                />
            </div>

            {/* Valor líquido */}
            <div className="space-y-1">
                <p className="text-[10px] text-muted uppercase tracking-wide">
                    Para venda de R$ 100
                </p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(impact.net)}
                </p>
                <p className="text-[10px] text-red-500/80">
                    -{formatCurrency(impact.fees)} em taxas
                </p>
            </div>

            {/* Indicador de selecionado */}
            {isActive && (
                <div className="absolute top-2 right-2">
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-white/80 dark:bg-slate-900/80 text-main">
                        Selecionado
                    </span>
                </div>
            )}
        </button>
    );
}
