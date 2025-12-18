'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { AlertCircle, Upload } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { FluxoCaixaTimeline } from './components/FluxoCaixaTimeline';
import { ReceivablesHeader } from './components/ReceivablesHeader';
import { ReceivablesTable } from './components/ReceivablesTable';
import { ReceivablesSummary } from './components/ReceivablesSummary';
import { ManualEntryModal } from './components/ManualEntryModal';
import { RecurringEntriesModal } from './components/RecurringEntriesModal';
import { CashFlowEvolutionChart } from './components/CashFlowEvolutionChart';
import { useSearchParams } from 'next/navigation';
import { useFluxoCaixaData } from './hooks/useFluxoCaixaData';

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

function FluxoCaixaContent() {
    const searchParams = useSearchParams();

    // State for Legacy Data (Projected Balance, Timeline)
    const [data, setData] = useState<FluxoCaixaData | null>(null);
    const [legacyLoading, setLegacyLoading] = useState(true);
    const [legacyError, setLegacyError] = useState<string | null>(null);

    // Use cached data fetching hook for receivables
    const { data: receivablesData, loading: receivablesLoading, isFromCache } = useFluxoCaixaData(searchParams);

    // Effect: Fetch Legacy Data
    useEffect(() => {
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
                setLegacyError(err.message);
            })
            .finally(() => setLegacyLoading(false));
    }, []);

    return (
        <div className="space-y-6 pb-6">
            {/* Header and Filters */}
            <div className="flex flex-col gap-6">
                <div className="flex justify-end gap-3">
                    <RecurringEntriesModal />
                    <ManualEntryModal />
                    <Link
                        href="/financeiro/importar-pagamentos"
                        className="app-btn-primary inline-flex items-center gap-2 whitespace-nowrap"
                    >
                        <Upload className="w-4 h-4" />
                        Importar Pagamentos
                    </Link>
                </div>

                <ReceivablesHeader />
            </div>

            {/* Summary Cards */}
            <ReceivablesSummary
                summary={receivablesData.meta?.summary || null}
                loading={receivablesLoading}
            />

            {/* Evolution Chart */}
            <CashFlowEvolutionChart
                orders={receivablesData.orders}
                loading={receivablesLoading}
            />

            {/* Tabela de Recebíveis */}
            <ReceivablesTable
                orders={receivablesData.orders}
                meta={receivablesData.meta}
                loading={receivablesLoading}
            />

            {/* Legacy Section: Timeline & Projeção */}
            {/* Conditionally rendered without blocking the whole page */}
            {legacyLoading && (
                <div className="space-y-6">
                    <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8 opacity-50">
                        <div className="h-8 w-48 bg-white/20 dark:bg-white/5 rounded-lg animate-pulse mb-2" />
                        <div className="h-4 w-72 bg-white/10 dark:bg-white/5 rounded animate-pulse" />
                    </section>
                </div>
            )}

            {legacyError && (
                <div className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6">
                    <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                        <AlertCircle className="w-6 h-6" />
                        <div>
                            <p className="font-semibold">Erro ao carregar Projeção (Legado)</p>
                            <p className="text-sm text-muted">{legacyError}</p>
                        </div>
                    </div>
                </div>
            )}

            {data && (
                <div className="glass-panel glass-tint rounded-[32px] border border-white/40 dark:border-white/10 p-6 sm:p-8 opacity-60 hover:opacity-100 transition-opacity">
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-main mb-1">
                            Projeção (Legado)
                        </h2>
                    </div>
                    <FluxoCaixaTimeline aReceber={data.aReceber} aPagar={data.aPagar} />
                </div>
            )}
        </div>
    );
}

function FluxoCaixaLoading() {
    return (
        <div className="space-y-6 pb-6">
            <div className="flex flex-col gap-6">
                <div className="flex justify-end gap-3">
                    <div className="h-10 w-32 bg-white/10 rounded-xl animate-pulse" />
                    <div className="h-10 w-40 bg-white/10 rounded-xl animate-pulse" />
                </div>
                <div className="h-16 bg-white/10 rounded-2xl animate-pulse" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-24 bg-white/10 rounded-2xl animate-pulse" />
                ))}
            </div>
            <div className="h-64 bg-white/10 rounded-[32px] animate-pulse" />
        </div>
    );
}

export default function FluxoCaixaPage() {
    return (
        <AppLayout title="Fluxo de Caixa">
            <Suspense fallback={<FluxoCaixaLoading />}>
                <FluxoCaixaContent />
            </Suspense>
        </AppLayout>
    );
}

