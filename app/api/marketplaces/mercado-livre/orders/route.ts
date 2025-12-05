import { NextResponse } from 'next/server';
import { listMeliOrders } from '@/lib/mercadoLivreClient';
import type { MeliOrder, MeliOrdersSearchResponse } from '@/src/types/mercadoLivre';

const DEFAULT_PERIOD_DAYS = 30;
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
  const periodDays = Number(url.searchParams.get('periodDays') || DEFAULT_PERIOD_DAYS);
  const status = url.searchParams.get('status') || undefined;
  const cursor = url.searchParams.get('cursor');
  const pageSizeRaw = Number(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const offset = cursor ? Number(cursor) || 0 : 0;

  const now = Date.now();
  const timeToIso = buildIsoDate(now);
  const timeFromIso = buildIsoDate(now - periodDays * 24 * 60 * 60 * 1000);

  const appId = process.env.ML_APP_ID;
  const accessToken = process.env.ML_ACCESS_TOKEN;

  if (!appId || !accessToken) {
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
    const response = MELI_MOCK_MODE
      ? getMockMeliOrders({
          timeFrom: timeFromIso,
          timeTo: timeToIso,
          status,
          offset,
          limit: pageSize,
        })
      : await listMeliOrders({
          accessToken,
          dateFrom: timeFromIso,
          dateTo: timeToIso,
          status,
          offset,
          limit: pageSize,
          recent: true,
        });

    const hasMore = response.paging.offset + response.paging.limit < response.paging.total;
    const nextCursor = hasMore ? String(response.paging.offset + response.paging.limit) : undefined;

    return NextResponse.json({
      ok: true,
      data: {
        orders: response.results,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao buscar pedidos do Mercado Livre.';
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'ML_API_ERROR',
          message: 'Falha ao consultar pedidos no Mercado Livre',
          details: message,
        },
      },
      { status: 502 }
    );
  }
}
