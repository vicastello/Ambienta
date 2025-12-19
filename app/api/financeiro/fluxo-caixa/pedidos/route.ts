import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateMarketplaceFees } from '@/lib/marketplace-fees';

export const dynamic = 'force-dynamic';

// Marketplace-specific due date rules (days after order creation)
const MARKETPLACE_DUE_DAYS: Record<string, number> = {
    'shopee': 14,      // Shopee: D+14
    'mercado': 15,     // Mercado Livre: D+15
    'meli': 15,        // Mercado Livre (alias): D+15
    'magalu': 30,      // Magalu: D+30
    'magazine': 30,    // Magalu (alias): D+30
    'default': 30,     // Outros canais: D+30
};

/**
 * Calculate due date based on marketplace channel
 */
function getDueDays(canal: string | null): number {
    if (!canal) return MARKETPLACE_DUE_DAYS.default;
    const lowerCanal = canal.toLowerCase();

    for (const [key, days] of Object.entries(MARKETPLACE_DUE_DAYS)) {
        if (key !== 'default' && lowerCanal.includes(key)) {
            return days;
        }
    }
    return MARKETPLACE_DUE_DAYS.default;
}

/**
 * Calculate due date for an order
 */
function calculateDueDate(orderDate: Date, canal: string | null): Date {
    const dueDays = getDueDays(canal);
    const dueDate = new Date(orderDate);
    dueDate.setDate(dueDate.getDate() + dueDays);
    return dueDate;
}

/**
 * Calculate sparkline data (7 points) bucketed by time
 */
