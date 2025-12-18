// API endpoint to check and trigger alerts based on configurations
// Can be called by cron job or manually
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const db = supabaseAdmin as any;

export async function POST(request: NextRequest) {
    try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        const results = {
            checked: 0,
            triggered: 0,
            alerts: [] as string[],
        };

        // Get enabled alert configurations
        const { data: configs } = await db
            .from('financial_alerts')
            .select('*')
            .eq('is_enabled', true);

        if (!configs || configs.length === 0) {
            return NextResponse.json({ message: 'No enabled alerts', results });
        }

        for (const config of configs) {
            results.checked++;

            try {
                switch (config.alert_type) {
                    case 'overdue':
                        await checkOverdueEntries(config, todayStr, results);
                        break;
                    case 'upcoming':
                        await checkUpcomingEntries(config, today, results);
                        break;
                    case 'low_balance':
                        await checkLowBalance(config, results);
                        break;
                    case 'large_expense':
                        await checkLargeExpenses(config, todayStr, results);
                        break;
                }
            } catch (err) {
                console.error(`[check] Error checking ${config.alert_type}:`, err);
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (error) {
        console.error('[check] Error:', error);
        return NextResponse.json({ error: 'Erro ao verificar alertas' }, { status: 500 });
    }
}

async function checkOverdueEntries(config: any, todayStr: string, results: any) {
    // Find overdue entries without recent alerts
    const { data: overdue } = await db
        .from('cash_flow_entries')
        .select('id, description, amount, due_date, type')
        .lt('due_date', todayStr)
        .eq('status', 'pending')
        .neq('status', 'cancelled')
        .limit(20);

    if (overdue && overdue.length > 0) {
        const totalAmount = overdue.reduce((sum: number, e: any) => sum + e.amount, 0);
        const entryIds = overdue.map((e: any) => e.id);

        // Check if alert already sent today
        const { data: existing } = await db
            .from('alert_history')
            .select('id')
            .eq('alert_type', 'overdue')
            .gte('created_at', todayStr)
            .maybeSingle();

        if (!existing) {
            await db.from('alert_history').insert({
                alert_id: config.id,
                alert_type: 'overdue',
                title: `${overdue.length} lançamentos atrasados`,
                message: `Você tem ${overdue.length} lançamento(s) vencido(s) totalizando R$ ${totalAmount.toFixed(2)}`,
                severity: 'critical',
                related_entries: entryIds,
            });

            results.triggered++;
            results.alerts.push(`Overdue: ${overdue.length} entries`);
        }
    }
}

async function checkUpcomingEntries(config: any, today: Date, results: any) {
    const daysBefore = config.days_before || 3;
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysBefore);
    const futureDateStr = futureDate.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    // Find entries due in the next X days
    const { data: upcoming } = await db
        .from('cash_flow_entries')
        .select('id, description, amount, due_date, type')
        .gte('due_date', todayStr)
        .lte('due_date', futureDateStr)
        .eq('status', 'pending')
        .limit(20);

    if (upcoming && upcoming.length > 0) {
        const incomeCount = upcoming.filter((e: any) => e.type === 'income').length;
        const expenseCount = upcoming.filter((e: any) => e.type === 'expense').length;
        const expenseAmount = upcoming
            .filter((e: any) => e.type === 'expense')
            .reduce((sum: number, e: any) => sum + e.amount, 0);

        // Check if alert already sent today
        const { data: existing } = await db
            .from('alert_history')
            .select('id')
            .eq('alert_type', 'upcoming')
            .gte('created_at', todayStr)
            .maybeSingle();

        if (!existing) {
            await db.from('alert_history').insert({
                alert_id: config.id,
                alert_type: 'upcoming',
                title: `${upcoming.length} vencimentos próximos`,
                message: `Próximos ${daysBefore} dias: ${incomeCount} receita(s), ${expenseCount} despesa(s). Total a pagar: R$ ${expenseAmount.toFixed(2)}`,
                severity: 'warning',
                related_entries: upcoming.map((e: any) => e.id),
            });

            results.triggered++;
            results.alerts.push(`Upcoming: ${upcoming.length} entries`);
        }
    }
}

async function checkLowBalance(config: any, results: any) {
    const threshold = config.threshold_value || 1000;
    const today = new Date();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Calculate projected balance
    const { data: entries } = await db
        .from('cash_flow_entries')
        .select('type, amount, status')
        .gte('due_date', todayStr)
        .lte('due_date', endOfMonth.toISOString().split('T')[0]);

    if (entries) {
        const projectedIncome = entries
            .filter((e: any) => e.type === 'income')
            .reduce((sum: number, e: any) => sum + e.amount, 0);
        const projectedExpense = entries
            .filter((e: any) => e.type === 'expense')
            .reduce((sum: number, e: any) => sum + e.amount, 0);
        const projectedBalance = projectedIncome - projectedExpense;

        if (projectedBalance < threshold) {
            // Check if alert already sent today
            const { data: existing } = await db
                .from('alert_history')
                .select('id')
                .eq('alert_type', 'low_balance')
                .gte('created_at', todayStr)
                .maybeSingle();

            if (!existing) {
                await db.from('alert_history').insert({
                    alert_id: config.id,
                    alert_type: 'low_balance',
                    title: 'Saldo projetado baixo',
                    message: `O saldo projetado para o fim do mês é R$ ${projectedBalance.toFixed(2)}, abaixo do limite de R$ ${threshold.toFixed(2)}`,
                    severity: projectedBalance < 0 ? 'critical' : 'warning',
                });

                results.triggered++;
                results.alerts.push(`Low balance: ${projectedBalance.toFixed(2)}`);
            }
        }
    }
}

async function checkLargeExpenses(config: any, todayStr: string, results: any) {
    const threshold = config.threshold_value || 5000;

    // Find large expenses created today
    const { data: largeExpenses } = await db
        .from('cash_flow_entries')
        .select('id, description, amount')
        .eq('type', 'expense')
        .gte('amount', threshold)
        .gte('created_at', todayStr);

    for (const expense of largeExpenses || []) {
        // Check if alert already created for this entry
        const { data: existing } = await db
            .from('alert_history')
            .select('id')
            .eq('alert_type', 'large_expense')
            .contains('related_entries', [expense.id])
            .maybeSingle();

        if (!existing) {
            await db.from('alert_history').insert({
                alert_id: config.id,
                alert_type: 'large_expense',
                title: 'Despesa grande registrada',
                message: `Nova despesa de R$ ${expense.amount.toFixed(2)}: ${expense.description}`,
                severity: 'warning',
                related_entries: [expense.id],
            });

            results.triggered++;
            results.alerts.push(`Large expense: ${expense.amount}`);
        }
    }
}
