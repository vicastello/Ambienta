// API route for generating PDF financial reports
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const db = supabaseAdmin as any;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            reportType = 'cashflow', // cashflow, receivables, summary
            startDate,
            endDate,
            format = 'html', // html, json (PDF via client)
            filters = {},
        } = body;

        // Validate date range
        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'Data inicial e final são obrigatórias' }, { status: 400 });
        }

        let reportData: any = {};
        let reportTitle = '';

        switch (reportType) {
            case 'cashflow':
                reportData = await generateCashFlowReport(startDate, endDate, filters);
                reportTitle = 'Relatório de Fluxo de Caixa';
                break;
            case 'receivables':
                reportData = await generateReceivablesReport(startDate, endDate, filters);
                reportTitle = 'Relatório de Recebíveis';
                break;
            case 'summary':
                reportData = await generateSummaryReport(startDate, endDate, filters);
                reportTitle = 'Resumo Financeiro';
                break;
            default:
                return NextResponse.json({ error: 'Tipo de relatório inválido' }, { status: 400 });
        }

        if (format === 'json') {
            return NextResponse.json({
                title: reportTitle,
                period: { start: startDate, end: endDate },
                generatedAt: new Date().toISOString(),
                data: reportData,
            });
        }

        // Generate HTML report for PDF conversion
        const html = generateReportHTML(reportTitle, startDate, endDate, reportData, reportType);

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
            },
        });
    } catch (error) {
        console.error('[reports] Error:', error);
        return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 });
    }
}

async function generateCashFlowReport(startDate: string, endDate: string, filters: any) {
    const { data: entries } = await db
        .from('cash_flow_entries')
        .select('*')
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true });

    const all = entries || [];

    // Group by type
    const income = all.filter((e: any) => e.type === 'income');
    const expense = all.filter((e: any) => e.type === 'expense');

    // Sum by status
    const confirmedIncome = income.filter((e: any) => e.status === 'confirmed').reduce((s: number, e: any) => s + e.amount, 0);
    const pendingIncome = income.filter((e: any) => e.status === 'pending').reduce((s: number, e: any) => s + e.amount, 0);
    const confirmedExpense = expense.filter((e: any) => e.status === 'confirmed').reduce((s: number, e: any) => s + e.amount, 0);
    const pendingExpense = expense.filter((e: any) => e.status === 'pending').reduce((s: number, e: any) => s + e.amount, 0);

    // Group by category
    const byCategory: Record<string, { income: number; expense: number }> = {};
    all.forEach((e: any) => {
        const cat = e.category || 'Outros';
        if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
        if (e.type === 'income') byCategory[cat].income += e.amount;
        else byCategory[cat].expense += e.amount;
    });

    return {
        summary: {
            confirmedIncome,
            pendingIncome,
            totalIncome: confirmedIncome + pendingIncome,
            confirmedExpense,
            pendingExpense,
            totalExpense: confirmedExpense + pendingExpense,
            netConfirmed: confirmedIncome - confirmedExpense,
            netTotal: (confirmedIncome + pendingIncome) - (confirmedExpense + pendingExpense),
        },
        byCategory: Object.entries(byCategory).map(([name, v]) => ({ name, ...v })),
        entries: all.slice(0, 100), // Limit for PDF
    };
}

async function generateReceivablesReport(startDate: string, endDate: string, filters: any) {
    const { data: orders } = await db
        .from('tiny_orders')
        .select('id, numero_pedido, cliente, valor, data_pedido, vencimento_estimado, status_pagamento, canal')
        .gte('vencimento_estimado', startDate)
        .lte('vencimento_estimado', endDate)
        .order('vencimento_estimado', { ascending: true });

    const all = orders || [];

    const paid = all.filter((o: any) => o.status_pagamento === 'pago');
    const pending = all.filter((o: any) => o.status_pagamento === 'pendente');
    const overdue = all.filter((o: any) => o.status_pagamento === 'atrasado');

    // Group by channel
    const byChannel: Record<string, { count: number; total: number }> = {};
    all.forEach((o: any) => {
        const ch = o.canal || 'Outros';
        if (!byChannel[ch]) byChannel[ch] = { count: 0, total: 0 };
        byChannel[ch].count++;
        byChannel[ch].total += o.valor;
    });

    return {
        summary: {
            totalOrders: all.length,
            paidOrders: paid.length,
            paidValue: paid.reduce((s: number, o: any) => s + o.valor, 0),
            pendingOrders: pending.length,
            pendingValue: pending.reduce((s: number, o: any) => s + o.valor, 0),
            overdueOrders: overdue.length,
            overdueValue: overdue.reduce((s: number, o: any) => s + o.valor, 0),
            paymentRate: all.length > 0 ? ((paid.length / all.length) * 100).toFixed(1) : 0,
        },
        byChannel: Object.entries(byChannel).map(([name, v]) => ({ name, ...v })),
        orders: all.slice(0, 100),
    };
}

async function generateSummaryReport(startDate: string, endDate: string, filters: any) {
    const cashflow = await generateCashFlowReport(startDate, endDate, filters);
    const receivables = await generateReceivablesReport(startDate, endDate, filters);

    return {
        cashflow: cashflow.summary,
        receivables: receivables.summary,
        topCategories: cashflow.byCategory.slice(0, 5),
        topChannels: receivables.byChannel.slice(0, 5),
    };
}