function calculateSparkline(
    items: any[],
    getValue: (item: any) => number,
    getDate: (item: any) => Date,
    startDate?: Date,
    endDate?: Date
): number[] {
    const buckets = Array(7).fill(0);

    // Determine range
    let start = startDate;
    let end = endDate;

    if (!start || !end) {
        if (!items.length) return buckets;
        const timestamps = items.map(i => getDate(i).getTime());
        if (!start) start = new Date(Math.min(...timestamps));
        if (!end) end = new Date(Math.max(...timestamps));
    }

    // Ensure valid range (default to 7 days if start >= end)
    if (start.getTime() >= end.getTime()) {
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const duration = end.getTime() - start.getTime();
    // avoid division by zero
    if (duration <= 0) return buckets;

    const bucketSize = duration / 7;

    items.forEach(item => {
        const itemDate = getDate(item);
        const diff = itemDate.getTime() - start!.getTime();
        let bucketIndex = Math.floor(diff / bucketSize);
        if (bucketIndex < 0) bucketIndex = 0;
        if (bucketIndex > 6) bucketIndex = 6;

        buckets[bucketIndex] += getValue(item);
    });

    return buckets;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);

        // Pagination
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        // Filters
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');
        const statusPagamento = searchParams.get('statusPagamento') || 'todos'; // todos, pagos, pendentes
        const marketplace = searchParams.get('marketplace') || 'todos';

        // Debug logging
        console.log('[CashFlowAPI] Filters:', {
            dataInicio,
            dataFim,
            statusPagamento,
            marketplace,
            fullUrl: request.url
        });

        // Helper to get next day date string [YYYY-MM-DD] for inclusive upper bound filtering
        const getNextDay = (dateStr: string): string => {
            try {
                const date = new Date(dateStr);
                date.setDate(date.getDate() + 1);
                return date.toISOString().split('T')[0];
            } catch (e) {
                return dateStr;
            }
        };

        // Helper to apply filters
        const applyFilters = (query: any, ignoreStatus = false) => {
            // data_criacao is type DATE (not TIMESTAMPTZ), so we compare with plain dates
            // The frontend sends dates in YYYY-MM-DD format from local timezone
            if (dataInicio) {
                query = query.gte('data_criacao', dataInicio);
            }
            if (dataFim) {
                // Use Less Than Next Day to handle both DATE and TIMESTAMP types correctly inclusive of the end date
                query = query.lt('data_criacao', getNextDay(dataFim));
            }

            // Default filter: ignore cancelled (code 2)
            query = query.neq('situacao', 2);

            if (!ignoreStatus && statusPagamento === 'pagos') {
                query = query.eq('payment_received', true);
            } else if (!ignoreStatus && statusPagamento === 'pendentes') {
                query = query.or('payment_received.is.null,payment_received.eq.false');
            }

            if (marketplace !== 'todos') {
                query = query.ilike('canal', `%${marketplace}%`);
            }
            return query;
        };

        // 1. List Query (Paginated)
        let listQuery = supabaseAdmin
            .from('tiny_orders')
            .select(`
                id,
                tiny_id,
                numero_pedido,
                data_criacao,
                tiny_data_faturamento,
                cliente_nome,
                valor_total_pedido,
                valor,
                situacao,
                canal,
                payment_received,
                payment_received_at,
                marketplace_payment_id,
                marketplace_order_links (
                    marketplace_order_id
                ),
                marketplace_payments!tiny_orders_marketplace_payment_id_fkey (
                    net_amount,
                    gross_amount
                ),
                valor_frete,
                fee_overrides
            `, { count: 'exact' });

        listQuery = applyFilters(listQuery);
        listQuery = listQuery.order('data_criacao', { ascending: false });
        listQuery = listQuery.range(offset, offset + limit - 1);

        // 2. Summary Query (All matching rows for aggregation)
        // We only need fields relevant for calculation: payment status, value, date, canal
        let summaryQuery = supabaseAdmin
            .from('tiny_orders')
            .select(`
                valor_total_pedido, 
                valor, 
                payment_received, 
                data_criacao, 
                canal,
                marketplace_payment_id,
                marketplace_payments!tiny_orders_marketplace_payment_id_fkey (
                    net_amount
                ),
                valor_frete,
                fee_overrides
            `);

        summaryQuery = applyFilters(summaryQuery, true);

        // Execute queries in parallel (added manual entries query)
        const [listRes, summaryRes, manualEntriesRes] = await Promise.all([
            listQuery,
            summaryQuery,
            (async () => {
                // Query for manual entries (Income and Expenses)
                let q = supabaseAdmin
                    .from('cash_flow_entries')
                    .select('amount, status, due_date, type');

                // Apply similar filters to manual entries
                if (dataInicio) q = q.gte('due_date', dataInicio);
                if (dataFim) q = q.lte('due_date', dataFim); // due_date is explicitly DATE type, lte works fine

                return q;
            })()
        ]);

        if (listRes.error) {
            console.error('[CashFlowAPI] List error:', listRes.error);
            throw listRes.error;
        }
        if (summaryRes.error) {
            console.error('[CashFlowAPI] Summary error:', summaryRes.error);
            throw summaryRes.error;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day for correct date comparison

        // Processing List (async to calculate fees)
        const orders = await Promise.all(listRes.data.map(async (order) => {
            let financialStatus = 'pendente';
            let vencimentoEstimado: string | null = null;

            // @ts-ignore - payment_received exists but not in generated types
            if (order.payment_received) {
                financialStatus = 'pago';
            } else {
                const orderDate = new Date(order.data_criacao || new Date());
                const dueDate = calculateDueDate(orderDate, order.canal);
                vencimentoEstimado = dueDate.toISOString();

                if (today > dueDate) {
                    financialStatus = 'atrasado';
                }
            }

            const vTotal = Number(order.valor || order.valor_total_pedido || 0);
            const vFrete = Number(order.valor_frete || 0);
            const valorOriginal = vTotal; // The original total is still the same for display
            const baseTaxas = Math.max(0, vTotal - vFrete); // Base for fees is total minus freight

            // If we have a matched payment, prefer the Net Amount (Effective Cash Flow)
            // Otherwise use the Order Value
            const valorEfetivo = order.marketplace_payments?.net_amount
                ? Number(order.marketplace_payments.net_amount)
                : valorOriginal;

            // Calculate expected fees
            let valorEsperado: number | undefined;
            let diferenca: number | undefined;
            let feesBreakdown: any;

            // Try to determine marketplace from canal
            const canal = order.canal?.toLowerCase() || '';
            let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;
            if (canal.includes('shopee')) marketplace = 'shopee';
            else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
            else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

            if (marketplace && valorOriginal > 0) {
                try {
                    const linkData = order.marketplace_order_links?.[0] as any;
                    const feeCalc = await calculateMarketplaceFees({
                        marketplace,
                        orderValue: baseTaxas,
                        productCount: linkData?.product_count || 1,
                        isKit: linkData?.is_kit || false,
                        usesFreeShipping: (order.fee_overrides as any)?.usesFreeShipping ?? (linkData?.uses_free_shipping || false),
                        isCampaignOrder: linkData?.is_campaign_order || false,
                        orderDate: new Date(order.data_criacao || new Date()),
                    });

                    // Apply manual overrides if present
                    if (order.fee_overrides) {
                        const overrides = order.fee_overrides as any;
                        if (overrides.commissionFee !== undefined) feeCalc.commissionFee = Number(overrides.commissionFee);
                        if (overrides.fixedCost !== undefined) feeCalc.fixedCost = Number(overrides.fixedCost);
                        if (overrides.campaignFee !== undefined) feeCalc.campaignFee = Number(overrides.campaignFee);

                        // Recalculate totals
                        feeCalc.totalFees = feeCalc.commissionFee + (feeCalc.campaignFee || 0) + feeCalc.fixedCost;
                        feeCalc.netValue = feeCalc.grossValue - feeCalc.totalFees;
                    }

                    valorEsperado = feeCalc.netValue;
                    diferenca = valorEfetivo - valorEsperado;
                    feesBreakdown = feeCalc;
                } catch (error) {
                    console.error('[CashFlowAPI] Fee calculation error for order:', order.id, error);
                }
            }

            return {
                id: order.id,
                tiny_id: order.tiny_id,
                numero_pedido: order.numero_pedido,
                cliente: order.cliente_nome,
                valor: valorEfetivo,
                valor_original: valorOriginal,
                valor_esperado: valorEsperado,
                diferenca: diferenca,
                fees_breakdown: feesBreakdown,
                data_pedido: order.data_criacao,
                data_faturamento: order.tiny_data_faturamento,
                vencimento_estimado: vencimentoEstimado,
                status_pagamento: financialStatus,
                data_pagamento: order.payment_received_at,
                canal: order.canal,
                marketplace_info: order.marketplace_order_links?.[0] || null
            };
        }));

        // Processing Summary
        const summary = {
            recebido: 0,
            pendente: 0,
            atrasado: 0,
            total: 0,
            expenses: {
                total: 0,
                paid: 0,
                pending: 0,
                overdue: 0
            },
            sparklines: {
                total: [] as number[],
                recebido: [] as number[],
                pendente: [] as number[],
                atrasado: [] as number[],
                saidas: [] as number[]
            }
        };

        // Prepare data for sparklines
        const sparklineItems: any[] = [];

        // 1. Process Tiny Orders (Always Income)
        summaryRes.data.forEach((o: any) => {
            const vTotal = Number(o.valor || o.valor_total_pedido || 0);
            const vFrete = Number(o.valor_frete || 0);
            const valorOriginal = vTotal;
            const baseTaxas = Math.max(0, vTotal - vFrete);

            // Re-calculate fee if there's an override for summary accuracy
            let vEsperado = 0;
            if (o.fee_overrides) {
                const overrides = o.fee_overrides as any;
                const totalFees = (Number(overrides.commissionFee) || 0) +
                    (Number(overrides.fixedCost) || 0) +
                    (Number(overrides.campaignFee) || 0);
                vEsperado = baseTaxas - totalFees;
            }

            // Prefer Net Amount from payment if available
            const valor = o.marketplace_payments?.net_amount
                ? Number(o.marketplace_payments.net_amount)
                : (o.fee_overrides ? vEsperado : valorOriginal);

            summary.total += valor;

            if (o.payment_received) {
                summary.recebido += valor;
            } else {
                const orderDate = new Date(o.data_criacao || new Date());
                const dueDate = calculateDueDate(orderDate, o.canal);

                if (today > dueDate) {
                    summary.atrasado += valor;
                } else {
                    summary.pendente += valor;
                }
            }

            // Add to sparkline items with calculated properties
            sparklineItems.push({
                date: new Date(o.data_criacao || new Date()),
                valor,
                type: 'income',
                status: o.payment_received ? 'pago' : (today > calculateDueDate(new Date(o.data_criacao), o.canal) ? 'atrasado' : 'pendente')
            });
        });

        // 2. Process Manual Entries (Income and Expense)
        if (manualEntriesRes.data) {
            manualEntriesRes.data.forEach((entry: any) => {
                const valor = Number(entry.amount || 0);

                if (entry.type === 'expense') {
                    summary.expenses.total += valor;
                    // Subtract expense from Grand Total (Net Balance concept)
                    summary.total -= valor;

                    if (entry.status === 'confirmed') {
                        summary.expenses.paid += valor;
                    } else {
                        const dueDate = new Date(entry.due_date);
                        // Fix for overdue calculation consistency
                        if (today > dueDate && entry.status !== 'confirmed') {
                            summary.expenses.overdue += valor;
                        } else {
                            summary.expenses.pending += valor;
                        }
                    }
                } else {
                    // Income logic
                    summary.total += valor;

                    if (entry.status === 'confirmed') {
                        summary.recebido += valor;
                    } else {
                        const dueDate = new Date(entry.due_date);
                        if (today > dueDate && entry.status !== 'confirmed') {
                            summary.atrasado += valor;
                        } else {
                            summary.pendente += valor;
                        }
                    }
                }

                // Add to sparkline items
                sparklineItems.push({
                    date: new Date(entry.due_date),
                    valor,
                    type: entry.type === 'expense' ? 'expense' : 'income',
                    status: entry.status === 'confirmed' ? 'pago' : (today > new Date(entry.due_date) ? 'atrasado' : 'pendente')
                });
            });
        }

        // Calculate Sparklines
        const rangeStart = dataInicio ? new Date(dataInicio) : undefined;
        const rangeEnd = dataFim ? new Date(dataFim) : undefined;

        // 1. Total (Net Balance: Income - Expense)
        summary.sparklines.total = calculateSparkline(
            sparklineItems,
            (item) => item.type === 'expense' ? -item.valor : item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // 2. Recebido (Paid Income)
        summary.sparklines.recebido = calculateSparkline(
            sparklineItems.filter(i => i.type === 'income' && i.status === 'pago'),
            (item) => item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // 3. Pendente (Pending Income)
        summary.sparklines.pendente = calculateSparkline(
            sparklineItems.filter(i => i.type === 'income' && i.status === 'pendente'),
            (item) => item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // 4. Atrasado (Overdue Income)
        summary.sparklines.atrasado = calculateSparkline(
            sparklineItems.filter(i => i.type === 'income' && i.status === 'atrasado'),
            (item) => item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // 5. Saídas (Expenses)
        summary.sparklines.saidas = calculateSparkline(
            sparklineItems.filter(i => i.type === 'expense'),
            (item) => item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        return NextResponse.json({
            orders,
            chartOrders: sparklineItems
                .filter(i => i.type === 'income')
                .map(i => ({
                    id: 0,
                    valor: i.valor,
                    data_pedido: i.date,
                    status_pagamento: i.status
                })),
            expenses: manualEntriesRes.data || [], // Return raw expenses for chart
            meta: {
                total: listRes.count,
                page,
                limit,
                totalPages: listRes.count ? Math.ceil(listRes.count / limit) : 0,
                summary, // Include the calculated summary
                dueDateRules: MARKETPLACE_DUE_DAYS // Expose rules for client info
            }
        });

    } catch (error: any) {
        console.error('[CashFlowAPI] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno: ' + error.message }, { status: 500 });
    }
}

