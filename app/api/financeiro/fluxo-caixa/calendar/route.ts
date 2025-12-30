import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/financeiro/fluxo-caixa/calendar
 * Returns pending orders grouped by date for calendar display
 * 
 * Params:
 * - dataInicio, dataFim: date range for grouped data
 * - date: specific date to get order details
 * - includeOrders: if true and date is provided, returns individual orders
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');
        const specificDate = searchParams.get('date');
        const includeOrders = searchParams.get('includeOrders') === 'true';

        // If specific date is requested with orders, return order list
        if (specificDate && includeOrders) {
            const { data, error } = await supabaseAdmin
                .from('tiny_orders')
                .select('id, numero_pedido, numero_pedido_ecommerce, cliente_nome, valor_total_pedido, valor, canal, data_criacao')
                .eq('data_criacao', specificDate)
                .or('payment_received.is.null,payment_received.eq.false')
                .neq('situacao', 2)
                .order('valor_total_pedido', { ascending: false })
                .limit(50);

            if (error) {
                console.error('[CalendarAPI] Error fetching orders:', error);
                return NextResponse.json({ error: 'Erro ao buscar pedidos' }, { status: 500 });
            }

            const orders = (data || []).map((o: any) => ({
                id: o.id,
                numero_pedido: o.numero_pedido,
                numero_pedido_ecommerce: o.numero_pedido_ecommerce,
                cliente_nome: o.cliente_nome,
                valor: Number(o.valor || o.valor_total_pedido || 0),
                canal: o.canal,
                data_criacao: o.data_criacao,
            }));

            return NextResponse.json({
                success: true,
                date: specificDate,
                orders,
                total: orders.length,
            });
        }

        // Query pending orders (not received payment) - using pagination to bypass 1000 limit
        const allOrders = [];
        let page = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            let query = supabaseAdmin
                .from('tiny_orders')
                .select('data_criacao, valor_total_pedido, valor, canal')
                .or('payment_received.is.null,payment_received.eq.false')
                .neq('situacao', 2) // Ignore cancelled
                .range(page * limit, (page + 1) * limit - 1);

            if (dataInicio) {
                query = query.gte('data_criacao', dataInicio);
            }
            if (dataFim) {
                query = query.lte('data_criacao', dataFim);
            }

            const { data, error } = await query;

            if (error) {
                console.error('[CalendarAPI] Error:', error);
                return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
            }

            if (data) {
                allOrders.push(...data);
                if (data.length < limit) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }

        // Group by date
        const groupedByDate: Record<string, { count: number; total: number }> = {};
        const today = new Date().toISOString().split('T')[0];

        allOrders.forEach((order: any) => {
            const dateStr = order.data_criacao?.split('T')[0];
            if (!dateStr) return;

            if (!groupedByDate[dateStr]) {
                groupedByDate[dateStr] = { count: 0, total: 0 };
            }
            groupedByDate[dateStr].count++;
            groupedByDate[dateStr].total += Number(order.valor || order.valor_total_pedido || 0);
        });

        // Add isOverdue flag
        const pendingDates = Object.entries(groupedByDate).map(([date, info]) => ({
            date,
            ordersCount: info.count,
            totalValue: info.total,
            isOverdue: date < today,
        }));

        return NextResponse.json({
            success: true,
            groupedByDate,
            pendingDates,
            totalPending: pendingDates.filter(d => !d.isOverdue).reduce((sum, d) => sum + d.ordersCount, 0),
            totalOverdue: pendingDates.filter(d => d.isOverdue).reduce((sum, d) => sum + d.ordersCount, 0),
        });
    } catch (error) {
        console.error('[CalendarAPI] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
