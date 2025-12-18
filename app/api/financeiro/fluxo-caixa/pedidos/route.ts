import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

        // Helper to apply filters
        const applyFilters = (query: any) => {
            // For date filters, use inclusive ranges that work across timezones
            // The database stores timestamps in UTC, but we want to filter by local date
            if (dataInicio) {
                // Start from beginning of start date (inclusive)
                query = query.gte('data_criacao', `${dataInicio}T00:00:00`);
            }
            if (dataFim) {
                // Include full end date by using next day as exclusive upper bound
                const endDate = new Date(dataFim);
                endDate.setDate(endDate.getDate() + 1);
                const nextDay = endDate.toISOString().split('T')[0];
                query = query.lt('data_criacao', `${nextDay}T00:00:00`);
            }

            // Default filter: ignore cancelled (code 2)
            query = query.neq('situacao', 2);

            if (statusPagamento === 'pagos') {
                query = query.eq('payment_received', true);
            } else if (statusPagamento === 'pendentes') {
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
                    marketplace,
                    marketplace_order_id
                )
            `, { count: 'exact' });

        listQuery = applyFilters(listQuery);
        listQuery = listQuery.order('data_criacao', { ascending: false });
        listQuery = listQuery.range(offset, offset + limit - 1);

        // 2. Summary Query (All matching rows for aggregation)
        // We only need fields relevant for calculation: payment status, value, date, canal
        let summaryQuery = supabaseAdmin
            .from('tiny_orders')
            .select('valor_total_pedido, valor, payment_received, data_criacao, canal');

        summaryQuery = applyFilters(summaryQuery);

        // Execute both in parallel
        const [listRes, summaryRes] = await Promise.all([
            listQuery,
            summaryQuery
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

        // Processing List
        const orders = listRes.data.map(order => {
            let financialStatus = 'pendente';
            let vencimentoEstimado: string | null = null;

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

            return {
                id: order.id,
                tiny_id: order.tiny_id,
                numero_pedido: order.numero_pedido,
                cliente: order.cliente_nome,
                valor: order.valor_total_pedido ?? order.valor ?? 0,
                data_pedido: order.data_criacao,
                data_faturamento: order.tiny_data_faturamento,
                vencimento_estimado: vencimentoEstimado,
                status_pagamento: financialStatus,
                data_pagamento: order.payment_received_at,
                canal: order.canal,
                marketplace_info: order.marketplace_order_links?.[0] || null
            };
        });

        // Processing Summary
        const summary = {
            recebido: 0,
            pendente: 0,
            atrasado: 0,
            total: 0
        };

        summaryRes.data.forEach((o: any) => {
            const valor = o.valor_total_pedido ?? o.valor ?? 0;
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
        });

        return NextResponse.json({
            orders,
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

