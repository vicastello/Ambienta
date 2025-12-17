'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, ChevronLeft, ChevronRight, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CashFlowEntry {
    id: string;
    source: 'tiny_order' | 'purchase_order' | 'manual';
    source_id: string;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    category: string;
    subcategory: string | null;
    due_date: string;
    paid_date: string | null;
    competence_date: string | null;
    status: 'pending' | 'confirmed' | 'overdue' | 'cancelled';
    created_at: string;
}

interface Meta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary: {
        totalReceitas: number;
        totalDespesas: number;
        saldo: number;
        pendente: number;
        confirmado: number;
    };
}

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
        return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
        return dateStr;
    }
};

const sourceLabel: Record<string, string> = {
    tiny_order: 'Tiny (Venda)',
    purchase_order: 'Compra',
    manual: 'Manual',
};

export function ConsolidatedTable() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [entries, setEntries] = useState<CashFlowEntry[]>([]);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams(searchParams.toString());
            const res = await fetch(`/api/financeiro/fluxo-caixa/consolidado?${params.toString()}`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            setEntries(json.entries || []);
            setMeta(json.meta || null);
        } catch (err) {
            console.error('Failed to fetch consolidated data', err);
        } finally {
            setLoading(false);
        }
    }, [searchParams]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`?${params.toString()}`);
    };

    if (loading) {
        return (
            <div className="w-full h-64 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            {meta?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryCard label="Receitas" value={meta.summary.totalReceitas} type="income" />
                    <SummaryCard label="Despesas" value={meta.summary.totalDespesas} type="expense" />
                    <SummaryCard label="Saldo Projetado" value={meta.summary.saldo} type={meta.summary.saldo >= 0 ? 'income' : 'expense'} />
                    <SummaryCard label="Pendente" value={meta.summary.pendente} type="neutral" />
                </div>
            )}

            {/* Table */}
            <div className="glass-panel glass-tint rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white/50 dark:bg-black/20 border-b border-white/20 dark:border-white/10">
                            <tr>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Tipo</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Descrição</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Fonte</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Vencimento</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-right">Valor</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 dark:divide-white/5">
                            {entries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-slate-500">
                                        Nenhum lançamento encontrado.
                                    </td>
                                </tr>
                            ) : (
                                entries.map((entry) => (
                                    <tr key={entry.id} className="hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                                        <td className="py-4 px-6">
                                            {entry.type === 'income' ? (
                                                <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
                                            ) : (
                                                <ArrowDownCircle className="w-5 h-5 text-rose-500" />
                                            )}
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-700 dark:text-slate-200 max-w-[250px] truncate">
                                                    {entry.description}
                                                </span>
                                                <span className="text-xs text-slate-400">{entry.category}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className="inline-flex px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                {sourceLabel[entry.source] || entry.source}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-slate-600 dark:text-slate-400">
                                            {formatDate(entry.due_date)}
                                        </td>
                                        <td className={`py-4 px-6 text-right font-semibold ${entry.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {entry.type === 'income' ? '+' : '-'} {formatCurrency(entry.amount)}
                                        </td>
                                        <td className="py-4 px-6 text-center">
                                            <StatusBadge
                                                status={
                                                    entry.status === 'confirmed' ? 'success' :
                                                        entry.status === 'overdue' ? 'error' :
                                                            entry.status === 'cancelled' ? 'warning' : 'warning'
                                                }
                                                label={
                                                    entry.status === 'confirmed' ? 'Confirmado' :
                                                        entry.status === 'overdue' ? 'Atrasado' :
                                                            entry.status === 'cancelled' ? 'Cancelado' : 'Pendente'
                                                }
                                            />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {meta && meta.totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 bg-white/30 dark:bg-black/10 border-t border-white/20 dark:border-white/10">
                        <button
                            onClick={() => handlePageChange(meta.page - 1)}
                            disabled={meta.page <= 1}
                            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                            Página {meta.page} de {meta.totalPages}
                        </span>
                        <button
                            onClick={() => handlePageChange(meta.page + 1)}
                            disabled={meta.page >= meta.totalPages}
                            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper: Summary Card
function SummaryCard({ label, value, type }: { label: string; value: number; type: 'income' | 'expense' | 'neutral' }) {
    const colorClass = type === 'income' ? 'text-emerald-600' : type === 'expense' ? 'text-rose-600' : 'text-slate-600';
    return (
        <div className="glass-panel glass-tint rounded-2xl border border-white/40 dark:border-white/10 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
            <p className={`text-xl font-bold ${colorClass}`}>{formatCurrency(value)}</p>
        </div>
    );
}
