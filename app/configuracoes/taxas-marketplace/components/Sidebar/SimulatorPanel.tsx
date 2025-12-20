'use client';

import { useState, useEffect } from 'react';
import { Calculator, Coins, TrendingUp, Package } from 'lucide-react';
import {
    calculateShopeeImpact,
    calculateMercadoLivreImpact,
    calculateMagaluImpact
} from '../../lib/calculations';
import type { ShopeeConfig, MercadoLivreConfig, MagaluConfig, ImpactPreview } from '../../lib/types';
import { isShopeeConfig, isMercadoLivreConfig, isMagaluConfig } from '../../lib/types';

interface SimulatorPanelProps {
    shopeeConfig: ShopeeConfig;
    mercadoLivreConfig: MercadoLivreConfig;
    magaluConfig: MagaluConfig;
    activeMarketplace: string;
    config: ShopeeConfig | MercadoLivreConfig | MagaluConfig;
}

export function SimulatorPanel({
    shopeeConfig,
    mercadoLivreConfig,
    magaluConfig,
    activeMarketplace,
    config
}: SimulatorPanelProps) {
    // Estados do Simulador
    const [price, setPrice] = useState<string>('0');
    const [cost, setCost] = useState<string>('0');

    // Estados de Frete
    const [weight, setWeight] = useState<string>('');
    const [length, setLength] = useState<string>('');
    const [width, setWidth] = useState<string>('');
    const [height, setHeight] = useState<string>('');
    const [includeFreight, setIncludeFreight] = useState(true);
    const [isWorstCase, setIsWorstCase] = useState(false);

    const [impact, setImpact] = useState<ImpactPreview | null>(null);

    // Cálculos auxiliares para display
    const weightNum = parseFloat(weight) || 0;
    const dimL = parseFloat(length) || 0;
    const dimW = parseFloat(width) || 0;
    const dimH = parseFloat(height) || 0;
    const volWeight = (dimL * dimW * dimH) / 6000;
    const chargeableWeight = Math.max(weightNum, volWeight);

    // Regra de Frete Grátis Obrigatório
    const isFreightMandatory = (parseFloat(price) || 0) >= 79;
    const isFreightActive = includeFreight || isFreightMandatory;

    useEffect(() => {
        const salePrice = parseFloat(price) || 0;

        let result: ImpactPreview;

        if (activeMarketplace === 'shopee' && isShopeeConfig(config)) {
            result = calculateShopeeImpact(config, salePrice);
        } else if (activeMarketplace === 'mercado_livre' && isMercadoLivreConfig(config)) {
            result = calculateMercadoLivreImpact(config, salePrice, {
                weightKg: weightNum,
                dimensions: { length: dimL, width: dimW, height: dimH },
                includeFreight,
                isWorstCase
            });
        } else if (activeMarketplace === 'magalu' && isMagaluConfig(config)) {
            result = calculateMagaluImpact(config, salePrice);
        } else {
            result = { net: 0, fees: 0, breakdown: { commission: 0, fixedCost: 0 } };
        }

        setImpact(result);
    }, [price, config, activeMarketplace, weight, length, width, height, includeFreight, isWorstCase]);

    // Formatadores do display
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const formatWeight = (val: number) =>
        new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val);

    const productCost = parseFloat(cost) || 0;
    const profit = (impact?.net || 0) - productCost;
    const margin = parseFloat(price) > 0 ? (profit / parseFloat(price)) * 100 : 0;

    return (
        <div className="space-y-6">
            {/* Simulador Card */}
            <div className="glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10">
                <div className="flex items-center gap-2 mb-6 text-main">
                    <Calculator className="w-5 h-5" />
                    <h2 className="text-lg font-semibold">Simulador</h2>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-2">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-muted uppercase tracking-wider">
                            Preço de Venda
                        </label>
                        <div className="relative">
                            <span className="app-input-addon app-input-addon-left">R$</span>
                            <input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="app-input app-input-prefix font-mono text-lg"
                                placeholder="0,00"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-muted uppercase tracking-wider">
                            Custo do Produto
                        </label>
                        <div className="relative">
                            <span className="app-input-addon app-input-addon-left">R$</span>
                            <input
                                type="number"
                                value={cost}
                                onChange={(e) => setCost(e.target.value)}
                                className="app-input app-input-prefix font-mono text-lg"
                                placeholder="0,00"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Nova Seção: Frete (Apenas Mercado Livre) */}
            {activeMarketplace === 'mercado_livre' && (
                <div className="glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2 text-main">
                            <Package className="w-5 h-5" />
                            <h2 className="text-lg font-semibold">Frete e Dimensões</h2>
                        </div>

                        <div className="flex items-center gap-2">
                            {isFreightMandatory ? (
                                <span className="text-[10px] font-bold text-emerald-500 uppercase px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                                    Obrigatório (&ge; R$ 79)
                                </span>
                            ) : (
                                <span className="text-xs text-muted font-medium uppercase">Incluir Frete</span>
                            )}
                            <button
                                onClick={() => !isFreightMandatory && setIncludeFreight(!includeFreight)}
                                disabled={isFreightMandatory}
                                className={`w-10 h-6 flex flex-shrink-0 items-center rounded-full p-1 transition-colors duration-200 ${isFreightActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                                    } ${isFreightMandatory ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${isFreightActive ? 'translate-x-4' : 'translate-x-0'
                                    }`} />
                            </button>
                        </div>
                    </div>

                    <div className={`space-y-4 transition-opacity ${isFreightActive ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        {/* Peso e Dimensões */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 col-span-2 sm:col-span-1">
                                <label className="text-xs text-muted font-bold uppercase">Peso (kg)</label>
                                <div className="relative">
                                    <input
                                        type="number" step="0.1"
                                        value={weight} onChange={e => setWeight(e.target.value)}
                                        className="app-input pr-8"
                                        placeholder="0.0"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted">KG</span>
                                </div>
                            </div>

                            <div className="col-span-2 sm:col-span-1 space-y-2">
                                <label className="text-xs text-muted font-bold uppercase">Dimensões (cm)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['length,C', 'width,L', 'height,A'].map((item) => {
                                        const [key, label] = item.split(',');
                                        const val = key === 'length' ? length : key === 'width' ? width : height;
                                        const setVal = key === 'length' ? setLength : key === 'width' ? setWidth : setHeight;

                                        return (
                                            <div key={key} className="relative group">
                                                <input
                                                    type="number"
                                                    className="app-input text-center px-1"
                                                    value={val}
                                                    onChange={e => setVal(e.target.value)}
                                                    placeholder="0"
                                                />
                                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] text-muted font-bold opacity-0 group-hover:opacity-100 transition-opacity">{label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Toggle Normal/Pior Caso */}
                        <div className="flex items-center justify-between p-3 bg-slate-500/5 rounded-xl border border-slate-500/10">
                            <span className="text-xs font-semibold text-muted">Cenário de Repasse</span>
                            <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
                                <button
                                    onClick={() => setIsWorstCase(false)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${!isWorstCase ? 'bg-white shadow text-emerald-600' : 'text-muted hover:text-main'}`}
                                >
                                    Normal
                                </button>
                                <button
                                    onClick={() => setIsWorstCase(true)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${isWorstCase ? 'bg-white shadow text-orange-600' : 'text-muted hover:text-main'}`}
                                >
                                    Pior Caso
                                </button>
                            </div>
                        </div>

                        {/* Status do Cálculo de Frete */}
                        {(weightNum > 0 || (dimL > 0 && dimW > 0)) && (
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-dashed border-slate-500/20">
                                <div className="text-center">
                                    <span className="block text-[10px] text-muted uppercase">Volumétrico</span>
                                    <span className="block text-xs font-mono font-bold text-main">{formatWeight(volWeight)} kg</span>
                                </div>
                                <div className="text-center">
                                    <span className="block text-[10px] text-muted uppercase">Tarifado</span>
                                    <span className="block text-xs font-mono font-bold text-blue-600">{formatWeight(chargeableWeight)} kg</span>
                                </div>
                                <div className="text-center">
                                    <span className="block text-[10px] text-muted uppercase">Custo Frete</span>
                                    <span className="block text-xs font-mono font-bold text-red-500">
                                        {formatCurrency(impact?.breakdown?.freightCost || 0)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Resultados (Card de Impacto) */}
            <div className={`
                glass-panel glass-tint rounded-[32px] p-6 border border-white/30 dark:border-white/10
                relative overflow-hidden
            `}>
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Coins className="w-24 h-24" />
                </div>

                <div className="relative z-10 flex flex-col gap-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted">
                        Simulação de Impacto
                    </h3>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-main">Venda de:</span>
                            <span className="font-bold text-main">{formatCurrency(parseFloat(price) || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-red-500/80">
                            <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                <span>Comissão:</span>
                            </div>
                            <span>- {formatCurrency(impact?.breakdown?.commission || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-red-500/80">
                            <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                <span>Custo fixo:</span>
                            </div>
                            <span>- {formatCurrency(impact?.breakdown?.fixedCost || 0)}</span>
                        </div>

                        {/* Linha de Frete Condicional */}
                        {(isFreightMandatory || (impact?.breakdown?.freightCost || 0) > 0) && (
                            <div className="flex justify-between items-center text-sm text-red-500/80">
                                <div className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                    <span>Frete (Minha parte):</span>
                                </div>
                                <span className="flex items-center gap-1">
                                    {(impact?.breakdown?.freightCost || 0) === 0 && isFreightMandatory ? (
                                        <span className="text-[10px] text-orange-500 font-medium">(Defina o peso)</span>
                                    ) : null}
                                    - {formatCurrency(impact?.breakdown?.freightCost || 0)}
                                </span>
                            </div>
                        )}

                        <div className="h-px bg-slate-500/20 my-2"></div>

                        <div className="flex justify-between items-center font-bold">
                            <span className="text-red-500">Taxas totais:</span>
                            <span className="text-red-500">
                                - {formatCurrency(impact?.fees || 0)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-2 pt-4 border-t border-slate-500/20">
                        <span className="text-sm font-bold text-muted uppercase">Você recebe:</span>
                        <span className="text-2xl font-bold text-emerald-500">
                            {formatCurrency(impact?.net || 0)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Como calculamos (Information) */}
            {activeMarketplace === 'mercado_livre' && (
                <div className="p-4 rounded-xl bg-slate-500/5 border border-slate-500/10">
                    <h4 className="text-xs font-bold text-main mb-2 flex items-center gap-1">
                        <span className="text-blue-500">ℹ️</span> Como calculamos o frete
                    </h4>
                    <ul className="text-[10px] text-muted space-y-1 list-disc list-inside">
                        <li>Frete base estimado por faixa de peso tarifado (tabela configurável).</li>
                        <li>Peso tarifado = o maior valor entre peso físico e peso volumétrico (C×L×A/6000).</li>
                        <li>Cenário "Normal" aplica taxa de repasse de {((config as MercadoLivreConfig).freight_seller_rate_normal || 0.4) * 100}%.</li>
                    </ul>
                </div>
            )}
        </div>
    );
}
