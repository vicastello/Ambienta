'use client';

/**
 * Calculadora flutuante sticky
 * Widget sempre visível para cálculo rápido de lucro
 */

import { useState, useMemo } from 'react';
import { Calculator, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Marketplace, MarketplaceConfig } from '../../lib/types';
import { calculateImpact, formatCurrency } from '../../lib/calculations';
import { MARKETPLACE_INFO, MARKETPLACE_ORDER } from '../../lib/defaults';

interface FloatingCalculatorProps {
    configs: Record<string, MarketplaceConfig>;
    defaultMarketplace?: Marketplace;
    className?: string;
}

export function FloatingCalculator({
    configs,
    defaultMarketplace = 'shopee',
    className = '',
}: FloatingCalculatorProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [salePrice, setSalePrice] = useState(100);
    const [costPrice, setCostPrice] = useState(50);
    const [selectedMarketplace, setSelectedMarketplace] = useState<Marketplace>(defaultMarketplace);

    const config = configs[selectedMarketplace];
    const info = MARKETPLACE_INFO[selectedMarketplace];

    const result = useMemo(() => {
        if (!config) return null;

        const impact = calculateImpact(selectedMarketplace, config, salePrice);
        const profit = impact.net - costPrice;
        const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
        const roi = costPrice > 0 ? (profit / costPrice) * 100 : 0;

        return {
            net: impact.net,
            fees: impact.fees,
            profit,
            margin,
            roi,
            isProfitable: profit > 0,
        };
    }, [config, selectedMarketplace, salePrice, costPrice]);

    if (!isExpanded) {
        // Minimized state
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className={`
                    fixed bottom-6 right-6 z-40
                    p-4 rounded-full
                    bg-gradient-to-br from-purple-600 to-blue-600
                    text-white shadow-xl
                    hover:shadow-2xl hover:scale-110
                    transition-all duration-300
                    focus:ring-4 focus:ring-purple-400 focus:ring-offset-2 focus:outline-none
                    ${className}
                `}
                aria-label="Abrir calculadora"
            >
                <Calculator className="w-6 h-6" />
            </button>
        );
    }

    return (
        <div className={`
            fixed bottom-6 right-6 z-40
            w-80 max-w-[calc(100vw-3rem)]
            glass-panel rounded-[24px] p-5
            border border-white/30 dark:border-white/10
            shadow-2xl
            animate-in slide-in-from-bottom-4 fade-in duration-300
            ${className}
        `}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                        <Calculator className="w-4 h-4 text-purple-500" />
                    </div>
                    <h3 className="text-sm font-bold text-main">Calcular Lucro</h3>
                </div>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                    aria-label="Minimizar calculadora"
                >
                    <ChevronDown className="w-4 h-4 text-muted" />
                </button>
            </div>

            {/* Marketplace selector */}
            <div className="mb-4">
                <label className="text-[10px] uppercase tracking-wider text-muted mb-1 block">
                    Marketplace
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {MARKETPLACE_ORDER.map((mp) => {
                        const mpInfo = MARKETPLACE_INFO[mp];
                        const isSelected = mp === selectedMarketplace;
                        return (
                            <button
                                key={mp}
                                onClick={() => setSelectedMarketplace(mp)}
                                className={`
                                    py-2 px-3 rounded-xl text-xs font-medium
                                    transition-all duration-200
                                    ${isSelected
                                        ? 'text-white shadow-lg'
                                        : 'bg-slate-100 dark:bg-slate-800 text-muted hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }
                                `}
                                style={{
                                    backgroundColor: isSelected ? mpInfo.color : undefined,
                                }}
                            >
                                {mpInfo.displayName.split(' ')[0]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3 mb-4">
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted mb-1 block">
                        Preço de Venda
                    </label>
                    <div className="relative">
                        <span className="app-input-addon app-input-addon-left">R$</span>
                        <input
                            type="number"
                            value={salePrice}
                            onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                            className="app-input app-input-prefix focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted mb-1 block">
                        Custo do Produto
                    </label>
                    <div className="relative">
                        <span className="app-input-addon app-input-addon-left">R$</span>
                        <input
                            type="number"
                            value={costPrice}
                            onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                            className="app-input app-input-prefix focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/10 mb-4" />

            {/* Results */}
            {result && (
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-muted">Taxas</span>
                        <span className="text-sm font-medium text-red-500">
                            -{formatCurrency(result.fees)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-muted">Você recebe</span>
                        <span className="text-sm font-medium text-main">
                            {formatCurrency(result.net)}
                        </span>
                    </div>

                    {/* Profit highlight */}
                    <div className={`
                        p-3 rounded-xl
                        ${result.isProfitable
                            ? 'bg-emerald-500/10 border border-emerald-500/20'
                            : 'bg-red-500/10 border border-red-500/20'
                        }
                    `}>
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-muted">
                                💰 Lucro
                            </span>
                            <span className={`
                                text-lg font-bold
                                ${result.isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
                            `}>
                                {formatCurrency(result.profit)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-[10px] text-muted">Margem</span>
                            <span className={`
                                text-xs font-semibold
                                ${result.isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
                            `}>
                                {result.margin.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
