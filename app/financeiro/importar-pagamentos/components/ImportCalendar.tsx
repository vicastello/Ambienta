'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, X, ExternalLink, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ImportedDate {
    date: string; // YYYY-MM-DD format
    marketplace: 'shopee' | 'magalu' | 'mercado_livre';
    paymentsCount: number;
}

export interface PendingOrderDate {
    date: string; // YYYY-MM-DD format
    ordersCount: number;
    totalValue: number;
    isOverdue: boolean;
}

export interface PendingOrder {
    id: number;
    numero_pedido: string;
    numero_pedido_ecommerce: string;
    cliente_nome: string;
    valor: number;
    canal: string;
    data_criacao: string;
}

export interface ImportCalendarProps {
    /** Array of imported dates */
    importedDates: ImportedDate[];
    /** Array of pending order dates (optional - will fetch if not provided) */
    pendingOrderDates?: PendingOrderDate[];
    /** Additional class names */
    className?: string;
}

const MARKETPLACE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
    shopee: {
        bg: 'bg-orange-100 dark:bg-orange-500/20',
        border: 'border-orange-400',
        dot: 'bg-orange-500',
    },
    magalu: {
        bg: 'bg-blue-100 dark:bg-blue-500/20',
        border: 'border-blue-400',
        dot: 'bg-blue-500',
    },
    mercado_livre: {
        bg: 'bg-yellow-100 dark:bg-yellow-500/20',
        border: 'border-yellow-400',
        dot: 'bg-yellow-500',
    },
};

