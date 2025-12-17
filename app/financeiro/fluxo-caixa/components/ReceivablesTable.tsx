'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2, Search, X, ShoppingBag, Package, Store } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';

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

// Marketplace badge configuration
const marketplaceBadges: Record<string, { bg: string; text: string; icon: any; label: string }> = {
    'Shopee': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', icon: ShoppingBag, label: 'Shopee' },
    'Mercado Livre': { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', icon: Package, label: 'ML' },
    'Magalu': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: Store, label: 'Magalu' },
    'Outros': { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', icon: Package, label: 'Outros' },
};

const getMarketplaceBadge = (canal: string) => {
    if (canal?.toLowerCase().includes('shopee')) return marketplaceBadges['Shopee'];
    if (canal?.toLowerCase().includes('mercado') || canal?.toLowerCase().includes('meli')) return marketplaceBadges['Mercado Livre'];
    if (canal?.toLowerCase().includes('magalu') || canal?.toLowerCase().includes('magazine')) return marketplaceBadges['Magalu'];
    return marketplaceBadges['Outros'];
};

export interface ReceivablesTableProps {
    orders: Order[];
    meta: Meta | null;
    loading: boolean;
}

export function ReceivablesTable({ orders = [], meta, loading }: ReceivablesTableProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`?${params.toString()}`);
    };

    // Client-side filtering by search term
    const filteredOrders = useMemo(() => {
        if (!searchTerm.trim()) return orders;
        const term = searchTerm.toLowerCase();
        return orders.filter(order =>
            order.cliente?.toLowerCase().includes(term) ||
            order.numero_pedido?.toString().includes(term) ||
            order.tiny_id?.toString().includes(term) ||
            order.canal?.toLowerCase().includes(term)
        );
    }, [orders, searchTerm]);

    if (loading) {
        return (
            <div className="w-full h-64 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Search Input */}
            <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por cliente, pedido ou canal..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={cn(
                        "w-full pl-10 pr-10 py-3 rounded-2xl",
                        "bg-white/60 dark:bg-black/20 border border-white/40 dark:border-white/10",
                        "placeholder:text-slate-400 text-slate-700 dark:text-slate-200",
                        "focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-transparent",
                        "transition-all duration-200"
                    )}
                />
                {searchTerm && (
                    <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                )}
            </div>

            {/* Table */}
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
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-center">Status</th>
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 text-right">Data Rec.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 dark:divide-white/5">
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-12 text-center text-slate-500">
                                        {searchTerm ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <Search className="w-8 h-8 text-slate-300" />
                                                <p>Nenhum resultado para "{searchTerm}"</p>
                                            </div>
                                        ) : (
                                            'Nenhum pedido encontrado com os filtros atuais.'
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map((order) => {
                                    const badge = getMarketplaceBadge(order.canal);
                                    const BadgeIcon = badge.icon;
                                    return (
                                        <tr
                                            key={order.id}
                                            className={cn(
                                                "hover:bg-white/40 dark:hover:bg-white/5 transition-colors group",
                                                order.status_pagamento === 'atrasado' && "bg-rose-50/50 dark:bg-rose-950/20",
                                                order.status_pagamento === 'pago' && "bg-emerald-50/30 dark:bg-emerald-950/10"
                                            )}
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
                                                <span className={cn(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
                                                    badge.bg, badge.text
                                                )}>
                                                    <BadgeIcon className="w-3.5 h-3.5" />
                                                    {badge.label}
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
                                    );
                                })
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
                            Página {meta.page} de {meta.totalPages} • {filteredOrders.length} de {orders.length} registros
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

