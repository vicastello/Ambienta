import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { ShopeeOrder, ShopeeOrderStatus, ShopeeOrderItem } from '@/src/types/shopee';
import type { ShopeeOrdersRow, ShopeeOrderItemsRow } from '@/src/types/db-public';

const DEFAULT_WINDOW_SECONDS = 90 * 24 * 60 * 60; // 90 dias
const DEFAULT_PAGE_SIZE = 100;

class BadRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const VALID_STATUSES: ShopeeOrderStatus[] = [
  'UNPAID',
  'READY_TO_SHIP',
  'PROCESSED',
  'COMPLETED',
  'CANCELLED',
  'TO_RETURN',
  'IN_CANCEL',
];

function isShopeeOrderStatus(value: string | null): value is ShopeeOrderStatus {
  if (!value) return false;
  return VALID_STATUSES.includes(value as ShopeeOrderStatus);
}

function parseTimeParam(value: string | null): number | undefined {
  if (!value) return undefined;

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return Math.floor(asNumber);
  }

  const parsedMs = Date.parse(value);
  if (!Number.isNaN(parsedMs)) {
    return Math.floor(parsedMs / 1000);
  }

  throw new BadRequestError(`Parâmetro de data inválido: ${value}`, 'INVALID_TIME');
}

// Converte registro do banco para formato esperado pelo frontend
function dbRowToShopeeOrder(row: ShopeeOrdersRow, items: ShopeeOrderItemsRow[]): ShopeeOrder {
  return {
    order_sn: row.order_sn,
    order_status: row.order_status as ShopeeOrderStatus,
    create_time: Math.floor(new Date(row.create_time).getTime() / 1000),
    update_time: Math.floor(new Date(row.update_time).getTime() / 1000),
    total_amount: String(row.total_amount),
    currency: row.currency || 'BRL',
    cod: row.cod || false,
    shipping_carrier: row.shipping_carrier,
    recipient_address: {
      name: row.recipient_name || '',
      phone: row.recipient_phone || '',
      full_address: row.recipient_full_address || '',
    },
    order_items: items.map((item) => ({
      item_id: item.item_id,
      model_id: item.model_id || 0,
      item_name: item.item_name,
      model_name: item.model_name || '',
      item_sku: item.item_sku,
      model_sku: item.model_sku,
      variation_original_price: String(item.original_price || '0'),
      variation_discounted_price: String(item.discounted_price || '0'),
      is_wholesale: item.is_wholesale || false,
    })),
  };
}

/**
 * GET /api/marketplaces/shopee/orders/db
 * Busca pedidos da Shopee do banco de dados (Supabase)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const statusParam = url.searchParams.get('status');
  const pageSizeParam = url.searchParams.get('pageSize');
  const pageSize = pageSizeParam ? Number(pageSizeParam) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE;
  const offsetParam = url.searchParams.get('offset');
  const offset = offsetParam ? Number(offsetParam) || 0 : 0;

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const timeTo = parseTimeParam(toParam) ?? nowSeconds;
    const timeFrom = parseTimeParam(fromParam) ?? timeTo - DEFAULT_WINDOW_SECONDS;

    if (timeFrom >= timeTo) {
      throw new BadRequestError('Intervalo inválido: from deve ser menor que to', 'INVALID_RANGE');
    }

    const normalizedStatus = statusParam?.toUpperCase() ?? null;
    if (normalizedStatus && !isShopeeOrderStatus(normalizedStatus)) {
      throw new BadRequestError('Status de pedido inválido', 'INVALID_STATUS');
    }

    const periodDays = Math.round((timeTo - timeFrom) / (24 * 60 * 60));
    const dateFrom = new Date(timeFrom * 1000).toISOString();
    const dateTo = new Date(timeTo * 1000).toISOString();

    // Construir query - usando any para contornar tipagem até migrations serem aplicadas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabaseAdmin as any)
      .from('shopee_orders')
      .select('*', { count: 'exact' })
      .gte('create_time', dateFrom)
      .lte('create_time', dateTo)
      .order('create_time', { ascending: false });

    if (normalizedStatus) {
      query = query.eq('order_status', normalizedStatus);
    }

    // Executar query com paginação
    const { data: ordersRaw, error: ordersError, count: totalCount } = await query
      .range(offset, offset + pageSize - 1);
    
    const orders = ordersRaw as ShopeeOrdersRow[] | null;

    if (ordersError) {
      console.error('[Shopee DB] Erro ao buscar pedidos:', ordersError);
      throw new Error(`Erro ao buscar pedidos: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      // Verificar se é porque não há dados ou Shopee não configurada
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: totalInDb } = await (supabaseAdmin as any)
        .from('shopee_orders')
        .select('*', { count: 'exact', head: true });

      if (!totalInDb || totalInDb === 0) {
        return NextResponse.json({
          ok: true,
          data: {
            orders: [],
            hasMore: false,
            nextOffset: undefined,
            totalCount: 0,
          },
          meta: {
            timeFrom,
            timeTo,
            periodDays,
            status: normalizedStatus ?? null,
            source: 'db',
            needsInitialSync: true,
          },
        });
      }

      return NextResponse.json({
        ok: true,
        data: {
          orders: [],
          hasMore: false,
          nextOffset: undefined,
          totalCount: 0,
        },
        meta: {
          timeFrom,
          timeTo,
          periodDays,
          status: normalizedStatus ?? null,
          source: 'db',
        },
      });
    }

    // Buscar itens dos pedidos
    const orderSns = orders.map((o) => o.order_sn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allItemsRaw, error: itemsError } = await (supabaseAdmin as any)
      .from('shopee_order_items')
      .select('*')
      .in('order_sn', orderSns);
    
    const allItems = allItemsRaw as ShopeeOrderItemsRow[] | null;

    if (itemsError) {
      console.error('[Shopee DB] Erro ao buscar itens:', itemsError);
    }

    // Agrupar itens por order_sn
    const itemsByOrder = new Map<string, ShopeeOrderItemsRow[]>();
    for (const item of allItems || []) {
      const orderItems = itemsByOrder.get(item.order_sn) || [];
      orderItems.push(item);
      itemsByOrder.set(item.order_sn, orderItems);
    }

    // Converter para formato do frontend
    const formattedOrders: ShopeeOrder[] = orders.map((order) => {
      const items = itemsByOrder.get(order.order_sn) || [];
      return dbRowToShopeeOrder(order, items);
    });

    const hasMore = (totalCount || 0) > offset + orders.length;
    const nextOffset = hasMore ? offset + pageSize : undefined;

    return NextResponse.json({
      ok: true,
      data: {
        orders: formattedOrders,
        hasMore,
        nextOffset,
        totalCount: totalCount || 0,
      },
      meta: {
        timeFrom,
        timeTo,
        periodDays,
        status: normalizedStatus ?? null,
        source: 'db',
        pageSize,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro inesperado';
    const code = err instanceof BadRequestError ? err.code : undefined;
    const status = err instanceof BadRequestError ? 400 : 500;

    return NextResponse.json(
      {
        ok: false,
        error: {
          message,
          ...(code ? { code } : {}),
        },
      },
      { status }
    );
  }
}
