import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { MeliOrderItemsRow, MeliOrdersRow } from '@/src/types/db-public';

export async function GET(req: NextRequest) {
  try {
    console.log('[ML Orders DB API] START', { url: req.url });

    const { searchParams } = new URL(req.url);
    const periodDaysParam = searchParams.get('periodDays') ?? '30';
    const rawPeriodDays = Number(periodDaysParam);
    const periodDays = Number.isFinite(rawPeriodDays) && rawPeriodDays > 0 ? rawPeriodDays : 30;

    const statusParam = searchParams.get('status');
    const cursorParam = searchParams.get('cursor');
    const pageSizeParam = searchParams.get('pageSize');

    const rawPageSize = pageSizeParam ? Number(pageSizeParam) : 50;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 50;
    const offset = cursorParam ? Number(cursorParam) || 0 : 0;

    const now = new Date();
    const timeTo = now;
    const timeFrom = new Date(now);
    timeFrom.setDate(now.getDate() - periodDays);

    const fromIso = timeFrom.toISOString();
    const toIso = timeTo.toISOString();

    const sellerIdEnv = process.env.ML_SELLER_ID ?? '571389990';
    const sellerId = Number(sellerIdEnv);
    if (!Number.isFinite(sellerId)) {
      console.error('[ML Orders DB API] Invalid sellerId from env:', sellerIdEnv);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'ML_DB_CONFIG_ERROR',
            message: 'Configuração inválida de ML_SELLER_ID',
          },
        },
        { status: 500 },
      );
    }

    console.log('[ML Orders DB API] Query params:', {
      periodDays,
      statusParam,
      pageSize,
      offset,
      sellerId,
      fromIso,
      toIso,
    });

    // Buscar pedidos com paginação
    let ordersQuery = supabaseAdmin
      .from('meli_orders')
      .select('*')
      .eq('seller_id', sellerId)
      .gte('date_created', fromIso)
      .lte('date_created', toIso)
      .order('date_created', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (statusParam && statusParam !== 'ALL') {
      ordersQuery = ordersQuery.eq('status', statusParam);
    }

    const { data: ordersData, error: ordersError } = await ordersQuery;
    if (ordersError) {
      console.error('[ML Orders DB API] Supabase orders error', ordersError);
      throw ordersError;
    }

    const orders = (ordersData ?? []) as unknown as MeliOrdersRow[];

    if (!orders.length) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            orders: [],
            hasMore: false,
            nextCursor: null,
          },
          meta: {
            timeFrom: fromIso,
            timeTo: toIso,
            status: statusParam || null,
            source: 'supabase',
          },
        },
        { status: 200 },
      );
    }

    const orderIds = orders.map((o) => o.meli_order_id);
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from('meli_order_items')
      .select('*')
      .in('meli_order_id', orderIds);

    if (itemsError) {
      console.error('[ML Orders DB API] Supabase items error', itemsError);
      throw itemsError;
    }

    const items = (itemsData ?? []) as unknown as MeliOrderItemsRow[];
    const itemsByOrderId = new Map<number, MeliOrderItemsRow[]>();
    for (const item of items) {
      const list = itemsByOrderId.get(item.meli_order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.meli_order_id, list);
    }

    const ordersWithItems = orders.map((order) => {
      const raw = (order.raw_payload ?? {}) as Record<string, unknown>;
      const shippingPayload = (raw.shipping ?? null) as {
        id?: unknown;
        shipping_mode?: unknown;
        receiver_address?: {
          city?: { id?: string | null; name?: string | null } | string | null;
          state?: { id?: string | null; name?: string | null } | string | null;
          address_line?: string | null;
          receiver_name?: string | null;
        };
      } | null;
      const receiver = shippingPayload?.receiver_address ?? {};
      const buyerRaw = (raw.buyer ?? {}) as {
        first_name?: string | null;
        last_name?: string | null;
        nickname?: string | null;
        email?: string | null;
      };
      const buyerNamesJoined = [buyerRaw.first_name, buyerRaw.last_name].filter(Boolean).join(' ').trim();
      const buyerFullName =
        order.buyer_full_name ??
        (buyerNamesJoined ? buyerNamesJoined : null) ??
        receiver?.receiver_name ??
        null;
      const cityField = receiver?.city as string | { id?: string | null; name?: string | null; value_name?: string | null } | undefined;
      const stateField = receiver?.state as string | { id?: string | null; name?: string | null } | undefined;
      const shippingCity =
        order.shipping_city ??
        (typeof cityField === 'string' ? cityField : cityField?.name) ??
        (typeof cityField === 'string' ? undefined : cityField?.id) ??
        (typeof cityField === 'string' ? undefined : cityField?.value_name) ??
        receiver?.address_line ??
        null;
      const shippingState =
        order.shipping_state ??
        (typeof stateField === 'string' ? stateField : stateField?.name) ??
        (typeof stateField === 'string' ? undefined : stateField?.id) ??
        null;

      // group duplicated rows (same SKU/variation) summing quantity to avoid double counting
      const rawItems = itemsByOrderId.get(order.meli_order_id) ?? [];
      const grouped = new Map<string, MeliOrderItemsRow & { quantity: number }>();
      rawItems.forEach((it) => {
        const key = `${it.item_id}-${it.variation_id ?? ''}-${it.sku ?? ''}`;
        const current = grouped.get(key);
        if (current) {
          current.quantity += Number(it.quantity) || 0;
        } else {
          grouped.set(key, { ...it, quantity: Number(it.quantity) || 0 });
        }
      });
      const normalizedItems = Array.from(grouped.values());

      return {
        id: order.meli_order_id,
        status: order.status,
        date_created: order.date_created,
        date_closed: order.last_updated,
        total_amount: Number(order.total_amount ?? 0),
        currency_id: order.currency_id,
        buyer: {
          id: order.buyer_id ?? 0,
          nickname: order.buyer_nickname ?? buyerRaw.nickname ?? '',
          full_name: buyerFullName,
          email: order.buyer_email ?? buyerRaw.email ?? null,
        },
        tags: order.tags ?? null,
        shipping: shippingPayload
          ? {
              id: shippingPayload.id ?? null,
              shipping_mode: shippingPayload.shipping_mode ?? null,
              receiver_address: {
                city: {
                  name: shippingCity,
                },
                state: {
                  id: typeof stateField === 'string' ? stateField : stateField?.id ?? null,
                  name: shippingState,
                },
              },
            }
          : shippingCity || shippingState
              ? {
                  id: null,
                  shipping_mode: null,
                  receiver_address: {
                    city: { name: shippingCity },
                    state: {
                      id: typeof stateField === 'string' ? stateField : stateField?.id ?? null,
                      name: shippingState,
                    },
                  },
                }
              : undefined,
        order_items: normalizedItems.map((it) => ({
          item: {
            id: it.item_id,
            title: it.title,
            category_id: it.category_id,
            variation_id: it.variation_id,
            seller_sku: it.sku,
          },
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price ?? 0),
          currency_id: it.currency_id,
          item_thumbnail_url: it.item_thumbnail_url ?? null,
        })),
      };
    });

    const hasMore = orders.length === pageSize;
    const nextCursor = hasMore ? String(offset + pageSize) : null;

    return NextResponse.json(
      {
        ok: true,
        data: {
          orders: ordersWithItems,
          hasMore,
          nextCursor,
        },
        meta: {
          timeFrom: fromIso,
          timeTo: toIso,
          status: statusParam || null,
          source: 'supabase',
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string };
    console.error('[ML Orders DB API] FATAL ERROR', {
      message: err?.message,
      stack: err?.stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'ML_DB_ERROR',
          message: 'Falha ao ler pedidos do Mercado Livre no Supabase',
          details: {
            message: err?.message ?? null,
          },
        },
      },
      { status: 500 },
    );
  }
}