function generateReportHTML(title: string, startDate: string, endDate: string, data: any, type: string) {
    const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

    let content = '';

    if (type === 'cashflow') {
        content = `
            <div class="summary">
                <h2>Resumo</h2>
                <table>
                    <tr><td>Receitas Confirmadas</td><td class="value income">${formatCurrency(data.summary.confirmedIncome)}</td></tr>
                    <tr><td>Receitas Pendentes</td><td class="value">${formatCurrency(data.summary.pendingIncome)}</td></tr>
                    <tr><td>Despesas Confirmadas</td><td class="value expense">${formatCurrency(data.summary.confirmedExpense)}</td></tr>
                    <tr><td>Despesas Pendentes</td><td class="value">${formatCurrency(data.summary.pendingExpense)}</td></tr>
                    <tr class="total"><td>Saldo Líquido</td><td class="value ${data.summary.netConfirmed >= 0 ? 'income' : 'expense'}">${formatCurrency(data.summary.netConfirmed)}</td></tr>
                </table>
            </div>

            <div class="categories">
                <h2>Por Categoria</h2>
                <table>
                    <thead><tr><th>Categoria</th><th>Receitas</th><th>Despesas</th></tr></thead>
                    <tbody>
                        ${data.byCategory.map((c: any) => `
                            <tr>
                                <td>${c.name}</td>
                                <td class="value income">${formatCurrency(c.income)}</td>
                                <td class="value expense">${formatCurrency(c.expense)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="entries">
                <h2>Lançamentos</h2>
                <table>
                    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
                    <tbody>
                        ${data.entries.slice(0, 50).map((e: any) => `
                            <tr>
                                <td>${formatDate(e.due_date)}</td>
                                <td>${e.description || '-'}</td>
                                <td>${e.category || '-'}</td>
                                <td class="value ${e.type === 'income' ? 'income' : 'expense'}">${e.type === 'expense' ? '-' : ''}${formatCurrency(e.amount)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else if (type === 'receivables') {
        content = `
            <div class="summary">
                <h2>Resumo</h2>
                <table>
                    <tr><td>Total de Pedidos</td><td class="value">${data.summary.totalOrders}</td></tr>
                    <tr><td>Pagos</td><td class="value income">${data.summary.paidOrders} (${formatCurrency(data.summary.paidValue)})</td></tr>
                    <tr><td>Pendentes</td><td class="value">${data.summary.pendingOrders} (${formatCurrency(data.summary.pendingValue)})</td></tr>
                    <tr><td>Atrasados</td><td class="value expense">${data.summary.overdueOrders} (${formatCurrency(data.summary.overdueValue)})</td></tr>
                    <tr class="total"><td>Taxa de Recebimento</td><td class="value">${data.summary.paymentRate}%</td></tr>
                </table>
            </div>

            <div class="channels">
                <h2>Por Canal</h2>
                <table>
                    <thead><tr><th>Canal</th><th>Pedidos</th><th>Total</th></tr></thead>
                    <tbody>
                        ${data.byChannel.map((c: any) => `
                            <tr>
                                <td>${c.name}</td>
                                <td>${c.count}</td>
                                <td class="value">${formatCurrency(c.total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="orders">
                <h2>Pedidos</h2>
                <table>
                    <thead><tr><th>#</th><th>Cliente</th><th>Vencimento</th><th>Status</th><th>Valor</th></tr></thead>
                    <tbody>
                        ${data.orders.slice(0, 50).map((o: any) => `
                            <tr>
                                <td>${o.numero_pedido}</td>
                                <td>${o.cliente || '-'}</td>
                                <td>${formatDate(o.vencimento_estimado)}</td>
                                <td class="${o.status_pagamento}">${o.status_pagamento}</td>
                                <td class="value">${formatCurrency(o.valor)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else {
        content = `
            <div class="summary">
                <h2>Fluxo de Caixa</h2>
                <table>
                    <tr><td>Receitas</td><td class="value income">${formatCurrency(data.cashflow.totalIncome)}</td></tr>
                    <tr><td>Despesas</td><td class="value expense">${formatCurrency(data.cashflow.totalExpense)}</td></tr>
                    <tr class="total"><td>Saldo</td><td class="value">${formatCurrency(data.cashflow.netTotal)}</td></tr>
                </table>
            </div>

            <div class="summary">
                <h2>Recebíveis</h2>
                <table>
                    <tr><td>Pagos</td><td class="value income">${formatCurrency(data.receivables.paidValue)}</td></tr>
                    <tr><td>Pendentes</td><td class="value">${formatCurrency(data.receivables.pendingValue)}</td></tr>
                    <tr><td>Atrasados</td><td class="value expense">${formatCurrency(data.receivables.overdueValue)}</td></tr>
                </table>
            </div>
        `;
    }

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; color: #1e293b; }
        h2 { font-size: 14px; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; color: #475569; }
        .header { margin-bottom: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; }
        .header p { color: #64748b; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; }
        th { background: #f8fafc; font-weight: 600; color: #475569; }
        .value { text-align: right; font-family: monospace; }
        .income { color: #10b981; }
        .expense { color: #ef4444; }
        .total td { font-weight: 600; background: #f8fafc; }
        .pago { color: #10b981; }
        .pendente { color: #f59e0b; }
        .atrasado { color: #ef4444; }
        @media print {
            body { padding: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${title}</h1>
        <p>Período: ${formatDate(startDate)} a ${formatDate(endDate)} • Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
    </div>
    ${content}
</body>
</html>
    `.trim();
}
