import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/marketplaces/magalu/orders/db
 * Retorna pedidos do Magalu do banco de dados com paginação e filtros
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const city = searchParams.get('city');
    const state = searchParams.get('state');
    const sortBy = searchParams.get('sort_by') || 'purchased_date';
    const sortOrder = searchParams.get('sort_order') || 'desc';

    const offset = (page - 1) * limit;

    // Construir query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabaseAdmin as any)
      .from('magalu_orders')
      .select('*', { count: 'exact' });

    // Filtros
    if (status) {
      query = query.eq('order_status', status);
    }

    if (search) {
      query = query.or(`id_order.ilike.%${search}%,receiver_name.ilike.%${search}%,customer_mail.ilike.%${search}%`);
    }

    if (dateFrom) {
      query = query.gte('purchased_date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('purchased_date', dateTo);
    }

    if (city) {
      query = query.ilike('delivery_address_city', `%${city}%`);
    }

    if (state) {
      query = query.eq('delivery_address_state', state.toUpperCase());
    }

    // Ordenação e paginação
    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: orders, error, count } = await query;

    if (error) {
      console.error('[Magalu Orders DB] Erro:', error);
      return NextResponse.json(
        { ok: false, error: { message: error.message } },
        { status: 500 }
      );
    }

    // Buscar itens dos pedidos
    const orderIds = orders?.map((o: { id_order: string }) => o.id_order) || [];
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabaseAdmin as any)
      .from('magalu_order_items')
      .select('*')
      .in('id_order', orderIds);

    // Agrupar itens por pedido
    const itemsByOrder = (items || []).reduce((acc: Record<string, unknown[]>, item: { id_order: string }) => {
      if (!acc[item.id_order]) acc[item.id_order] = [];
      acc[item.id_order].push(item);
      return acc;
    }, {});

    // Adicionar itens aos pedidos
    const ordersWithItems = (orders || []).map((order: { id_order: string }) => ({
      ...order,
      items: itemsByOrder[order.id_order] || [],
    }));

    return NextResponse.json({
      ok: true,
      data: {
        orders: ordersWithItems,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[Magalu Orders DB] Erro:', message);
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 }
    );
  }
}
