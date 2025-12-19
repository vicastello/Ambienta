'use client';

import { useState, useEffect } from 'react';
import { Calculator, TrendingUp, AlertCircle } from 'lucide-react';
import { calculateMarketplaceFees } from '@/lib/marketplace-fees';

interface ProfitResult {
    marketplace: string;
    revenue: number;
    cost: number;
    fees: number;
    netRevenue: number;
    profit: number;
    marginPercent: number;
    breakEven: number;
    isRecommended: boolean;
    feeBreakdown: {
        commission: number;
        fixedCost: number;
        campaign?: number;
    };
}

interface ProfitCalculatorProps {
    onClose?: () => void;
}

export function ProfitCalculator({ onClose }: ProfitCalculatorProps) {
    const [cost, setCost] = useState<number>(50);
    const [price, setPrice] = useState<number>(100);
    const [freeShippingShopee, setFreeShippingShopee] = useState(false);
    const [campaignShopee, setCampaignShopee] = useState(false);
    const [results, setResults] = useState<ProfitResult[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        calculateProfits();
    }, [cost, price, freeShippingShopee, campaignShopee]);

    const calculateProfits = async () => {
        if (cost <= 0 || price <= 0) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const marketplaces = ['shopee', 'mercado_livre', 'magalu'] as const;
            const calculations: ProfitResult[] = [];

            for (const marketplace of marketplaces) {
                const feeCalc = await calculateMarketplaceFees({
                    marketplace,
                    orderValue: price,
                    usesFreeShipping: marketplace === 'shopee' ? freeShippingShopee : undefined,
                    isCampaignOrder: marketplace === 'shopee' ? campaignShopee : undefined,
                    orderDate: new Date(),
                });

                const netRevenue = feeCalc.netValue;
                const profit = netRevenue - cost;
                const marginPercent = (profit / price) * 100;
                const breakEven = cost + feeCalc.totalFees;

                calculations.push({
                    marketplace,
                    revenue: price,
                    cost,
                    fees: feeCalc.totalFees,
                    netRevenue,
                    profit,
                    marginPercent,
                    breakEven,
                    isRecommended: false,
                    feeBreakdown: {
                        commission: feeCalc.commissionFee,
                        fixedCost: feeCalc.fixedCost,
                        campaign: feeCalc.campaignFee,
                    },
                });
            }

            // Mark best option
            if (calculations.length > 0) {
                const bestProfit = Math.max(...calculations.map(c => c.profit));
                calculations.forEach(c => {
                    c.isRecommended = c.profit === bestProfit;
                });
            }

            setResults(calculations);
        } catch (error) {
            console.error('Error calculating profits:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value);
    };

    const formatPercent = (value: number) => {
        return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
    };

    const getMarketplaceName = (marketplace: string) => {
        const names: Record<string, string> = {
            shopee: 'Shopee',
            mercado_livre: 'Mercado Livre',
            magalu: 'Magalu',
        };
        return names[marketplace] || marketplace;
    };

    const getMarketplaceColor = (marketplace: string) => {
        const colors: Record<string, string> = {
            shopee: 'orange',
            mercado_livre: 'yellow',
            magalu: 'blue',
        };
        return colors[marketplace] || 'gray';
    };

    const hasNegativeProfit = cost > price;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                        <Calculator className="w-6 h-6 text-purple-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-main">Calculadora de Lucro</h2>
                        <p className="text-sm text-muted">Compare a rentabilidade entre marketplaces</p>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-muted hover:text-main transition-colors"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Inputs */}
            <div className="glass-card rounded-xl p-6 border border-white/20 dark:border-white/10">
                <h3 className="text-sm font-bold text-main mb-4">Dados do Produto</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-main">Custo do Produto (R$)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={cost}
                            onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
                            className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-main focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-main">Preço de Venda (R$)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={price}
                            onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                            className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-main focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                </div>

                {/* Quick Presets */}
                <div className="flex gap-2 mt-4">
                    <span className="text-xs text-muted self-center">Presets:</span>
                    {[50, 100, 200, 500].map((preset) => (
                        <button
                            key={preset}
                            onClick={() => setPrice(preset)}
                            className="px-3 py-1 text-xs rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all"
                        >
                            R$ {preset}
                        </button>
                    ))}
                </div>

                {/* Shopee Options */}
                <div className="mt-6 p-4 bg-orange-500/5 rounded-lg border border-orange-500/20">
                    <p className="text-xs font-bold text-main mb-3">Opções Shopee</p>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={freeShippingShopee}
                                onChange={(e) => setFreeShippingShopee(e.target.checked)}
                                className="rounded"
                            />
                            <span className="text-xs text-main">Programa de Frete Grátis (20% comissão)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={campaignShopee}
                                onChange={(e) => setCampaignShopee(e.target.checked)}
                                className="rounded"
                            />
                            <span className="text-xs text-main">Pedido de Campanha (taxa extra)</span>
                        </label>
                    </div>
                </div>

                {/* Warning */}
                {hasNegativeProfit && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                            Custo maior que preço de venda. Você terá prejuízo!
                        </p>
                    </div>
                )}
            </div>

            {/* Results */}
            {results.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {results.map((result) => {
                        const color = getMarketplaceColor(result.marketplace);
                        const isProfitable = result.profit > 0;
                        const isLowMargin = result.marginPercent < 10 && result.marginPercent > 0;

                        return (
                            <div
                                key={result.marketplace}
                                className={`glass-card rounded-xl p-5 border-2 transition-all ${result.isRecommended
                                        ? 'border-green-500 shadow-lg shadow-green-500/20'
                                        : 'border-white/20 dark:border-white/10'
                                    }`}
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-main">
                                        {getMarketplaceName(result.marketplace)}
                                    </h3>
                                    {result.isRecommended && (
                                        <span className="px-2 py-1 text-[10px] font-bold rounded-full bg-green-500 text-white">
                                            🏆 Melhor
                                        </span>
                                    )}
                                </div>

                                {/* Main Metrics */}
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-muted mb-1">Lucro Líquido</p>
                                        <p className={`text-2xl font-bold ${isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                            }`}>
                                            {formatCurrency(result.profit)}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-muted mb-1">Margem</p>
                                            <p className={`text-base font-bold ${isLowMargin ? 'text-yellow-600 dark:text-yellow-400' :
                                                    isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                                }`}>
                                                {formatPercent(result.marginPercent)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-muted mb-1">Taxas</p>
                                            <p className="text-base font-bold text-red-600 dark:text-red-400">
                                                {formatCurrency(result.fees)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Fee Breakdown */}
                                    <div className="pt-3 border-t border-white/10">
                                        <p className="text-[9px] uppercase font-bold text-muted mb-2">Detalhamento</p>
                                        <div className="space-y-1 text-xs text-muted">
                                            <div className="flex justify-between">
                                                <span>Comissão:</span>
                                                <span>{formatCurrency(result.feeBreakdown.commission)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Custo Fixo:</span>
                                                <span>{formatCurrency(result.feeBreakdown.fixedCost)}</span>
                                            </div>
                                            {result.feeBreakdown.campaign! > 0 && (
                                                <div className="flex justify-between">
                                                    <span>Campanha:</span>
                                                    <span>{formatCurrency(result.feeBreakdown.campaign!)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Break Even */}
                                    <div className="pt-3 border-t border-white/10">
                                        <p className="text-[9px] uppercase font-bold text-muted mb-1">Ponto de Equilíbrio</p>
                                        <p className="text-xs font-semibold text-main">
                                            Venda por no mínimo {formatCurrency(result.breakEven)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Comparison Summary */}
            {results.length > 0 && (
                <div className="glass-card rounded-xl p-5 border border-white/20 dark:border-white/10 bg-gradient-to-br from-purple-500/5 to-blue-500/5">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-4 h-4 text-purple-500" />
                        <h3 className="text-sm font-bold text-main">Análise Comparativa</h3>
                    </div>

                    <div className="space-y-2 text-sm">
                        {results
                            .sort((a, b) => b.profit - a.profit)
                            .map((result, index) => {
                                const best = results[0];
                                const diff = best.profit - result.profit;

                                return (
                                    <div key={result.marketplace} className="flex justify-between items-center">
                                        <span className="text-main font-medium">
                                            {index + 1}º {getMarketplaceName(result.marketplace)}
                                        </span>
                                        <span className="text-muted text-xs">
                                            {diff > 0 ? `R$ ${diff.toFixed(2)} a menos` : 'Melhor opção'}
                                        </span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}
        </div>
    );
}
