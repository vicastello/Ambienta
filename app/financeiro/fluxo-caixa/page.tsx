'use client';

import { useState, useEffect } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp, AlertCircle, Info } from 'lucide-react';
import { MetricSkeleton } from '@/components/ui/Skeleton';
import { FluxoCaixaTimeline } from './components/FluxoCaixaTimeline';

type FluxoCaixaData = {
    periodo: { inicio: string; fim: string };
    aReceber: {
        hoje: number;
        proximos7dias: number;
        proximos30dias: number;
        total: number;
    };
    aPagar: {
        hoje: number;
        proximos7dias: number;
        proximos30dias: number;
        total: number;
        estimado: boolean;
    };
    saldoProjetado: {
        atual: number;
        em7dias: number;
        em30dias: number;
        em60dias: number;
        em90dias: number;
    };
    detalhamento: {
        pedidosAReceber: Array<{
            id: number;
            tinyId: number;
            cliente: string;
            valor: number;
            dataFaturamento: string;
            vencimentoEstimado: string;
            diasAtraso?: number;
            canal: string;
        }>;
        totalPedidos: number;
    };
    nota?: string;
};

const formatBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    });
};

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
};

export default function FluxoCaixaPage() {
    const [data, setData] = useState<FluxoCaixaData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Período padrão: últimos 30 dias
        const fim = new Date();
        const inicio = new Date();
        inicio.setDate(inicio.getDate() - 30);

        const dataInicial = inicio.toISOString().split('T')[0];
        const dataFinal = fim.toISOString().split('T')[0];

        fetch(`/api/dashboard/fluxo-caixa?dataInicial=${dataInicial}&dataFinal=${dataFinal}`)
            .then((r) => {
                if (!r.ok) throw new Error('Erro ao carregar fluxo de caixa');
                return r.json();
            })
            .then(setData)
            .catch((err) => {
                console.error('[FluxoCaixa] Erro:', err);
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--bg-body)] p-4 sm:p-8">
                <div className="max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold mb-8">Fluxo de Caixa</h1>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <MetricSkeleton />
                        <MetricSkeleton />
                        <MetricSkeleton />
                        <MetricSkeleton />
                    </div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-[var(--bg-body)] p-4 sm:p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="glass-panel glass-tint p-6 rounded-[36px]">
                        <div className="flex items-center gap-3 text-rose-600">
                            <AlertCircle className="w-6 h-6" />
                            <div>
                                <p className="font-semibold">Erro ao carregar Fluxo de Caixa</p>
                                <p className="text-sm text-muted">{error}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const saudeSaldo = data.saldoProjetado.atual >= 0 ? 'positivo' : 'negativo';

    return (
        <div className="min-h-screen bg-[var(--bg-body)] p-4 sm:p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-main mb-2">
                        Fluxo de Caixa
                    </h1>
                    <p className="text-muted">
                        Visão geral de contas a receber, a pagar e projeções
                    </p>
                </div>

                {/* Cards Principais */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* A Receber */}
                    <div className="rounded-[28px] glass-panel glass-tint p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-wide text-muted">A Receber</p>
                            <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
                        </div>
                        <p className="text-3xl font-bold text-emerald-500 mb-2">
                            {formatBRL(data.aReceber.total)}
                        </p>
                        <div className="space-y-1 text-xs text-muted">
                            <p>Hoje: {formatBRL(data.aReceber.hoje)}</p>
                            <p>7 dias: {formatBRL(data.aReceber.proximos7dias)}</p>
                            <p>30 dias: {formatBRL(data.aReceber.proximos30dias)}</p>
                        </div>
                    </div>

                    {/* A Pagar */}
                    <div className="rounded-[28px] glass-panel glass-tint p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-wide text-muted">A Pagar</p>
                            <ArrowDownCircle className="w-5 h-5 text-orange-500" />
                        </div>
                        <p className="text-3xl font-bold text-orange-500 mb-2">
                            {formatBRL(data.aPagar.total)}
                        </p>
                        <div className="space-y-1 text-xs text-muted">
                            <p>Hoje: {formatBRL(data.aPagar.hoje)}</p>
                            <p>7 dias: {formatBRL(data.aPagar.proximos7dias)}</p>
                            <p>30 dias: {formatBRL(data.aPagar.proximos30dias)}</p>
                        </div>
                        {data.aPagar.estimado && (
                            <div className="mt-2 px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                                Estimado
                            </div>
                        )}
                    </div>

                    {/* Saldo Atual */}
                    <div className="rounded-[28px] glass-panel glass-tint p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-wide text-muted">Saldo Atual</p>
                            <Wallet className={`w-5 h-5 ${saudeSaldo === 'positivo' ? 'text-emerald-500' : 'text-rose-500'}`} />
                        </div>
                        <p className={`text-3xl font-bold mb-2 ${saudeSaldo === 'positivo' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {formatBRL(data.saldoProjetado.atual)}
                        </p>
                        <p className="text-xs text-muted">
                            A Receber - A Pagar
                        </p>
                    </div>

                    {/* Projeção 30 dias */}
                    <div className="rounded-[28px] glass-panel glass-tint p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-wide text-muted">Projeção 30d</p>
                            <TrendingUp className="w-5 h-5 text-accent" />
                        </div>
                        <p className="text-3xl font-bold text-accent mb-2">
                            {formatBRL(data.saldoProjetado.em30dias)}
                        </p>
                        <div className="space-y-1 text-xs text-muted">
                            <p>60d: {formatBRL(data.saldoProjetado.em60dias)}</p>
                            <p>90d: {formatBRL(data.saldoProjetado.em90dias)}</p>
                        </div>
                    </div>
                </div>

                {/* Gráfico de Projeção Timeline */}
                <div className="glass-panel glass-tint rounded-[36px] p-6 sm:p-8">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-main mb-1">
                            Projeção de Fluxo (90 dias)
                        </h2>
                        <p className="text-sm text-muted">
                            Visualização de receitas, despesas e saldo projetados
                        </p>
                    </div>
                    <FluxoCaixaTimeline aReceber={data.aReceber} aPagar={data.aPagar} />
                </div>

                {/* Nota Explicativa */}
                {data.nota && (
                    <div className="p-5 rounded-2xl bg-blue-50/50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20">
                        <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-blue-700 dark:text-blue-300">{data.nota}</p>
                        </div>
                    </div>
                )}

                {/* Tabela Detalhada */}
                <div className="glass-panel glass-tint rounded-[36px] p-6 sm:p-8">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-main mb-1">
                            Pedidos A Receber
                        </h2>
                        <p className="text-sm text-muted">
                            {data.detalhamento.totalPedidos} pedidos faturados aguardando recebimento
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left py-3 px-2 font-semibold text-muted">Pedido</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted">Cliente</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted">Canal</th>
                                    <th className="text-right py-3 px-2 font-semibold text-muted">Valor</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted">Faturamento</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted">Vencimento</th>
                                    <th className="text-center py-3 px-2 font-semibold text-muted">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.detalhamento.pedidosAReceber.map((pedido) => (
                                    <tr key={pedido.id} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="py-3 px-2 font-mono text-xs">#{pedido.tinyId}</td>
                                        <td className="py-3 px-2">{pedido.cliente}</td>
                                        <td className="py-3 px-2 text-xs">{pedido.canal}</td>
                                        <td className="py-3 px-2 text-right font-semibold text-accent">
                                            {formatBRL(pedido.valor)}
                                        </td>
                                        <td className="py-3 px-2 text-xs">{formatDate(pedido.dataFaturamento)}</td>
                                        <td className="py-3 px-2 text-xs">{formatDate(pedido.vencimentoEstimado)}</td>
                                        <td className="py-3 px-2 text-center">
                                            {pedido.diasAtraso !== undefined ? (
                                                <span className="px-2 py-1 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                                                    {pedido.diasAtraso}d atraso
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                                                    No prazo
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
