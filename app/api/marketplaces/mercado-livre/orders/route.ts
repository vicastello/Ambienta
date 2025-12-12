import { NextResponse } from 'next/server';
import { listMeliOrders } from '@/lib/mercadoLivreClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { MeliOrder, MeliOrderItem, MeliOrdersSearchResponse } from '@/src/types/mercadoLivre';
import { extractMeliSku } from '@/src/types/mercadoLivre';

const DEFAULT_PERIOD_DAYS = 3;
const DEFAULT_PAGE_SIZE = 50;
const MELI_MOCK_MODE = process.env.ML_MOCK_MODE === 'true';

function buildIsoDate(timestampMs: number) {
  return new Date(timestampMs).toISOString();
}

function getMockMeliOrders(params: {
  timeFrom: string;
  timeTo: string;
  status?: string;
  offset: number;
  limit: number;
}): MeliOrdersSearchResponse {
  const { offset, limit } = params;
  const baseOrders: MeliOrder[] = Array.from({ length: 20 }).map((_, idx) => {
    const id = 100000 + idx + 1;
    const created = new Date(Date.now() - idx * 3600 * 1000).toISOString();
    const statuses = ['paid', 'ready_to_ship', 'cancelled', 'shipped', 'delivered'];
    const status = statuses[idx % statuses.length];
    const city = idx % 2 === 0 ? 'São Paulo' : 'Rio de Janeiro';
    const state = idx % 2 === 0 ? 'SP' : 'RJ';
    const total = Math.round((Math.random() * 200 + 50) * 100) / 100;
    return {
      id,
      status,
      date_created: created,
      date_closed: null,
      total_amount: total,
      currency_id: 'BRL',
      buyer: { id: 5000 + idx, nickname: `cliente_meli_${idx}` },
      order_items: [
        {
          item: { id: `MLB${id}`, title: `Produto Mock ${idx + 1}` },
          quantity: 1,
          unit_price: total,
          currency_id: 'BRL',
        },
      ],
      shipping: {
        shipping_mode: idx % 2 === 0 ? 'me2' : 'custom',
        receiver_address: {
          city: { name: city },
          state: { id: state, name: state },
        },
      },
    };
  });

  const sliced = baseOrders.slice(offset, offset + limit);
  const hasMore = offset + limit < baseOrders.length;
  return {
    query: '',
    results: sliced,
    paging: {
      total: baseOrders.length,
      offset,
      limit,
    },
    has_more: hasMore,
  } as unknown as MeliOrdersSearchResponse & { has_more?: boolean };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const periodDaysParam = url.searchParams.get('periodDays') ?? String(DEFAULT_PERIOD_DAYS);
  const periodDays = Number.isNaN(Number(periodDaysParam)) ? DEFAULT_PERIOD_DAYS : Number(periodDaysParam);
  const status = url.searchParams.get('status') || undefined;
  const cursor = url.searchParams.get('cursor');
  const pageSizeParam = url.searchParams.get('pageSize');
  const rawPageSize = pageSizeParam ? Number(pageSizeParam) : DEFAULT_PAGE_SIZE;
  const MAX_LIMIT = 50;
  const limit = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, MAX_LIMIT) : DEFAULT_PAGE_SIZE;
  const offset = cursor ? Number(cursor) || 0 : 0;

  const timeTo = new Date();
  const timeFrom = new Date(timeTo);
  timeFrom.setDate(timeTo.getDate() - periodDays);
  const toMeliDate = (d: Date) => `${d.toISOString().split('.')[0]}.000Z`;
  const dateFrom = toMeliDate(timeFrom);
  const dateTo = toMeliDate(timeTo);
  const timeFromIso = timeFrom.toISOString();
  const timeToIso = timeTo.toISOString();

  const appId = process.env.ML_APP_ID;
  const envAccessToken = process.env.ML_ACCESS_TOKEN?.trim();
  const envRefreshToken = process.env.ML_REFRESH_TOKEN?.trim();
  const sellerId = process.env.ML_SELLER_ID ?? '571389990';

  if (!appId || !envAccessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'ML_NOT_CONFIGURED',
          message:
            'Mercado Livre não configurado. Defina ML_APP_ID e ML_ACCESS_TOKEN após completar o OAuth.',
        },
      },
      { status: 503 }
    );
  }

  try {
    // Buscar token do banco; fallback para env
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokenRow } = await (supabaseAdmin as any)
      .from('meli_tokens')
      .select('*')
      .eq('id', 1)
      .single();

    const accessToken = tokenRow?.access_token || envAccessToken;
    const refreshToken = tokenRow?.refresh_token || envRefreshToken;

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'ML_NOT_CONFIGURED',
            message: 'Token do Mercado Livre ausente. Faça o OAuth ou configure ML_ACCESS_TOKEN.',
          },
        },
        { status: 503 }
      );
    }

    const paramsDebug = {
      offset,
      limit,
      status: status || null,
      periodDays,
      timeFrom: timeFromIso,
      timeTo: timeToIso,
      sellerId,
      tokenSource: tokenRow ? 'db' : 'env',
    };
    console.log('[ML Orders API] Calling listMeliOrders with:', paramsDebug);

    const response = MELI_MOCK_MODE
      ? getMockMeliOrders({
          timeFrom: timeFromIso,
          timeTo: timeToIso,
          status,
          offset,
          limit,
        })
      : await listMeliOrders({
          accessToken,
          sellerId,
          dateFrom,
          dateTo,
          status,
          offset,
          limit,
          recent: true,
          refreshToken,
          onTokenRefreshed: async (tokens) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabaseAdmin as any)
              .from('meli_tokens')
              .upsert({
                id: 1,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token ?? tokenRow?.refresh_token ?? envRefreshToken,
                expires_at: tokens.expires_at ?? null,
                updated_at: new Date().toISOString(),
              });
          },
        });

    const hasMore = response.paging.offset + response.paging.limit < response.paging.total;
    const nextCursor = hasMore ? String(response.paging.offset + response.paging.limit) : undefined;

    const orders = response.results.map((order) => ({
      ...order,
      items: order.order_items.map((oi: MeliOrderItem) => ({
        id: oi.item.id,
        title: oi.item.title,
        quantity: oi.quantity,
        unit_price: oi.unit_price,
        sku: extractMeliSku(oi),
      })),
    }));

    return NextResponse.json({
      ok: true,
      data: {
        orders,
        hasMore,
        nextCursor,
      },
      meta: {
        timeFrom: timeFromIso,
        timeTo: timeToIso,
        status: status ?? null,
        mock: MELI_MOCK_MODE || undefined,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string; response?: unknown };
    console.error('[ML Orders API] Error while fetching orders from Mercado Livre', {
      message: err?.message,
      stack: err?.stack,
      response: err?.response,
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'ML_API_ERROR',
          message: 'Falha ao consultar pedidos no Mercado Livre',
          details: {
            message: err?.message ?? null,
            stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
          },
        },
      },
      { status: 502 }
    );
  }
}
