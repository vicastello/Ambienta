'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { format, differenceInDays, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    ChevronLeft, ChevronRight, Loader2, Search, X,
    ShoppingBag, Package, Store, ArrowUpDown, ArrowUp, ArrowDown,
    CheckCircle2, Clock, AlertTriangle, XCircle, Bell,
    Check, Download, CreditCard, SquareCheck, Square, Minus,
    ExternalLink, Calendar, User, Hash, MapPin, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { markOrdersAsPaid } from '@/app/financeiro/actions';
import { useDebounce } from '@/hooks/useDebounce';

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

        return {
            dueToday: { count: dueTodayOrders.length, total: dueTodayTotal },
            overdueOver15: { count: overdueOver15Days.length },
        };
    }, [orders]);

    if (alerts.dueToday.count === 0 && alerts.overdueOver15.count === 0) {
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

// Selection Action Bar Component with detailed totals
function SelectionActionBar({
    selectedOrders,
    onClearSelection,
    onMarkAsPaid,
    onExportCSV,
    isProcessing
}: {
    selectedOrders: Order[];
    onClearSelection: () => void;
    onMarkAsPaid: () => void;
    onExportCSV: () => void;
    isProcessing: boolean;
}) {
    if (selectedOrders.length === 0) return null;

    // Calculate detailed totals by status
    const totals = selectedOrders.reduce(
        (acc, order) => {
            const value = order.valor || 0;
            acc.total += value;
            if (order.status_pagamento === 'pago') {
                acc.paidCount++;
                acc.paidTotal += value;
            } else if (order.status_pagamento === 'atrasado') {
                acc.overdueCount++;
                acc.overdueTotal += value;
            } else {
                acc.pendingCount++;
                acc.pendingTotal += value;
            }
            return acc;
        },
        { total: 0, paidCount: 0, paidTotal: 0, pendingCount: 0, pendingTotal: 0, overdueCount: 0, overdueTotal: 0 }
    );

    const unpaidCount = totals.pendingCount + totals.overdueCount;

    return (
        <div className="sticky top-0 z-10 p-4 rounded-2xl bg-primary-500/10 dark:bg-primary-500/20 border border-primary-500/30 backdrop-blur-sm animate-in slide-in-from-top-2 duration-200">
            {/* Top row: Count and totals */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <SquareCheck className="w-5 h-5 text-primary-500" />
                    <span className="font-bold text-lg text-primary-700 dark:text-primary-300">
                        {selectedOrders.length}
                    </span>
                    <span className="text-sm text-primary-600 dark:text-primary-400">
                        selecionado{selectedOrders.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-slate-400 mx-1">•</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(totals.total)}
                    </span>
                </div>

                {/* Status breakdown badges */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {totals.pendingCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            {totals.pendingCount} pendente{totals.pendingCount > 1 ? 's' : ''}:
                            <strong>{formatCurrency(totals.pendingTotal)}</strong>
                        </span>
                    )}
                    {totals.overdueCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {totals.overdueCount} atrasado{totals.overdueCount > 1 ? 's' : ''}:
                            <strong>{formatCurrency(totals.overdueTotal)}</strong>
                        </span>
                    )}
                    {totals.paidCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {totals.paidCount} pago{totals.paidCount > 1 ? 's' : ''}:
                            <strong>{formatCurrency(totals.paidTotal)}</strong>
                        </span>
                    )}
                </div>
            </div>

            {/* Bottom row: Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-primary-500/20">
                <button
                    onClick={onMarkAsPaid}
                    disabled={isProcessing || unpaidCount === 0}
                    className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium",
                        "bg-emerald-500 hover:bg-emerald-600 text-white",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "transition-colors"
                    )}
                >
                    {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <CreditCard className="w-4 h-4" />
                    )}
                    Marcar como Pago {unpaidCount > 0 && `(${unpaidCount})`}
                </button>

                <button
                    onClick={onExportCSV}
                    disabled={isProcessing}
                    className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium",
                        "bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20",
                        "text-slate-700 dark:text-slate-200 border border-white/40 dark:border-white/10",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "transition-colors"
                    )}
                >
                    <Download className="w-4 h-4" />
                    Exportar
                </button>

                <button
                    onClick={onClearSelection}
                    className="p-2 rounded-lg hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
                    title="Limpar seleção"
                >
                    <X className="w-4 h-4 text-slate-500" />
                </button>
            </div>
        </div>
    );
}

// Order Detail Drawer Component
function OrderDetailDrawer({
    order,
    onClose
}: {
    order: Order | null;
    onClose: () => void;
}) {
    if (!order) return null;

    const status = getEnhancedStatus(order);
    const StatusIcon = status.icon;
    const marketplaceBadge = getMarketplaceBadge(order.canal);
    const BadgeIcon = marketplaceBadge.icon;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-300">
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                            Pedido #{order.numero_pedido}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Status Card */}
                        <div className={cn(
                            "p-4 rounded-2xl",
                            status.bg
                        )}>
                            <div className="flex items-center gap-3">
                                <StatusIcon className={cn("w-8 h-8", status.iconColor)} />
                                <div>
                                    <p className={cn("text-lg font-semibold", status.text)}>
                                        {status.label}
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                        {formatCurrency(order.valor)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Details Grid */}
                        <div className="space-y-4">
                            <DetailRow
                                icon={User}
                                label="Cliente"
                                value={order.cliente || 'Consumidor Final'}
                            />
                            <DetailRow
                                icon={Hash}
                                label="ID Tiny"
                                value={String(order.tiny_id)}
                            />
                            <DetailRow
                                icon={Calendar}
                                label="Data do Pedido"
                                value={formatDate(order.data_pedido)}
                            />
                            <DetailRow
                                icon={Calendar}
                                label="Vencimento Estimado"
                                value={formatDate(order.vencimento_estimado)}
                            />
                            {order.data_pagamento && (
                                <DetailRow
                                    icon={CheckCircle2}
                                    label="Data de Pagamento"
                                    value={formatDate(order.data_pagamento)}
                                />
                            )}
                            <DetailRow
                                icon={BadgeIcon}
                                label="Canal"
                                value={order.canal}
                                badge={marketplaceBadge}
                            />
                        </div>

                        {/* Quick Actions */}
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
                                Ações Rápidas
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                    <ExternalLink className="w-4 h-4" />
                                    Ver no Tiny
                                </button>
                                <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                    <FileText className="w-4 h-4" />
                                    Ver NF-e
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

function DetailRow({
    icon: Icon,
    label,
    value,
    badge
}: {
    icon: any;
    label: string;
    value: string;
    badge?: { bg: string; text: string };
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                <Icon className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                {badge ? (
                    <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-sm font-medium mt-0.5",
                        badge.bg, badge.text
                    )}>
                        {value}
                    </span>
                ) : (
                    <p className="text-slate-900 dark:text-white font-medium truncate">{value}</p>
                )}
            </div>
        </div>
    );
}

export function ReceivablesTable({ orders = [], meta, loading }: ReceivablesTableProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isProcessing, setIsProcessing] = useState(false);
    const [detailOrder, setDetailOrder] = useState<Order | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // ⌘K or Ctrl+K: Focus search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
            // ⌘E or Ctrl+E: Export CSV (if items selected)
            if ((e.metaKey || e.ctrlKey) && e.key === 'e' && selectedIds.size > 0) {
                e.preventDefault();
                handleExportCSV();
            }
            // Escape: Close drawer or clear selection
            if (e.key === 'Escape') {
                if (detailOrder) {
                    setDetailOrder(null);
                } else if (selectedIds.size > 0) {
                    clearSelection();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIds.size, detailOrder]);

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

    // Selection handlers
    const toggleSelection = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        const pendingOrders = processedOrders.filter(o => o.status_pagamento !== 'pago');
        if (selectedIds.size === pendingOrders.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(pendingOrders.map(o => o.id)));
        }
    }, []);

    const clearSelection = () => setSelectedIds(new Set());

    const selectedOrders = useMemo(() => {
        return orders.filter(o => selectedIds.has(o.id));
    }, [orders, selectedIds]);

    // Action handlers
    const handleMarkAsPaid = async () => {
        setIsProcessing(true);
        try {
            const orderIds = Array.from(selectedIds);
            await markOrdersAsPaid(orderIds);
            clearSelection();
            router.refresh();
        } catch (error) {
            console.error('Error marking as paid:', error);
            alert('Erro ao marcar pedidos como pagos. Tente novamente.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleExportCSV = () => {
        const selectedOrders = orders.filter(o => selectedIds.has(o.id));
        const headers = ['Pedido', 'Data', 'Cliente', 'Canal', 'Valor', 'Status', 'Vencimento'];
        const rows = selectedOrders.map(o => [
            o.numero_pedido,
            formatDate(o.data_pedido),
            o.cliente || 'Consumidor Final',
            o.canal,
            o.valor,
            o.status_pagamento,
            formatDate(o.vencimento_estimado)
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `recebiveis_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.click();
    };

    // Debounce search term for performance
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    // Client-side filtering and sorting
    const processedOrders = useMemo(() => {
        let result = [...orders];

        // Filter by debounced search term
        if (debouncedSearchTerm.trim()) {
            const term = debouncedSearchTerm.toLowerCase();
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

                if (aVal === null || aVal === undefined) aVal = '';
                if (bVal === null || bVal === undefined) bVal = '';

                if (sortField === 'data_pedido' || sortField === 'vencimento_estimado') {
                    aVal = aVal ? new Date(aVal).getTime() : 0;
                    bVal = bVal ? new Date(bVal).getTime() : 0;
                }

                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                }

                const comparison = String(aVal).localeCompare(String(bVal), 'pt-BR');
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [orders, debouncedSearchTerm, sortField, sortDirection]);

    const pendingOrders = useMemo(() =>
        processedOrders.filter(o => o.status_pagamento !== 'pago'),
        [processedOrders]
    );

    const allPendingSelected = pendingOrders.length > 0 && selectedIds.size === pendingOrders.length;
    const somePendingSelected = selectedIds.size > 0 && selectedIds.size < pendingOrders.length;

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

            {/* Selection Action Bar */}
            <SelectionActionBar
                selectedOrders={selectedOrders}
                onClearSelection={clearSelection}
                onMarkAsPaid={handleMarkAsPaid}
                onExportCSV={handleExportCSV}
                isProcessing={isProcessing}
            />

            {/* Search Input */}
            <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Buscar por cliente, pedido ou canal... (⌘K)"
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
                                {/* Checkbox header */}
                                <th className="py-4 px-4 w-12">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="p-1 rounded hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
                                        title={allPendingSelected ? 'Desmarcar todos' : 'Selecionar todos pendentes'}
                                    >
                                        {allPendingSelected ? (
                                            <SquareCheck className="w-5 h-5 text-primary-500" />
                                        ) : somePendingSelected ? (
                                            <div className="relative">
                                                <Square className="w-5 h-5 text-slate-400" />
                                                <Minus className="w-3 h-3 text-primary-500 absolute top-1 left-1" />
                                            </div>
                                        ) : (
                                            <Square className="w-5 h-5 text-slate-400" />
                                        )}
                                    </button>
                                </th>
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
                                    <td colSpan={8} className="py-12 text-center text-slate-500">
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
                                    const isSelected = selectedIds.has(order.id);
                                    const isPaid = order.status_pagamento === 'pago';

                                    return (
                                        <tr
                                            key={order.id}
                                            onClick={() => setDetailOrder(order)}
                                            className={cn(
                                                "hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer group",
                                                order.status_pagamento === 'atrasado' && "bg-rose-50/50 dark:bg-rose-950/20",
                                                order.status_pagamento === 'pago' && "bg-emerald-50/30 dark:bg-emerald-950/10",
                                                isSelected && "bg-primary-50/50 dark:bg-primary-950/20 ring-1 ring-primary-500/30"
                                            )}
                                        >
                                            {/* Checkbox */}
                                            <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                                                {!isPaid && (
                                                    <button
                                                        onClick={() => toggleSelection(order.id)}
                                                        className="p-1 rounded hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
                                                    >
                                                        {isSelected ? (
                                                            <SquareCheck className="w-5 h-5 text-primary-500" />
                                                        ) : (
                                                            <Square className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
                                                        )}
                                                    </button>
                                                )}
                                            </td>
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

            {/* Order Detail Drawer */}
            <OrderDetailDrawer order={detailOrder} onClose={() => setDetailOrder(null)} />
        </div>
    );
}