const MARKETPLACE_NAMES: Record<string, string> = {
    shopee: 'Shopee',
    magalu: 'Magalu',
    mercado_livre: 'ML',
};

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function ImportCalendar({
    importedDates,
    pendingOrderDates: externalPendingDates,
    className,
}: ImportCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [pendingDates, setPendingDates] = useState<PendingOrderDate[]>(externalPendingDates || []);
    const [loading, setLoading] = useState(false);

    // Modal state
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedOrders, setSelectedOrders] = useState<PendingOrder[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    // Fetch pending orders if not provided externally
    useEffect(() => {
        if (!externalPendingDates) {
            fetchPendingOrders();
        }
    }, [externalPendingDates, currentDate]);

    const fetchPendingOrders = async () => {
        setLoading(true);
        try {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

            const res = await fetch(`/api/financeiro/fluxo-caixa/calendar?dataInicio=${startDate}&dataFim=${endDate}`);
            const data = await res.json();

            if (data.pendingDates) {
                setPendingDates(data.pendingDates);
            }
        } catch (error) {
            console.error('Error fetching pending orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchOrdersForDate = async (date: string) => {
        setLoadingOrders(true);
        setSelectedDate(date);
        setSelectedOrders([]);
        try {
            const res = await fetch(`/api/financeiro/fluxo-caixa/calendar?date=${date}&includeOrders=true`);
            const data = await res.json();
            if (data.orders) {
                setSelectedOrders(data.orders);
            }
        } catch (error) {
            console.error('Error fetching orders for date:', error);
        } finally {
            setLoadingOrders(false);
        }
    };

    const closeModal = () => {
        setSelectedDate(null);
        setSelectedOrders([]);
        setSearchFilter('');
    };

    // Group imported dates by date string
    const importsByDate = useMemo(() => {
        const map = new Map<string, ImportedDate[]>();
        importedDates.forEach(item => {
            const dateStr = item.date.split('T')[0]; // Normalize to YYYY-MM-DD
            const existing = map.get(dateStr) || [];
            existing.push(item);
            map.set(dateStr, existing);
        });
        return map;
    }, [importedDates]);

    // Group pending orders by date
    const pendingByDate = useMemo(() => {
        const map = new Map<string, PendingOrderDate>();
        pendingDates.forEach(item => {
            const dateStr = item.date.split('T')[0];
            map.set(dateStr, item);
        });
        return map;
    }, [pendingDates]);

    // Get calendar grid for current month
    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startOffset = firstDay.getDay();
        const totalDays = lastDay.getDate();

        const days: Array<{ date: Date | null; dateStr: string | null }> = [];

        // Empty cells before first day
        for (let i = 0; i < startOffset; i++) {
            days.push({ date: null, dateStr: null });
        }

        // Days of month
        for (let day = 1; day <= totalDays; day++) {
            const date = new Date(year, month, day);
            const dateStr = date.toISOString().split('T')[0];
            days.push({ date, dateStr });
        }

        return days;
    }, [currentDate]);

    const goToPreviousMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    const isToday = (dateStr: string | null): boolean => {
        if (!dateStr) return false;
        return dateStr === new Date().toISOString().split('T')[0];
    };

    const formatBRL = (value: number) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const formatDateDisplay = (dateStr: string) => {
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    // Filter orders based on search
    const filteredOrders = useMemo(() => {
        if (!searchFilter) return selectedOrders;
        const search = searchFilter.toLowerCase();
        return selectedOrders.filter(o =>
            o.cliente_nome?.toLowerCase().includes(search) ||
            o.numero_pedido?.toString().includes(search) ||
            o.numero_pedido_ecommerce?.toLowerCase().includes(search) ||
            o.canal?.toLowerCase().includes(search)
        );
    }, [selectedOrders, searchFilter]);

    const handleDateClick = (dateStr: string | null, hasPending: boolean) => {
        if (!dateStr || !hasPending) return;
        fetchOrdersForDate(dateStr);
    };

    return (
        <>
            <div className={cn('glass-panel glass-tint rounded-2xl border border-white/40 dark:border-white/10 p-4', className)}>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-main">Calendário Financeiro</h3>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={goToPreviousMonth}
                            className="p-1 rounded-full hover:bg-white/50 dark:hover:bg-white/10 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4 text-muted" />
                        </button>
                        <button
                            type="button"
                            onClick={goToToday}
                            className="px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors"
                        >
                            Hoje
                        </button>
                        <button
                            type="button"
                            onClick={goToNextMonth}
                            className="p-1 rounded-full hover:bg-white/50 dark:hover:bg-white/10 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4 text-muted" />
                        </button>
                    </div>
                </div>

                {/* Month/Year display */}
                <div className="text-center mb-3">
                    <span className="text-sm font-medium text-main">
                        {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </span>
                </div>

                {/* Days of week header */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {DAYS_OF_WEEK.map(day => (
                        <div key={day} className="text-center text-xs font-medium text-muted py-1">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, index) => {
                        if (!day.date || !day.dateStr) {
                            return <div key={`empty-${index}`} className="h-12" />;
                        }

                        const imports = importsByDate.get(day.dateStr) || [];
                        const hasImports = imports.length > 0;
                        const marketplaces = [...new Set(imports.map(i => i.marketplace))];

                        const pending = pendingByDate.get(day.dateStr);
                        const hasPending = !!pending && pending.ordersCount > 0;
                        const isOverdue = pending?.isOverdue || false;

                        const tooltipParts: string[] = [];
                        if (hasImports) {
                            const total = imports.reduce((sum, i) => sum + i.paymentsCount, 0);
                            tooltipParts.push(`${marketplaces.map(m => MARKETPLACE_NAMES[m]).join(', ')}: ${total} importados`);
                        }
                        if (hasPending) {
                            tooltipParts.push(`${pending.ordersCount} pedidos pendentes (${formatBRL(pending.totalValue)}) - Clique para ver`);
                        }

                        return (
                            <div
                                key={day.dateStr}
                                onClick={() => handleDateClick(day.dateStr, hasPending)}
                                className={cn(
                                    'relative h-12 flex flex-col items-center justify-start pt-1 rounded-lg transition-colors',
                                    hasPending && 'cursor-pointer hover:ring-2 hover:ring-primary/50',
                                    isToday(day.dateStr) && 'ring-2 ring-primary ring-offset-1 dark:ring-offset-neutral-900',
                                    hasImports && 'bg-white/50 dark:bg-white/5',
                                    isOverdue && !hasImports && 'bg-red-50 dark:bg-red-900/20',
                                    hasPending && !isOverdue && !hasImports && 'bg-amber-50 dark:bg-amber-900/10'
                                )}
                                title={tooltipParts.join('\n')}
                            >
                                <span className={cn(
                                    'text-xs',
                                    isToday(day.dateStr) ? 'font-bold text-primary' : 'text-main',
                                    isOverdue && 'text-red-700 dark:text-red-400'
                                )}>
                                    {day.date.getDate()}
                                </span>

                                {/* Indicators row */}
                                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                                    {/* Marketplace import indicators */}
                                    {marketplaces.map(mp => (
                                        <div
                                            key={mp}
                                            className={cn(
                                                'w-1.5 h-1.5 rounded-full',
                                                MARKETPLACE_COLORS[mp]?.dot || 'bg-neutral-400'
                                            )}
                                        />
                                    ))}
                                </div>

                                {/* Pending/Overdue badge */}
                                {hasPending && (
                                    <div className={cn(
                                        'absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold',
                                        isOverdue
                                            ? 'bg-red-500 text-white'
                                            : 'bg-amber-500 text-white'
                                    )}>
                                        {pending.ordersCount > 9 ? '9+' : pending.ordersCount}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-4 pt-3 border-t border-white/20 dark:border-white/5">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-xs text-muted">Shopee</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-xs text-muted">Magalu</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        <span className="text-xs text-muted">ML</span>
                    </div>
                    <span className="border-l border-gray-300 dark:border-gray-600 h-3" />
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                            <Clock className="w-2.5 h-2.5 text-white" />
                        </div>
                        <span className="text-xs text-muted">Pendente</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                            <AlertTriangle className="w-2.5 h-2.5 text-white" />
                        </div>
                        <span className="text-xs text-muted">Atrasado</span>
                    </div>
                </div>

                {/* Summary stats */}
                {pendingDates.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/20 dark:border-white/5">
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="p-2 rounded-lg bg-amber-100/50 dark:bg-amber-900/20">
                                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Pendentes</p>
                                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                                    {pendingDates.filter(d => !d.isOverdue).reduce((sum, d) => sum + d.ordersCount, 0)} pedidos
                                </p>
                            </div>
                            <div className="p-2 rounded-lg bg-red-100/50 dark:bg-red-900/20">
                                <p className="text-xs text-red-700 dark:text-red-400 font-medium">Atrasados</p>
                                <p className="text-sm font-bold text-red-800 dark:text-red-300">
                                    {pendingDates.filter(d => d.isOverdue).reduce((sum, d) => sum + d.ordersCount, 0)} pedidos
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Orders Modal */}
            {selectedDate && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 dark:bg-black/60 backdrop-blur-sm"
                    onClick={closeModal}
                >
                    <div
                        className="glass-card glass-tint w-full max-w-2xl rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                            <div>
                                <h3 className="text-lg font-bold text-main">Pedidos Pendentes</h3>
                                <p className="text-sm text-muted">{formatDateDisplay(selectedDate)}</p>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5 text-muted" />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="px-6 py-3 border-b border-white/10">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                <input
                                    type="text"
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                    placeholder="Buscar por cliente, pedido..."
                                    className="app-input w-full pl-9 py-2"
                                />
                            </div>
                        </div>

                        {/* Orders List */}
                        <div className="max-h-80 overflow-y-auto">
                            {loadingOrders ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                                </div>
                            ) : filteredOrders.length === 0 ? (
                                <div className="py-12 text-center text-muted">
                                    {selectedOrders.length === 0
                                        ? 'Nenhum pedido encontrado para esta data'
                                        : 'Nenhum pedido corresponde à busca'
                                    }
                                </div>
                            ) : (
                                <div className="divide-y divide-white/10">
                                    {filteredOrders.map(order => (
                                        <div
                                            key={order.id}
                                            className="px-6 py-3 hover:bg-white/5 transition-colors"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-sm font-medium text-main">
                                                            #{order.numero_pedido}
                                                        </span>
                                                        {order.numero_pedido_ecommerce && (
                                                            <span className="text-xs text-muted px-1.5 py-0.5 rounded bg-white/10">
                                                                {order.numero_pedido_ecommerce}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted truncate">
                                                        {order.cliente_nome}
                                                    </p>
                                                    <p className="text-xs text-muted mt-0.5">
                                                        {order.canal}
                                                    </p>
                                                </div>
                                                <div className="text-right ml-4">
                                                    <p className="font-semibold text-main">
                                                        {formatBRL(order.valor)}
                                                    </p>
                                                    <a
                                                        href={`/financeiro/fluxo-caixa?busca=${order.numero_pedido}`}
                                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                                                    >
                                                        Ver detalhes
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-3 border-t border-white/10 bg-white/5">
                            <p className="text-xs text-muted text-center">
                                {selectedOrders.length} pedido(s) • Total: {formatBRL(selectedOrders.reduce((sum, o) => sum + o.valor, 0))}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default ImportCalendar;
