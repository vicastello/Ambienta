'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check, X, AlertCircle, Clock, TrendingDown, CreditCard, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Alert = {
    id: string;
    alert_type: string;
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    is_read: boolean;
    is_dismissed: boolean;
    created_at: string;
    related_entries?: string[];
    related_orders?: number[];
};

const ALERT_ICONS: Record<string, any> = {
    overdue: AlertCircle,
    upcoming: Clock,
    low_balance: TrendingDown,
    large_expense: CreditCard,
    default: Bell,
};

const SEVERITY_COLORS: Record<string, string> = {
    info: 'bg-blue-500',
    warning: 'bg-amber-500',
    critical: 'bg-rose-500',
};

export function AlertBell() {
    const [open, setOpen] = useState(false);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchAlerts = useCallback(async () => {
        try {
            const res = await fetch('/api/financeiro/alerts?type=history&limit=20');
            const data = await res.json();
            setAlerts(data.alerts || []);
            setUnreadCount(data.unreadCount || 0);
        } catch (err) {
            console.error('Error fetching alerts:', err);
        }
    }, []);

    // Fetch on mount and periodically
    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 60000); // Every minute
        return () => clearInterval(interval);
    }, [fetchAlerts]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAsRead = async (alertIds: string[]) => {
        try {
            await fetch('/api/financeiro/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_read', alertIds }),
            });
            setAlerts(prev => prev.map(a =>
                alertIds.includes(a.id) ? { ...a, is_read: true } : a
            ));
            setUnreadCount(prev => Math.max(0, prev - alertIds.length));
        } catch (err) {
            console.error('Error marking as read:', err);
        }
    };

    const dismissAlert = async (alertId: string) => {
        try {
            await fetch('/api/financeiro/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dismiss', alertIds: [alertId] }),
            });
            setAlerts(prev => prev.filter(a => a.id !== alertId));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Error dismissing:', err);
        }
    };

    const markAllAsRead = async () => {
        const unreadIds = alerts.filter(a => !a.is_read).map(a => a.id);
        if (unreadIds.length) {
            await markAsRead(unreadIds);
        }
    };

    const visibleAlerts = alerts.filter(a => !a.is_dismissed);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setOpen(!open)}
                className={cn(
                    "relative p-2 rounded-xl transition-all",
                    open
                        ? "bg-primary-100 dark:bg-primary-900/30 text-primary-600"
                        : "hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400"
                )}
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white bg-rose-500 rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-50">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="font-semibold">Notificações</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs text-primary-500 hover:text-primary-600 font-medium"
                            >
                                Marcar todas como lidas
                            </button>
                        )}
                    </div>

                    {/* Alert List */}
                    <div className="max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                            </div>
                        ) : visibleAlerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                                <Bell className="w-8 h-8 mb-2 opacity-50" />
                                <p className="text-sm">Nenhuma notificação</p>
                            </div>
                        ) : (
                            visibleAlerts.map((alert) => {
                                const Icon = ALERT_ICONS[alert.alert_type] || ALERT_ICONS.default;
                                return (
                                    <div
                                        key={alert.id}
                                        className={cn(
                                            "flex gap-3 p-4 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors",
                                            !alert.is_read && "bg-primary-50/50 dark:bg-primary-950/20"
                                        )}
                                    >
                                        {/* Icon */}
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                                            SEVERITY_COLORS[alert.severity] || 'bg-slate-500'
                                        )}>
                                            <Icon className="w-4 h-4 text-white" />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                {alert.title}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                {alert.message}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                {formatDistanceToNow(new Date(alert.created_at), {
                                                    addSuffix: true,
                                                    locale: ptBR
                                                })}
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex flex-col gap-1">
                                            {!alert.is_read && (
                                                <button
                                                    onClick={() => markAsRead([alert.id])}
                                                    className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded transition-colors"
                                                    title="Marcar como lida"
                                                >
                                                    <Check className="w-3.5 h-3.5 text-slate-400" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => dismissAlert(alert.id)}
                                                className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded transition-colors"
                                                title="Dispensar"
                                            >
                                                <X className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    {visibleAlerts.length > 0 && (
                        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <button
                                onClick={() => {
                                    setOpen(false);
                                    // Could navigate to alerts page
                                }}
                                className="text-xs text-slate-500 hover:text-primary-500 font-medium w-full text-center"
                            >
                                Ver configurações de alertas
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
