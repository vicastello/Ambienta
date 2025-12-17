'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { format, differenceInDays, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    ChevronLeft, ChevronRight, Loader2, Search, X,
    ShoppingBag, Package, Store, ArrowUpDown, ArrowUp, ArrowDown,
    CheckCircle2, Clock, AlertTriangle, XCircle, Bell
} from 'lucide-react';
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
    summary?: {
        recebido: number;
        pendente: number;
        atrasado: number;
        total: number;
    };
}

type SortField = 'numero_pedido' | 'data_pedido' | 'cliente' | 'valor' | 'status_pagamento' | 'vencimento_estimado';
type SortDirection = 'asc' | 'desc';

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

// Enhanced status configuration
const getEnhancedStatus = (order: Order) => {
    if (order.status_pagamento === 'pago') {
        return {
            icon: CheckCircle2,
            label: 'Pago',
            bg: 'bg-emerald-100 dark:bg-emerald-900/30',
            text: 'text-emerald-700 dark:text-emerald-300',
            iconColor: 'text-emerald-500',
        };
    }

    if (order.status_pagamento === 'atrasado') {
        const daysOverdue = order.vencimento_estimado
            ? Math.abs(differenceInDays(new Date(), new Date(order.vencimento_estimado)))
            : 0;
        return {
            icon: XCircle,
            label: daysOverdue > 0 ? `${daysOverdue}d atrasado` : 'Atrasado',
            bg: 'bg-rose-100 dark:bg-rose-900/30',
            text: 'text-rose-700 dark:text-rose-300',
            iconColor: 'text-rose-500',
        };
    }

    // Pending - check if due today or tomorrow
    if (order.vencimento_estimado) {
        const vencimento = new Date(order.vencimento_estimado);

        if (isToday(vencimento)) {
            return {
                icon: AlertTriangle,
                label: 'Vence hoje',
                bg: 'bg-amber-100 dark:bg-amber-900/30 animate-pulse',
                text: 'text-amber-700 dark:text-amber-300',
                iconColor: 'text-amber-500',
            };
        }

        if (isTomorrow(vencimento)) {
            return {
                icon: Clock,
                label: 'Vence amanhã',
                bg: 'bg-amber-50 dark:bg-amber-900/20',
                text: 'text-amber-600 dark:text-amber-400',
                iconColor: 'text-amber-400',
            };
        }
    }

    return {
        icon: Clock,
        label: 'Pendente',
        bg: 'bg-slate-100 dark:bg-slate-800/50',
        text: 'text-slate-600 dark:text-slate-400',
        iconColor: 'text-slate-400',
    };
};

export interface ReceivablesTableProps {
    orders: Order[];
    meta: Meta | null;
    loading: boolean;
}

// Sortable header component
function SortableHeader({
    label,
    field,
    sortField,
    sortDirection,
    onSort,
    align = 'left'
}: {
    label: string;
    field: SortField;
    sortField: SortField | null;
    sortDirection: SortDirection;
    onSort: (field: SortField) => void;
    align?: 'left' | 'right' | 'center';
}) {
    const isActive = sortField === field;

    return (
        <th
            className={cn(
                "py-4 px-6 font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none",
                "hover:bg-white/40 dark:hover:bg-white/5 transition-colors",
                align === 'right' && 'text-right',
                align === 'center' && 'text-center'
            )}
            onClick={() => onSort(field)}
        >
            <div className={cn(
                "inline-flex items-center gap-1.5",
                align === 'right' && 'flex-row-reverse',
                align === 'center' && 'justify-center'
            )}>
                {label}
                {isActive ? (
                    sortDirection === 'asc'
                        ? <ArrowUp className="w-3.5 h-3.5 text-primary-500" />
                        : <ArrowDown className="w-3.5 h-3.5 text-primary-500" />
                ) : (
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100" />
                )}
            </div>
        </th>
    );
}

