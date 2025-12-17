'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface Order {
    id: number;
    tiny_id: number;
    numero_pedido: number;
    cliente: string;
    valor: number;
    data_pedido: string;
    vencimento_estimado: string | null;
    status_pagamento: 'pago' | 'pendente' | 'atrasado';
    data_pagamento: string | null;
    canal: string;
    marketplace_info: any;
}

interface Meta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
        return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch (e) {
        return dateStr;
    }
};

export interface ReceivablesTableProps {
    orders: Order[];
    meta: Meta | null;
    loading: boolean;
}

export function ReceivablesTable({ orders = [], meta, loading }: ReceivablesTableProps) {
    const searchParams = useSearchParams();
    const router = useRouter();

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
        <div className="glass-panel glass-tint rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-white/50 dark:bg-black/20 border-b border-white/20 dark:border-white/10">
                        <tr>
                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Pedido</th>
                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Data</th>
                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Cliente</th>
                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Canal</th>
                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-right">Valor</th>
                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-center">Status Pagamento</th>
                            <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-right">Data Rec.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 dark:divide-white/5">
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-12 text-center text-slate-500">
                                    Nenhum pedido encontrado com os filtros atuais.
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => (
                                <tr
                                    key={order.id}
                                    className="hover:bg-white/40 dark:hover:bg-white/5 transition-colors group"
                                >
                                    <td className="py-4 px-6">
                                        <div className="flex flex-col">
                                            <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                                                #{order.numero_pedido}
                                            </span>
                                            <span className="text-[10px] text-slate-400">ID: {order.tiny_id}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-slate-600 dark:text-slate-400">
                                        {formatDate(order.data_pedido)}
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="font-medium text-slate-700 dark:text-slate-200 max-w-[200px] truncate" title={order.cliente}>
                                            {order.cliente || 'Consumidor Final'}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="inline-flex px-2 py-0.5 rounded textxs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                            {order.canal}
                                        </span>
                                    </td>
                                    <td className="py-4 px-6 text-right font-semibold text-slate-700 dark:text-slate-200">
                                        {formatCurrency(order.valor)}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <StatusBadge
                                            status={
                                                order.status_pagamento === 'pago' ? 'success' :
                                                    order.status_pagamento === 'atrasado' ? 'error' : 'warning'
                                            }
                                            label={
                                                order.status_pagamento === 'pago' ? 'Pago' :
                                                    order.status_pagamento === 'atrasado' ? 'Atrasado' : 'Pendente'
                                            }
                                        />
                                    </td>
                                    <td className="py-4 px-6 text-right text-slate-500 text-xs">
                                        {order.data_pagamento ? formatDate(order.data_pagamento) : '-'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination footer */}
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
    );
}
