// API route for financial analytics and dashboard data
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Cast to any for new columns until types are synced
const db = supabaseAdmin as any;

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate') || getMonthStart();
        const endDate = searchParams.get('endDate') || getMonthEnd();
        const period = searchParams.get('period') || 'monthly'; // daily, weekly, monthly

        // Fetch all cash flow entries in date range
        const { data: entries, error: entriesError } = await db
            .from('cash_flow_entries')
            .select('id, type, amount, category, due_date, paid_date, status, entity_name')
            .gte('due_date', startDate)
            .lte('due_date', endDate)
            .neq('status', 'cancelled');

        if (entriesError) {
            console.error('[analytics] Entries error:', entriesError);
        }

        // Fetch pending orders for receivables
        const { data: orders, error: ordersError } = await db
            .from('tiny_orders')
            .select('id, valor, vencimento_estimado, status_pagamento, data_pedido, canal')
            .gte('vencimento_estimado', startDate)
            .lte('vencimento_estimado', endDate);

        if (ordersError) {
            console.error('[analytics] Orders error:', ordersError);
        }

        const allEntries = entries || [];
        const allOrders = orders || [];

        // Calculate KPIs
        const kpis = calculateKPIs(allEntries, allOrders);

        // Calculate category breakdown
        const categoryBreakdown = calculateCategoryBreakdown(allEntries);

        // Calculate trend data
        const trendData = calculateTrendData(allEntries, allOrders, startDate, endDate, period);

        // Calculate cash flow projection (next 30 days)
        const projection = await calculateProjection();

        // Top entities (clients/suppliers)
        const topEntities = calculateTopEntities(allEntries);

        return NextResponse.json({
            kpis,
            categoryBreakdown,
            trendData,
            projection,
            topEntities,
            period: { start: startDate, end: endDate },
        });
    } catch (error) {
        console.error('[analytics] Error:', error);
        return NextResponse.json({ error: 'Erro ao calcular analytics' }, { status: 500 });
    }
}

function getMonthStart(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

function getMonthEnd(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
}

function calculateKPIs(entries: any[], orders: any[]) {
    // Income/Expense from cash flow entries
    const income = entries
        .filter(e => e.type === 'income' && e.status === 'confirmed')
        .reduce((sum, e) => sum + (e.amount || 0), 0);

    const expenses = entries
        .filter(e => e.type === 'expense' && e.status === 'confirmed')
        .reduce((sum, e) => sum + (e.amount || 0), 0);

    const pendingIncome = entries
        .filter(e => e.type === 'income' && e.status === 'pending')
        .reduce((sum, e) => sum + (e.amount || 0), 0);

    const pendingExpenses = entries
        .filter(e => e.type === 'expense' && e.status === 'pending')
        .reduce((sum, e) => sum + (e.amount || 0), 0);

    // Orders metrics
    const ordersTotal = orders.reduce((sum, o) => sum + (o.valor || 0), 0);
    const ordersPaid = orders
        .filter(o => o.status_pagamento === 'pago')
        .reduce((sum, o) => sum + (o.valor || 0), 0);
    const ordersPending = orders
        .filter(o => o.status_pagamento === 'pendente')
        .reduce((sum, o) => sum + (o.valor || 0), 0);
    const ordersOverdue = orders
        .filter(o => o.status_pagamento === 'atrasado')
        .reduce((sum, o) => sum + (o.valor || 0), 0);

    return {
        income,
        expenses,
        netCashFlow: income - expenses,
        pendingIncome,
        pendingExpenses,
        netPending: pendingIncome - pendingExpenses,
        ordersTotal,
        ordersPaid,
        ordersPending,
        ordersOverdue,
        paymentRate: ordersTotal > 0 ? ((ordersPaid / ordersTotal) * 100).toFixed(1) : 0,
    };
}

function calculateCategoryBreakdown(entries: any[]) {
    const byCategory: Record<string, { income: number; expense: number }> = {};

    entries.forEach(entry => {
        const cat = entry.category || 'Outros';
        if (!byCategory[cat]) {
            byCategory[cat] = { income: 0, expense: 0 };
        }
        if (entry.type === 'income') {
            byCategory[cat].income += entry.amount || 0;
        } else {
            byCategory[cat].expense += entry.amount || 0;
        }
    });

    // Convert to array and sort by total value
    return Object.entries(byCategory)
        .map(([name, values]) => ({
            name,
            income: values.income,
            expense: values.expense,
            total: values.income + values.expense,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
}

function calculateTrendData(entries: any[], orders: any[], startDate: string, endDate: string, period: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const data: { date: string; income: number; expense: number; orders: number }[] = [];

    // Generate date buckets
    const current = new Date(start);
    while (current <= end) {
        let dateKey: string;
        let nextDate: Date;

        if (period === 'daily') {
            dateKey = current.toISOString().split('T')[0];
            nextDate = new Date(current);
            nextDate.setDate(nextDate.getDate() + 1);
        } else if (period === 'weekly') {
            dateKey = getWeekKey(current);
            nextDate = new Date(current);
            nextDate.setDate(nextDate.getDate() + 7);
        } else {
            dateKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
            nextDate = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        }

        const bucketEntries = entries.filter(e => {
            const d = new Date(e.due_date);
            return d >= current && d < nextDate;
        });

        const bucketOrders = orders.filter(o => {
            const d = new Date(o.vencimento_estimado);
            return d >= current && d < nextDate;
        });

        data.push({
            date: dateKey,
            income: bucketEntries.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0),
            expense: bucketEntries.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0),
            orders: bucketOrders.reduce((s, o) => s + (o.valor || 0), 0),
        });

        current.setTime(nextDate.getTime());
    }

    return data;
}

function getWeekKey(date: Date): string {
    const start = new Date(date.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function calculateProjection() {
    const today = new Date();
    const next30 = new Date(today);
    next30.setDate(next30.getDate() + 30);

    const { data: upcoming } = await db
        .from('cash_flow_entries')
        .select('type, amount, due_date, status')
        .gte('due_date', today.toISOString().split('T')[0])
        .lte('due_date', next30.toISOString().split('T')[0])
        .neq('status', 'cancelled');

    const entries = upcoming || [];

    const projectedIncome = entries
        .filter((e: any) => e.type === 'income' && e.status === 'pending')
        .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    const projectedExpenses = entries
        .filter((e: any) => e.type === 'expense' && e.status === 'pending')
        .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    // Weekly breakdown
    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() + (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekEntries = entries.filter((e: any) => {
            const d = new Date(e.due_date);
            return d >= weekStart && d < weekEnd;
        });

        weeks.push({
            week: i + 1,
            income: weekEntries.filter((e: any) => e.type === 'income').reduce((s: number, e: any) => s + (e.amount || 0), 0),
            expense: weekEntries.filter((e: any) => e.type === 'expense').reduce((s: number, e: any) => s + (e.amount || 0), 0),
        });
    }

    return {
        projectedIncome,
        projectedExpenses,
        projectedNet: projectedIncome - projectedExpenses,
        weeks,
    };
}

function calculateTopEntities(entries: any[]) {
    const byEntity: Record<string, { count: number; total: number; type: string }> = {};

    entries.forEach(entry => {
        const name = entry.entity_name || 'N/A';
        if (name === 'N/A') return;

        if (!byEntity[name]) {
            byEntity[name] = { count: 0, total: 0, type: entry.type };
        }
        byEntity[name].count++;
        byEntity[name].total += entry.amount || 0;
    });

    return Object.entries(byEntity)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
}
