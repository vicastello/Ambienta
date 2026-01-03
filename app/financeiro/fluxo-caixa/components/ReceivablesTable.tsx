'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { format, differenceInDays, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    ChevronLeft, ChevronRight, Loader2, Search, X,
    ShoppingBag, Package, Store, ArrowUpDown, ArrowUp, ArrowDown,
    CheckCircle2, Clock, AlertTriangle, XCircle, Bell,
    Check, Download, CreditCard, Circle, Minus,
    ExternalLink, Calendar, User, Hash, MapPin, FileText, Edit2, Tag, Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTagColor, formatTagName } from '@/lib/tagColors';
import { markOrdersAsPaid, markOrdersAsUnpaid } from '@/app/financeiro/actions';
import { EntryEditModal } from './EntryEditModal';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/Dialog';
import FeeBreakdownCard from './FeeBreakdownCard';
import TagModal from './TagModal';

interface Order {
    id: number;
    tiny_id: number;
    numero_pedido: number;
    numero_pedido_ecommerce?: string;
    cliente: string;
    valor: number;
    valor_original?: number;
    valor_total_pedido: number;
    data_pedido: string;
    vencimento_estimado: string | null;
    status_pagamento: 'pago' | 'pendente' | 'atrasado';
    data_pagamento: string | null;
    canal: string;
    marketplace_info: any;
    valor_esperado?: number;
    diferenca?: number;
    fees_breakdown?: any;
    payments_breakdown?: any[];
    fee_overrides?: {
        commissionFee?: number;
        fixedCost?: number;
        campaignFee?: number;
        shippingFee?: number;
        otherFees?: number;
        notes?: string;
        usesFreeShipping?: boolean;
    };
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

const formatCurrency = (value: number | null | undefined) => {
    return (value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
        // If it's a date-only string (YYYY-MM-DD), parse it without timezone shift
        // new Date("2025-12-18") is interpreted as UTC, but we want local date
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const [year, month, day] = dateStr.split('-').map(Number);
            // Create date with local timezone by specifying year, month-1, day
            return format(new Date(year, month - 1, day), 'dd/MM/yyyy', { locale: ptBR });
        }
        // For full ISO strings or other formats, parse normally
        return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch (e) {
        return dateStr;
    }
};

const getAutoTags = (order: Order) => {
    const tags: string[] = [];
    const shopeeData = order.fees_breakdown?.shopeeData;
    const refundAmount = Number(shopeeData?.refundAmount ?? order.fees_breakdown?.refundAmount ?? 0);
    if (refundAmount > 0) tags.push('devolucao');
    const freightDiscount = Number(shopeeData?.freightDiscount ?? 0);
    if (freightDiscount > 0) tags.push('frete descontado');
    return tags;
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
        <div className="sticky top-0 z-10 p-4 rounded-2xl glass-panel glass-tint border border-primary-500/20 backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
            {/* Top row: Count and totals */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary-500" />
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
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/20 dark:border-white/10">
                <button
                    onClick={onMarkAsPaid}
                    disabled={isProcessing || unpaidCount === 0}
                    className="app-btn-success inline-flex items-center gap-2"
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
    onClose,
    onMarkAsPaid
}: {
    order: Order | null;
    onClose: () => void;
    onMarkAsPaid: (order: Order) => void;
}) {
    if (!order) return null;

    const status = getEnhancedStatus(order);
    const StatusIcon = status.icon;
    const marketplaceBadge = getMarketplaceBadge(order.canal);
    const BadgeIcon = marketplaceBadge.icon;

    const [isEditingFees, setIsEditingFees] = useState(false);
    const [overrides, setOverrides] = useState(order.fee_overrides || {});
    const [isSavingFees, setIsSavingFees] = useState(false);

    const feesBreakdown = order.fees_breakdown;

    const handleSaveManualFees = async () => {
        setIsSavingFees(true);
        try {
            // Calculate new expected values locally to update UI immediately
            const commission = overrides.commissionFee !== undefined ? Number(overrides.commissionFee) : (feesBreakdown?.commissionFee || 0);
            const fixed = overrides.fixedCost !== undefined ? Number(overrides.fixedCost) : (feesBreakdown?.fixedCost || 0);
            const campaign = overrides.campaignFee !== undefined ? Number(overrides.campaignFee) : (feesBreakdown?.campaignFee || 0);

            const total = commission + fixed + campaign;
            const gross = feesBreakdown?.grossValue || order.valor;
            const newValorEsperado = gross - total;
            const newDiferenca = order.valor - newValorEsperado;

            const res = await fetch(`/api/financeiro/pedidos/${order.id}/fees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fee_overrides: {
                        ...overrides,
                        usesFreeShipping: overrides.usesFreeShipping
                    },
                    valor_esperado: newValorEsperado,
                    diferenca: newDiferenca
                })
            });

            if (!res.ok) throw new Error('Failed to save fees');

            // Update local order object
            order.fee_overrides = overrides;
            order.valor_esperado = newValorEsperado;
            order.diferenca = newDiferenca;

            setIsEditingFees(false);
        } catch (error) {
            console.error('Error saving manual fees:', error);
            alert('Erro ao salvar ajustes de taxas.');
        } finally {
            setIsSavingFees(false);
        }
    };

    // Construct Tiny URL (approximate based on standard Tiny routes)
    const tinyUrl = `https://erp.olist.com/vendas#edit/${order.tiny_id}`;
    // Construct or extract NF Link if available
    const nfLink = order.marketplace_info?.nfe_link || order.marketplace_info?.link_nfe;

    return (
        <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-7xl w-full p-0 gap-0 rounded-[32px] glass-panel glass-tint border border-white/10 shadow-2xl overflow-hidden !bg-white/90 dark:!bg-slate-900/90">
                <div className="h-full flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 border-b border-white/10 flex-shrink-0">
                        <DialogTitle className="text-xl font-bold text-main flex items-center gap-3">
                            <span className="opacity-50 font-normal">Pedido</span> #{order.numero_pedido}
                            <span className="text-xs font-medium text-muted bg-white/10 px-2 py-0.5 rounded-full border border-white/5">
                                {formatDate(order.data_pedido)}
                            </span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                            {/* Left Column: Details (5 cols) */}
                            <div className="xl:col-span-5 space-y-6">
                                {/* Status Card */}
                                <div className={cn(
                                    "p-5 rounded-2xl border border-white/5 relative overflow-hidden",
                                    status.bg.replace('bg-', 'bg-opacity-10 bg-')
                                )}>
                                    <div className="relative z-10 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <StatusIcon className={cn("w-6 h-6", status.iconColor)} />
                                            <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/20", status.text)}>
                                                {status.label}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted font-medium uppercase tracking-wider">Valor Total</p>
                                            <p className="text-2xl font-bold text-main tracking-tight">
                                                {formatCurrency(order.valor)}
                                            </p>
                                        </div>
                                    </div>
                                </div>


                                {/* Details Grid - Now wrapped in the requested inner card style */}
                                <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/5 p-5 shadow-sm space-y-2">

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
                                    {order.numero_pedido_ecommerce && (
                                        <DetailRow
                                            icon={Tag}
                                            label="ID Marketplace"
                                            value={order.numero_pedido_ecommerce}
                                        />
                                    )}
                                    <DetailRow
                                        icon={Calendar}
                                        label="Vencimento"
                                        value={formatDate(order.vencimento_estimado)}
                                    />
                                    {order.data_pagamento && (
                                        <DetailRow
                                            icon={CheckCircle2}
                                            label="Pago em"
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
                                <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/5 p-5 shadow-sm">
                                    <h3 className="text-sm font-semibold text-soft uppercase tracking-wider mb-4 px-2">
                                        Ações
                                    </h3>
                                    <div className="grid gap-3">
                                        <button
                                            onClick={() => onMarkAsPaid(order)}
                                            disabled={order.status_pagamento === 'pago'}
                                            className={cn(
                                                "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold transition-all shadow-lg",
                                                order.status_pagamento === 'pago'
                                                    ? "bg-emerald-500/10 text-emerald-500 cursor-default"
                                                    : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20"
                                            )}
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            {order.status_pagamento === 'pago' ? 'Pedido Pago' : 'Marcar como Pago'}
                                        </button>

                                        <div className="grid grid-cols-2 gap-3">
                                            <a
                                                href={tinyUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 transition-colors font-medium border border-indigo-500/20"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                Tiny
                                            </a>

                                            {(() => {
                                                const getMarketplaceUrl = () => {
                                                    const canal = order.canal?.toLowerCase() || '';
                                                    const ecommerceId = order.numero_pedido_ecommerce;

                                                    if (!ecommerceId) return null;

                                                    if (canal.includes('shopee')) {
                                                        // Tenta usar parâmetros de busca conhecidos
                                                        // O portal novo da Shopee costuma usar 'search' ou 'keyword' na URL da listagem
                                                        // Ex: https://seller.shopee.com.br/portal/sale/order?type=all&search=TYPE_ORDER_SN%2CID_DO_PEDIDO

                                                        // Format found by reverse engineering standard behaviors:
                                                        // type=all -> search all tabs
                                                        // search=TYPE_ORDER_SN,ORDER_ID -> specific syntax for searching by SN
                                                        return `https://seller.shopee.com.br/portal/sale/order?type=all&search=TYPE_ORDER_SN%2C${ecommerceId}`;
                                                    } else if (canal.includes('mercado') || canal.includes('meli')) {
                                                        // Mercado Livre uses the numeric ID directly in the URL
                                                        return `https://www.mercadolivre.com.br/vendas/${ecommerceId}/detalhe`;
                                                    }

                                                    return null;
                                                };

                                                const marketplaceUrl = getMarketplaceUrl();

                                                if (marketplaceUrl) {
                                                    return (
                                                        <a
                                                            href={marketplaceUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 transition-colors font-medium border border-indigo-500/20"
                                                        >
                                                            <ShoppingBag className="w-4 h-4" />
                                                            Ver no Canal
                                                        </a>
                                                    );
                                                }

                                                return (
                                                    <button disabled className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm bg-white/5 text-muted cursor-not-allowed border border-white/5 opacity-50">
                                                        <ShoppingBag className="w-4 h-4" />
                                                        Sem Link
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Fees (7 cols) */}
                            <div className="xl:col-span-7">
                                {(feesBreakdown || isEditingFees) ? (
                                    // FeeBreakdownCard with wrapper
                                    <div className="h-full rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/5 p-5 shadow-sm">
                                        <FeeBreakdownCard
                                            breakdown={feesBreakdown}
                                            marketplace={order.canal?.toLowerCase() || 'other'}
                                            isEditing={isEditingFees}
                                            overrides={overrides}
                                            onOverrideChange={(field, value) => setOverrides(prev => ({ ...prev, [field]: value }))}
                                            onSave={handleSaveManualFees}
                                            onToggleEdit={() => setIsEditingFees(!isEditingFees)}
                                            paymentsBreakdown={order.payments_breakdown}
                                            valorFinal={order.valor}
                                        />
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center p-12 text-center rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/5">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                            <CreditCard className="w-8 h-8 text-muted" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-main mb-2">Sem dados financeiros</h3>
                                        <p className="text-muted max-w-xs mx-auto mb-6">Não encontramos o detalhamento de taxas para este pedido.</p>
                                        <button
                                            onClick={() => setIsEditingFees(true)}
                                            className="px-6 py-2.5 rounded-full bg-accent text-white font-medium hover:brightness-110 transition-all shadow-lg shadow-accent/20"
                                        >
                                            Adicionar manualmente
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent >
        </Dialog >
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
    badge?: { bg: string; text: string; icon?: any; label?: string }
}) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 group">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors text-muted">
                    <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-muted">{label}</span>
            </div>

            <div className="text-right">
                {badge ? (
                    <span className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold",
                        badge.bg, badge.text
                    )}>
                        {value}
                    </span>
                ) : (
                    <p className="text-sm font-semibold text-main">{value}</p>
                )}
            </div>
        </div>
    );
}

export function ReceivablesTable({ orders = [], meta, loading }: ReceivablesTableProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isProcessing, setIsProcessing] = useState(false);
    const [detailOrder, setDetailOrder] = useState<Order | null>(null);
    const [editOrderId, setEditOrderId] = useState<string | null>(null);

    // Tags state - persisted to database
    const [orderTags, setOrderTags] = useState<Map<number, string[]>>(new Map());
    const [availableTags, setAvailableTags] = useState<{ name: string; color: string }[]>([]);
    const [tagModalOrderId, setTagModalOrderId] = useState<number | null>(null);
    const [newTagValue, setNewTagValue] = useState('');
    const [loadingTags, setLoadingTags] = useState(false);

    // Fetch available tags on mount
    useEffect(() => {
        const fetchAvailableTags = async () => {
            try {
                const res = await fetch('/api/financeiro/tags');
                const data = await res.json();
                setAvailableTags(data.tags || []);
            } catch (error) {
                console.error('Error fetching available tags:', error);
            }
        };
        fetchAvailableTags();
    }, []);

    // Fetch tags for current orders when orders change
    useEffect(() => {
        const fetchOrderTags = async () => {
            if (orders.length === 0) return;
            setLoadingTags(true);
            try {
                const newMap = new Map<number, string[]>();
                // Fetch tags for all orders in parallel
                await Promise.all(orders.slice(0, 50).map(async (order) => {
                    const res = await fetch(`/api/financeiro/tags?orderId=${order.id}`);
                    const data = await res.json();
                    if (data.tags?.length) {
                        newMap.set(order.id, data.tags);
                    }
                }));
                setOrderTags(newMap);
            } catch (error) {
                console.error('Error fetching order tags:', error);
            } finally {
                setLoadingTags(false);
            }
        };
        fetchOrderTags();
    }, [orders]);

    const addTagToOrder = async (orderId: number, tag: string) => {
        const trimmed = tag.trim();
        if (!trimmed) return;

        // Optimistic update
        setOrderTags(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(orderId) || [];
            if (!existing.includes(trimmed)) {
                newMap.set(orderId, [...existing, trimmed]);
            }
            return newMap;
        });
        setNewTagValue('');

        // Persist to API
        try {
            await fetch('/api/financeiro/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, tagName: trimmed })
            });
            // Refresh available tags
            const res = await fetch('/api/financeiro/tags');
            const data = await res.json();
            setAvailableTags(data.tags || []);
        } catch (error) {
            console.error('Error adding tag:', error);
        }
    };

    const removeTagFromOrder = async (orderId: number, tag: string) => {
        // Optimistic update
        setOrderTags(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(orderId) || [];
            newMap.set(orderId, existing.filter(t => t !== tag));
            return newMap;
        });

        // Persist to API
        try {
            await fetch(`/api/financeiro/tags?orderId=${orderId}&tagName=${encodeURIComponent(tag)}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('Error removing tag:', error);
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
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

    // Client-side filtering and sorting
    const processedOrders = useMemo(() => {
        let result = [...orders];

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
    }, [orders, sortField, sortDirection]);

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
                                            <CheckCircle2 className="w-4 h-4 text-primary-500" />
                                        ) : somePendingSelected ? (
                                            <div className="relative">
                                                <Circle className="w-4 h-4 text-slate-400" />
                                                <Minus className="w-2.5 h-2.5 text-primary-500 absolute top-[3px] left-[3px]" />
                                            </div>
                                        ) : (
                                            <Circle className="w-4 h-4 text-slate-400" />
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
                                    label="Vlr. Pedido"
                                    field="valor"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="right"
                                />
                                <th className="py-4 px-4 text-right font-semibold text-slate-600 dark:text-slate-300 text-xs">Vlr. Esperado</th>
                                <th className="py-4 px-4 text-right font-semibold text-slate-600 dark:text-slate-300 text-xs">Vlr. Recebido</th>
                                <th className="py-4 px-4 text-right font-semibold text-slate-600 dark:text-slate-300 text-xs">Diferença</th>
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
                                <th className="py-4 px-6 font-semibold text-slate-600 dark:text-slate-300">
                                    <Tag className="w-4 h-4 inline mr-1" />
                                    Tags
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 dark:divide-white/5">
                            {processedOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Search className="w-8 h-8 text-slate-300" />
                                            <p>Nenhum pedido encontrado com os filtros atuais.</p>
                                        </div>
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
                                                isSelected && "bg-gradient-to-r from-primary-100/60 via-primary-50/40 to-transparent dark:from-primary-900/30 dark:via-primary-950/20 dark:to-transparent"
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
                                                            <CheckCircle2 className="w-4 h-4 text-primary-500" />
                                                        ) : (
                                                            <Circle className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
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
                                            <td className="py-4 px-6 text-right font-medium text-slate-600 dark:text-slate-400 text-xs">
                                                {/* @ts-ignore - valor_original exists but type not updated */}
                                                {formatCurrency(order.valor_original || order.valor)}
                                            </td>
                                            <td className="py-4 px-4 text-right font-medium text-slate-600 dark:text-slate-400 text-xs">
                                                {order.valor_esperado !== undefined && order.valor_esperado !== null
                                                    ? formatCurrency(order.valor_esperado)
                                                    : '-'}
                                            </td>
                                            <td className="py-4 px-4 text-right font-bold text-slate-700 dark:text-slate-200">
                                                {formatCurrency(order.valor)}
                                            </td>
                                            <td className="py-4 px-4 text-right text-xs">
                                                {order.diferenca !== undefined ? (
                                                    <span className={cn(
                                                        "font-semibold",
                                                        order.diferenca >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        {formatCurrency(order.diferenca)}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={cn(
                                                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer",
                                                                "hover:ring-2 hover:ring-primary-500/30 transition-all",
                                                                status.bg, status.text
                                                            )}
                                                        >
                                                            <StatusIcon className={cn("w-3.5 h-3.5", status.iconColor)} />
                                                            {status.label}
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="center" className="min-w-[160px]">
                                                        {order.status_pagamento !== 'pago' && (
                                                            <DropdownMenuItem
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    await markOrdersAsPaid([order.id]);
                                                                    router.refresh();
                                                                }}
                                                                className="flex items-center gap-2 text-emerald-600"
                                                            >
                                                                <CheckCircle2 className="w-4 h-4" />
                                                                Marcar como Pago
                                                            </DropdownMenuItem>
                                                        )}
                                                        {order.status_pagamento === 'pago' && (
                                                            <DropdownMenuItem
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    await markOrdersAsUnpaid([order.id]);
                                                                    router.refresh();
                                                                }}
                                                                className="flex items-center gap-2 text-amber-600"
                                                            >
                                                                <Clock className="w-4 h-4" />
                                                                Marcar como Pendente
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                            <td className="py-4 px-6 text-right text-slate-500 text-xs">
                                                {order.status_pagamento === 'pago'
                                                    ? formatDate(order.data_pagamento)
                                                    : formatDate(order.vencimento_estimado)
                                                }
                                            </td>
                                            {/* Tags Cell */}
                                            <td className="py-4 px-6">
                                                <div className="flex flex-wrap gap-1 items-center max-w-[180px]">
                                                    {/* Import tags from payments_breakdown */}
                                                    {(() => {
                                                        const importTags = new Set<string>();
                                                        const tagMeta = new Map<string, string>();
                                                        order.payments_breakdown?.forEach((p: any) => {
                                                            if (p.tags && Array.isArray(p.tags)) {
                                                                p.tags.forEach((t: string) => {
                                                                    importTags.add(t);
                                                                    tagMeta.set(t, 'Tag do extrato');
                                                                });
                                                            }
                                                        });
                                                        getAutoTags(order).forEach((t) => {
                                                            if (!importTags.has(t)) {
                                                                tagMeta.set(t, 'Tag automática');
                                                            }
                                                            importTags.add(t);
                                                        });
                                                        return Array.from(importTags).map((tag, idx) => {
                                                            const colors = getTagColor(tag);
                                                            return (
                                                                <span
                                                                    key={`import-${idx}`}
                                                                    className={cn(
                                                                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                                                                        colors.bg, colors.text
                                                                    )}
                                                                    title={tagMeta.get(tag) || 'Tag do extrato'}
                                                                >
                                                                    {formatTagName(tag)}
                                                                </span>
                                                            );
                                                        });
                                                    })()}
                                                    {/* Manual tags */}
                                                    {(orderTags.get(order.id) || []).map((tag, idx) => {
                                                        const colors = getTagColor(tag);
                                                        return (
                                                            <span
                                                                key={idx}
                                                                className={cn(
                                                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                                                                    colors.bg, colors.text
                                                                )}
                                                            >
                                                                {formatTagName(tag)}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        removeTagFromOrder(order.id, tag);
                                                                    }}
                                                                    className="hover:opacity-70 rounded-full p-0.5"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </span>
                                                        );
                                                    })}
                                                    {/* Button to open tag modal */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setTagModalOrderId(order.id);
                                                        }}
                                                        className="p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary-500 transition-colors"
                                                        title="Gerenciar tags"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        <tfoot className="bg-white/50 dark:bg-black/20 border-t border-white/20 dark:border-white/10 font-bold text-slate-700 dark:text-slate-200">
                            <tr>
                                <td colSpan={5} className="py-4 px-6 text-right">Total</td>
                                <td className="py-4 px-6 text-right text-xs">
                                    {formatCurrency(processedOrders.reduce((acc, o) => acc + (o.valor_original || o.valor || 0), 0))}
                                </td>
                                <td className="py-4 px-4 text-right text-xs">
                                    {formatCurrency(processedOrders.reduce((acc, o) => acc + (o.valor_esperado || 0), 0))}
                                </td>
                                <td className="py-4 px-4 text-right">
                                    {formatCurrency(processedOrders.reduce((acc, o) => acc + (o.valor || 0), 0))}
                                </td>
                                <td className="py-4 px-4 text-right text-xs">
                                    {(() => {
                                        const totalDiff = processedOrders.reduce((acc, o) => acc + (o.diferenca || 0), 0);
                                        return (
                                            <span className={cn(
                                                totalDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                            )}>
                                                {formatCurrency(totalDiff)}
                                            </span>
                                        );
                                    })()}
                                </td>
                                <td colSpan={3}></td>
                            </tr>
                        </tfoot>
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
            <OrderDetailDrawer
                order={detailOrder}
                onClose={() => setDetailOrder(null)}
                onMarkAsPaid={async (order) => {
                    setIsProcessing(true);
                    try {
                        await markOrdersAsPaid([order.id]);
                        setDetailOrder(null);
                        router.refresh();
                    } catch (error) {
                        console.error('Error marking as paid:', error);
                        alert('Erro ao marcar pedido como pago.');
                    } finally {
                        setIsProcessing(false);
                    }
                }}
            />

            {/* Tag Modal */}
            <TagModal
                isOpen={tagModalOrderId !== null}
                onClose={() => setTagModalOrderId(null)}
                orderId={tagModalOrderId ?? 0}
                currentTags={(() => {
                    if (!tagModalOrderId) return [];
                    // Combine manual tags with import tags
                    const manualTags = orderTags.get(tagModalOrderId) || [];
                    const order = orders.find(o => o.id === tagModalOrderId);
                    const importTags = new Set<string>();
                    order?.payments_breakdown?.forEach((p: any) => {
                        if (p.tags && Array.isArray(p.tags)) {
                            p.tags.forEach((t: string) => importTags.add(t));
                        }
                    });
                    const autoTags = order ? getAutoTags(order) : [];
                    return [...new Set([...manualTags, ...importTags, ...autoTags])];
                })()}
                availableTags={availableTags}
                onAddTag={addTagToOrder}
                onRemoveTag={removeTagFromOrder}
            />
        </div>
    );
}
