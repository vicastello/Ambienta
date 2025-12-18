'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { differenceInDays, isToday, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Order = {
    id: number;
    valor: number;
    cliente: string | null;
    vencimento_estimado: string | null;
    status_pagamento: 'pago' | 'pendente' | 'atrasado';
};

const NOTIFICATION_STORAGE_KEY = 'fluxocaixa:lastNotification';
const NOTIFICATION_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

type NotificationSummary = {
    overdueCount: number;
    overdueTotal: number;
    dueTodayCount: number;
    dueTodayTotal: number;
    dueThisWeekCount: number;
};

function analyzeOrders(orders: Order[]): NotificationSummary {
    const now = new Date();
    let overdueCount = 0;
    let overdueTotal = 0;
    let dueTodayCount = 0;
    let dueTodayTotal = 0;
    let dueThisWeekCount = 0;

    for (const order of orders) {
        if (order.status_pagamento === 'pago') continue;

        if (order.status_pagamento === 'atrasado') {
            overdueCount++;
            overdueTotal += order.valor || 0;
            continue;
        }

        if (!order.vencimento_estimado) continue;

        try {
            const dueDate = parseISO(order.vencimento_estimado);
            const daysUntilDue = differenceInDays(dueDate, now);

            if (isToday(dueDate)) {
                dueTodayCount++;
                dueTodayTotal += order.valor || 0;
            } else if (daysUntilDue > 0 && daysUntilDue <= 7) {
                dueThisWeekCount++;
            }
        } catch {
            // Invalid date, skip
        }
    }

    return {
        overdueCount,
        overdueTotal,
        dueTodayCount,
        dueTodayTotal,
        dueThisWeekCount,
    };
}

function shouldShowNotification(): boolean {
    if (typeof window === 'undefined') return false;

    try {
        const lastNotification = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
        if (!lastNotification) return true;

        const lastTime = parseInt(lastNotification, 10);
        return Date.now() - lastTime > NOTIFICATION_COOLDOWN_MS;
    } catch {
        return true;
    }
}

function markNotificationShown(): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(NOTIFICATION_STORAGE_KEY, Date.now().toString());
    } catch {
        // Ignore storage errors
    }
}

function formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

/**
 * Hook that shows toast notifications for overdue and due-today orders
 * Has a 4-hour cooldown to avoid spamming the user
 */
export function useOverdueNotifications(orders: Order[], loading: boolean) {
    const hasShownRef = useRef(false);

    useEffect(() => {
        // Don't show while loading or if already shown this session
        if (loading || hasShownRef.current) return;

        // Don't show if no orders
        if (!orders || orders.length === 0) return;

        // Check cooldown
        if (!shouldShowNotification()) return;

        const summary = analyzeOrders(orders);

        // Show notifications based on severity
        if (summary.overdueCount > 0) {
            toast.error(
                `⚠️ ${summary.overdueCount} pedido${summary.overdueCount > 1 ? 's' : ''} atrasado${summary.overdueCount > 1 ? 's' : ''}`,
                {
                    description: `Total em atraso: ${formatCurrency(summary.overdueTotal)}`,
                    duration: 8000,
                    action: {
                        label: 'Ver',
                        onClick: () => {
                            // Scroll to table or filter by overdue
                            const tableEl = document.querySelector('[data-component="receivables-table"]');
                            tableEl?.scrollIntoView({ behavior: 'smooth' });
                        },
                    },
                }
            );
        }

        if (summary.dueTodayCount > 0) {
            toast.warning(
                `⏰ ${summary.dueTodayCount} pedido${summary.dueTodayCount > 1 ? 's' : ''} vence${summary.dueTodayCount > 1 ? 'm' : ''} hoje`,
                {
                    description: `Total: ${formatCurrency(summary.dueTodayTotal)}`,
                    duration: 6000,
                }
            );
        }

        if (summary.dueThisWeekCount > 0 && summary.overdueCount === 0 && summary.dueTodayCount === 0) {
            toast.info(
                `📅 ${summary.dueThisWeekCount} pedido${summary.dueThisWeekCount > 1 ? 's' : ''} vence${summary.dueThisWeekCount > 1 ? 'm' : ''} esta semana`,
                {
                    duration: 5000,
                }
            );
        }

        // Mark as shown
        hasShownRef.current = true;
        markNotificationShown();
    }, [orders, loading]);
}

/**
 * Reset notification cooldown (useful for testing or manual trigger)
 */
export function resetNotificationCooldown(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
    } catch {
        // Ignore
    }
}