// Alert Banner Component
function AlertBanner({ orders }: { orders: Order[] }) {
    const alerts = useMemo(() => {
        const dueTodayOrders = orders.filter(o => {
            if (o.status_pagamento === 'pago') return false;
            if (!o.vencimento_estimado) return false;
            return isToday(new Date(o.vencimento_estimado));
        });

        const overdueOrders = orders.filter(o => o.status_pagamento === 'atrasado');
        const overdueOver15Days = overdueOrders.filter(o => {
            if (!o.vencimento_estimado) return false;
            return Math.abs(differenceInDays(new Date(), new Date(o.vencimento_estimado))) > 15;
        });

        const dueTodayTotal = dueTodayOrders.reduce((sum, o) => sum + o.valor, 0);
        const overdueTotal = overdueOrders.reduce((sum, o) => sum + o.valor, 0);

        return {
            dueToday: { count: dueTodayOrders.length, total: dueTodayTotal },
            overdue: { count: overdueOrders.length, total: overdueTotal },
            overdueOver15: { count: overdueOver15Days.length },
        };
    }, [orders]);

    if (alerts.dueToday.count === 0 && alerts.overdue.count === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-3">
            {alerts.dueToday.count > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100/80 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
                    <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-bounce" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        {alerts.dueToday.count} pagamento{alerts.dueToday.count > 1 ? 's' : ''} vence{alerts.dueToday.count > 1 ? 'm' : ''} hoje ({formatCurrency(alerts.dueToday.total)})
                    </span>
                </div>
            )}

            {alerts.overdueOver15.count > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-100/80 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span className="text-sm font-medium text-rose-800 dark:text-rose-200">
                        {alerts.overdueOver15.count} atrasado{alerts.overdueOver15.count > 1 ? 's' : ''} há mais de 15 dias
                    </span>
                </div>
            )}
        </div>
    );
}

export function ReceivablesTable({ orders = [], meta, loading }: ReceivablesTableProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`?${params.toString()}`);
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Client-side filtering and sorting
    const processedOrders = useMemo(() => {
        let result = [...orders];

        // Filter by search term
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(order =>
                order.cliente?.toLowerCase().includes(term) ||
                order.numero_pedido?.toString().includes(term) ||
                order.tiny_id?.toString().includes(term) ||
                order.canal?.toLowerCase().includes(term)
            );
        }

        // Sort
        if (sortField) {
            result.sort((a, b) => {
                let aVal: any = a[sortField];
                let bVal: any = b[sortField];

                // Handle nulls
                if (aVal === null || aVal === undefined) aVal = '';
                if (bVal === null || bVal === undefined) bVal = '';

                // Handle dates
                if (sortField === 'data_pedido' || sortField === 'vencimento_estimado') {
                    aVal = aVal ? new Date(aVal).getTime() : 0;
                    bVal = bVal ? new Date(bVal).getTime() : 0;
                }

                // Handle numbers
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                }

                // Handle strings
                const comparison = String(aVal).localeCompare(String(bVal), 'pt-BR');
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [orders, searchTerm, sortField, sortDirection]);

    if (loading) {
        return (
            <div className="w-full h-64 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Alert Banners */}
            <AlertBanner orders={orders} />

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
                            <tr className="group">
                                <SortableHeader
                                    label="Pedido"
                                    field="numero_pedido"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                />
                                <SortableHeader
                                    label="Data"
                                    field="data_pedido"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                />
                                <SortableHeader
                                    label="Cliente"
                                    field="cliente"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                />
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">Canal</th>
                                <SortableHeader
                                    label="Valor"
                                    field="valor"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <SortableHeader
                                    label="Status"
                                    field="status_pagamento"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="center"
                                />
                                <SortableHeader
                                    label="Vencimento"
                                    field="vencimento_estimado"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="right"
                                />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 dark:divide-white/5">
                            {processedOrders.length === 0 ? (
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
                                processedOrders.map((order) => {
                                    const marketplaceBadge = getMarketplaceBadge(order.canal);
                                    const BadgeIcon = marketplaceBadge.icon;
                                    const status = getEnhancedStatus(order);
                                    const StatusIcon = status.icon;

                                    return (
                                        <tr
                                            key={order.id}
                                            className={cn(
                                                "hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer group",
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
                                                    marketplaceBadge.bg, marketplaceBadge.text
                                                )}>
                                                    <BadgeIcon className="w-3.5 h-3.5" />
                                                    {marketplaceBadge.label}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right font-semibold text-slate-700 dark:text-slate-200">
                                                {formatCurrency(order.valor)}
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
                                                    status.bg, status.text
                                                )}>
                                                    <StatusIcon className={cn("w-3.5 h-3.5", status.iconColor)} />
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right text-slate-500 text-xs">
                                                {order.status_pagamento === 'pago'
                                                    ? formatDate(order.data_pagamento)
                                                    : formatDate(order.vencimento_estimado)
                                                }
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
                            Página {meta.page} de {meta.totalPages} • {processedOrders.length} de {orders.length} registros
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
