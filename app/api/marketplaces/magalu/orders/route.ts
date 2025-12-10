import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

/**
 * GET /api/marketplaces/magalu/orders
 * Retorna pedidos do Magalu do banco de dados (sincronizados via OAuth)
 * Formato compatível com a página do frontend
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const page = Number(url.searchParams.get('page') || DEFAULT_PAGE);
  const perPage = Math.min(Number(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE), 100);
  const status = url.searchParams.get('status') || undefined;
  const cursor = url.searchParams.get('cursor');
  const pageFromCursor = cursor ? Number(cursor) || page : page;

  try {
    // Verificar se há tokens OAuth configurados
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokens } = await (supabaseAdmin as any)
      .from('magalu_tokens')
      .select('id')
      .eq('id', 1)
      .single();

    if (!tokens) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'MAGALU_NOT_CONFIGURED',
            message: 'Magalu não configurado. Faça login via OAuth na página de configurações.',
          },
        },
        { status: 503 }
      );
    }

    const offset = (pageFromCursor - 1) * perPage;

    // Construir query base
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabaseAdmin as any)
      .from('magalu_orders')
      .select('*', { count: 'exact' });

    // Filtro por status
    if (status && status !== 'ALL') {
      query = query.eq('order_status', status);
    }

    // Ordenar por data de compra (mais recentes primeiro)
    query = query
      .order('purchased_date', { ascending: false })
      .range(offset, offset + perPage - 1);

    const { data: orders, error, count } = await query;

    if (error) {
      console.error('[Magalu Orders] Erro ao buscar pedidos:', error);
      return NextResponse.json(
        {
          ok: false,
          error: { message: error.message },
        },
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
    const itemsByOrder = (items || []).reduce(
      (acc: Record<string, unknown[]>, item: { id_order: string }) => {
        if (!acc[item.id_order]) acc[item.id_order] = [];
        acc[item.id_order].push(item);
        return acc;
      },
      {}
    );

    // Mapear para formato esperado pelo frontend (MagaluOrder interface)
    const mappedOrders = (orders || []).map((order: {
      id_order: string;
      id_order_marketplace: string;
      order_status: string;
      marketplace_name: string;
      store_name: string;
      purchased_date: string;
      approved_date: string | null;
      updated_date: string | null;
      estimated_delivery_date: string | null;
      total_amount: number | null;
      total_freight: number | null;
      total_discount: number | null;
      receiver_name: string | null;
      customer_mail: string | null;
      delivery_address_city: string | null;
      delivery_address_state: string | null;
      delivery_address_full: string | null;
      inserted_date: string | null;
    }) => {
      const orderItems = itemsByOrder[order.id_order] || [];

      return {
        IdOrder: order.id_order,
        IdOrderMarketplace: order.id_order_marketplace,
        OrderStatus: order.order_status,
        MarketplaceName: order.marketplace_name || 'Magalu',
        StoreName: order.store_name || 'Magazine Luiza',
        PurchasedDate: order.purchased_date,
        ApprovedDate: order.approved_date,
        UpdatedDate: order.updated_date,
        EstimatedDeliveryDate: order.estimated_delivery_date,
        InsertedDate: order.inserted_date,
        TotalAmount: order.total_amount?.toString() || '0',
        TotalFreight: order.total_freight?.toString() || '0',
        TotalDiscount: order.total_discount?.toString() || '0',
        ReceiverName: order.receiver_name,
        CustomerMail: order.customer_mail,
        DeliveryAddressCity: order.delivery_address_city,
        DeliveryAddressState: order.delivery_address_state,
        DeliveryAddressFull: order.delivery_address_full,
        Products: orderItems.map((item: {
          id_sku: string;
          product_name: string;
          quantity: number;
          price: number;
          freight: number;
          discount: number;
          id_order_package: number | null;
        }) => ({
          IdSku: item.id_sku,
          Name: item.product_name,
          Quantity: item.quantity,
          Price: item.price?.toString() || '0',
          Freight: item.freight?.toString() || '0',
          Discount: item.discount?.toString() || '0',
          IdOrderPackage: item.id_order_package,
        })),
        Payments: [],
      };
    });

    const total = count || 0;
    const hasMore = pageFromCursor * perPage < total;
    const nextCursor = hasMore ? String(pageFromCursor + 1) : undefined;

    return NextResponse.json({
      ok: true,
      data: {
        orders: mappedOrders,
        hasMore,
        nextCursor,
      },
      meta: {
        page: pageFromCursor,
        perPage,
        total,
        status: status ?? null,
        mock: false,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao buscar pedidos do Magalu.';
    console.error('[Magalu Orders] Erro:', err);
    return NextResponse.json(
      {
        ok: false,
        error: { message },
      },
      { status: 500 }
    );
  }
}
