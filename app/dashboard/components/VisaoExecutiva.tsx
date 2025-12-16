'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Info, AlertCircle } from 'lucide-react';
import { MetricSkeleton } from '@/components/ui/Skeleton';
import { WaterfallRentabilidade } from './WaterfallRentabilidade';

type FinanceiroData = {
    periodo: {
        inicio: string;
        fim: string;
    };
    receita: {
        bruta: number;
        liquida: number;
        frete: number;
    };
    rentabilidade: {
        margemBruta: number;
        margemBrutaPercent: number;
        despesasOperacionais: number;
        despesasOperacionaisPercent: number;
        lucroLiquido: number;
        margemLiquidaPercent: number;
    };
    estimado: boolean;
    nota?: string;
};

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    });
};

export function VisaoExecutiva({
    dataInicial,
    dataFinal,
    canais,
    situacoes,
}: {
    dataInicial?: string;
    dataFinal?: string;
    canais?: string[];
    situacoes?: number[];
}) {
    const [data, setData] = useState<FinanceiroData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [config, setConfig] = useState<{ margemBruta: number; despesasOp: number } | null>(null);

    // Carregar configurações do localStorage
    useEffect(() => {
        const saved = localStorage.getItem('config_financeiro');
        if (saved) {
            try {
                setConfig(JSON.parse(saved));
            } catch (e) {
                console.error('[VisaoExecutiva] Erro ao carregar config:', e);
            }
        }
    }, []);

    useEffect(() => {
        if (!dataInicial || !dataFinal) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
            dataInicial,
            dataFinal,
        });

        if (canais && canais.length > 0) {
            params.set('canais', canais.join(','));
        }
        if (situacoes && situacoes.length > 0) {
            params.set('situacoes', situacoes.join(','));
        }

        // Adicionar configurações customizadas se existirem
        if (config) {
            params.set('margemBruta', config.margemBruta.toString());
            params.set('despesasOp', config.despesasOp.toString());
        }

        fetch(`/api/dashboard/financeiro?${params}`)
            .then((r) => {
                if (!r.ok) throw new Error('Erro ao carregar dados financeiros');
                return r.json();
            })
            .then(setData)
            .catch((err) => {
                console.error('[VisaoExecutiva] Erro:', err);
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, [dataInicial, dataFinal, canais, situacoes, config]);

    if (loading) {
        return (
            <section className="rounded-[36px] glass-panel glass-tint p-6 sm:p-8">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-main">Visão Executiva</h2>
                        <p className="text-sm text-muted mt-1">Principais indicadores de saúde do negócio</p>
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricSkeleton />
                    <MetricSkeleton />
                    <MetricSkeleton />
                    <MetricSkeleton />
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="rounded-[36px] glass-panel glass-tint p-6 sm:p-8">
                <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                    <AlertCircle className="w-6 h-6" />
                    <div>
                        <p className="font-semibold">Erro ao carregar métricas financeiras</p>
                        <p className="text-sm text-muted mt-1">{error}</p>
                    </div>
                </div>
            </section>
        );
    }

    if (!data) return null;

    const { rentabilidade, receita, estimado, nota } = data;

    return (
        <section className="rounded-[36px] glass-panel glass-tint p-6 sm:p-8">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-main">Visão Executiva</h2>
                    <p className="text-sm text-muted mt-1">Principais indicadores de saúde do negócio</p>
                </div>

                {estimado && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50/80 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-medium">
                        <Info className="w-4 h-4" />
                        <span>Estimado</span>
                    </div>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Lucro Líquido */}
                <div className="rounded-[28px] glass-panel glass-tint p-5">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-wide text-muted">Lucro Líquido</p>
                        <DollarSign className="w-5 h-5 text-accent shrink-0" />
                    </div>
                    <p className="text-3xl font-semibold text-accent mb-1">
                        {formatBRL(rentabilidade.lucroLiquido)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-muted">
                            Margem: {rentabilidade.margemLiquidaPercent.toFixed(1)}%
                        </p>
                    </div>
                </div>

                {/* Margem Bruta */}
                <div className="rounded-[28px] glass-panel glass-tint p-5">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-wide text-muted">Margem Bruta</p>
                        <TrendingUp className="w-5 h-5 text-emerald-500 dark:text-[#33e2a7] shrink-0" />
                    </div>
                    <p className="text-3xl font-semibold text-emerald-500 dark:text-[#33e2a7] mb-1">
                        {formatBRL(rentabilidade.margemBruta)}
                    </p>
                    <p className="text-xs text-muted mt-2">
                        {rentabilidade.margemBrutaPercent.toFixed(1)}% da receita
                    </p>
                </div>

                {/* Despesas Operacionais */}
                <div className="rounded-[28px] glass-panel glass-tint p-5">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-wide text-muted">Despesas Op.</p>
                        <AlertCircle className="w-5 h-5 text-orange-500 shrink-0" />
                    </div>
                    <p className="text-3xl font-semibold text-orange-500 mb-1">
                        {formatBRL(rentabilidade.despesasOperacionais)}
                    </p>
                    <p className="text-xs text-muted mt-2">
                        {rentabilidade.despesasOperacionaisPercent.toFixed(1)}% da receita
                    </p>
                </div>

                {/* Placeholder - Fluxo de Caixa */}
                <div className="rounded-[28px] glass-panel glass-tint p-5 opacity-60">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-wide text-muted">Fluxo de Caixa</p>
                        <Info className="w-5 h-5 text-muted shrink-0" />
                    </div>
                    <p className="text-sm font-semibold text-muted mb-1">Em breve</p>
                    <p className="text-xs text-muted mt-2">Projeção 30/60/90 dias</p>
                </div>
            </div>

            {nota && (
                <div className="mt-4 p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20">
                    <p className="text-xs text-blue-700 dark:text-blue-300">{nota}</p>
                </div>
            )}

            {/* Waterfall Chart - Breakdown Detalhado */}
            <div className="mt-8 pt-8 border-t border-white/10">
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-main mb-1">Breakdown de Rentabilidade</h3>
                    <p className="text-sm text-muted">Visualização em cascata dos componentes de lucro</p>
                </div>
                <WaterfallRentabilidade
                    data={{
                        receitaBruta: receita.bruta,
                        frete: receita.frete,
                        margemBruta: rentabilidade.margemBruta,
                        despesasOp: rentabilidade.despesasOperacionais,
                        lucroLiquido: rentabilidade.lucroLiquido,
                    }}
                />
            </div>
        </section>
    );
}
