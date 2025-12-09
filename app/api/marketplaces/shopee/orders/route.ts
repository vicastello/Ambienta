import { NextResponse } from 'next/server';
import { getShopeeOrders, getAllShopeeOrdersForPeriod } from '@/lib/shopeeClient';
import type { ShopeeOrder, ShopeeOrderListResponse, ShopeeOrderStatus } from '@/src/types/shopee';

// Período padrão: 90 dias (conforme instrução)
const DEFAULT_WINDOW_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_PAGE_SIZE = 50;
const SHOPEE_MOCK_MODE = process.env.SHOPEE_MOCK_MODE === 'true';
// Limite de 15 dias da Shopee - se período > 15 dias, usa getAllShopeeOrdersForPeriod
const MAX_SINGLE_REQUEST_DAYS = 15;

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

function getMockShopeeOrders(params: {
  timeFrom: number;
  timeTo: number;
  status?: ShopeeOrderStatus;
  cursor?: string;
  pageSize?: number;
}): ShopeeOrderListResponse {
  const { timeFrom, timeTo, status, cursor, pageSize = DEFAULT_PAGE_SIZE } = params;
  
  // Gerar mais pedidos para simular 90 dias (cerca de 3 pedidos por dia)
  const totalDays = Math.ceil((timeTo - timeFrom) / (24 * 60 * 60));
  const orderCount = Math.min(totalDays * 3, 150); // Máx 150 para não sobrecarregar

  const baseOrders: ShopeeOrder[] = Array.from({ length: orderCount }).map((_, idx) => {
    const orderIndex = idx + 1;
    const createdAt = timeFrom + ((timeTo - timeFrom) / orderCount) * orderIndex;
    const updatedAt = createdAt + 3600;
    const statuses: ShopeeOrderStatus[] = ['UNPAID', 'READY_TO_SHIP', 'COMPLETED', 'CANCELLED', 'PROCESSED'];
    const statusValue = statuses[idx % statuses.length];
    const carriers = ['Shopee Xpress', 'Correios', 'Jadlog', 'Total Express', 'Loggi'];
    const cities = ['São Paulo - SP', 'Rio de Janeiro - RJ', 'Belo Horizonte - MG', 'Curitiba - PR', 'Porto Alegre - RS', 'Salvador - BA', 'Brasília - DF'];

    return {
      order_sn: `SHOP${Date.now().toString(36).toUpperCase()}${orderIndex.toString().padStart(4, '0')}`,
      order_status: statusValue,
      create_time: Math.floor(createdAt),
      update_time: Math.floor(updatedAt),
      total_amount: (Math.round((Math.random() * 350 + 25) * 100) / 100).toString(),
      currency: 'BRL',
      cod: false,
      order_items: [
        {
          item_id: 1000 + orderIndex,
          item_name: `Produto Shopee ${orderIndex}`,
          model_id: 2000 + orderIndex,
          model_name: idx % 3 === 0 ? 'Variação A' : idx % 3 === 1 ? 'Variação B' : 'Padrão',
          item_sku: `SKU-SHP-${orderIndex}`,
          model_sku: `SKU-MODEL-${orderIndex}`,
          variation_original_price: (Math.round((Math.random() * 150 + 30) * 100) / 100).toString(),
          variation_discounted_price: (Math.round((Math.random() * 120 + 20) * 100) / 100).toString(),
          is_wholesale: false,
        },
        ...(idx % 4 === 0 ? [{
          item_id: 3000 + orderIndex,
          item_name: `Produto Extra ${orderIndex}`,
          model_id: 4000 + orderIndex,
          model_name: 'Único',
          item_sku: `SKU-EXT-${orderIndex}`,
          model_sku: `SKU-EXT-MODEL-${orderIndex}`,
          variation_original_price: '49.90',
          variation_discounted_price: '39.90',
          is_wholesale: false,
        }] : []),
      ],
      shipping_carrier: carriers[idx % carriers.length],
      recipient_address: {
        name: `Cliente ${orderIndex}`,
        phone: `11999${orderIndex.toString().padStart(6, '0').slice(0, 6)}`,
        full_address: `Rua das Flores ${orderIndex}, ${100 + idx}, ${cities[idx % cities.length]}`,
      },
    };
  });

  const filtered = status ? baseOrders.filter((o) => o.order_status === status) : baseOrders;

  const startIndex = cursor ? Number(cursor) || 0 : 0;
  const sliced = filtered.slice(startIndex, startIndex + pageSize);
  const nextCursor =
    startIndex + pageSize < filtered.length ? String(startIndex + pageSize) : undefined;

  return {
    orders: sliced,
    has_more: Boolean(nextCursor),
    next_cursor: nextCursor,
  };
}

/**
 * Gera todos os pedidos mock para o período completo (sem paginação)
 */
function getAllMockShopeeOrders(params: {
  timeFrom: number;
  timeTo: number;
  status?: ShopeeOrderStatus;
}): ShopeeOrder[] {
  const result = getMockShopeeOrders({ ...params, pageSize: 1000 });
  return result.orders;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const statusParam = url.searchParams.get('status');
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const pageSizeParam = url.searchParams.get('pageSize');
  const pageSize = pageSizeParam ? Number(pageSizeParam) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE;
  // Se fetchAll=true, busca todos os pedidos do período de uma vez (sem paginação no frontend)
  const fetchAll = url.searchParams.get('fetchAll') === 'true';

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
    const orderStatus = normalizedStatus ? (normalizedStatus as ShopeeOrderStatus) : undefined;

    const periodDays = (timeTo - timeFrom) / (24 * 60 * 60);

    // Modo mock
    if (SHOPEE_MOCK_MODE) {
      if (fetchAll) {
        // Buscar todos os pedidos mock de uma vez
        const allOrders = getAllMockShopeeOrders({ timeFrom, timeTo, status: orderStatus });
        return NextResponse.json({
          ok: true,
          data: {
            orders: allOrders,
            hasMore: false,
            nextCursor: undefined,
            totalLoaded: allOrders.length,
          },
          meta: {
            timeFrom,
            timeTo,
            periodDays: Math.round(periodDays),
            status: orderStatus ?? null,
            mock: true,
            fetchMode: 'all',
          },
        });
      }
      
      // Modo paginado mock
      const mockResponse = getMockShopeeOrders({
        timeFrom,
        timeTo,
        status: orderStatus,
        cursor,
        pageSize,
      });
      return NextResponse.json({
        ok: true,
        data: {
          orders: mockResponse.orders,
          hasMore: mockResponse.has_more,
          nextCursor: mockResponse.next_cursor,
        },
        meta: {
          timeFrom,
          timeTo,
          periodDays: Math.round(periodDays),
          status: orderStatus ?? null,
          mock: true,
          fetchMode: 'paginated',
        },
      });
    }

    // Modo real - Shopee API
    // Se período > 15 dias ou fetchAll=true, usa função que divide em chunks
    const needsChunkedFetch = periodDays > MAX_SINGLE_REQUEST_DAYS || fetchAll;

    if (needsChunkedFetch && !cursor) {
      // Buscar todos os pedidos do período usando chunks de 15 dias
      const allOrders = await getAllShopeeOrdersForPeriod({
        timeFrom,
        timeTo,
        status: orderStatus,
        pageSize,
        fetchDetails: true, // Buscar detalhes completos (itens, endereço)
      });

      return NextResponse.json({
        ok: true,
        data: {
          orders: allOrders,
          hasMore: false,
          nextCursor: undefined,
          totalLoaded: allOrders.length,
        },
        meta: {
          timeFrom,
          timeTo,
          periodDays: Math.round(periodDays),
          status: orderStatus ?? null,
          fetchMode: 'all',
          chunksUsed: Math.ceil(periodDays / MAX_SINGLE_REQUEST_DAYS),
        },
      });
    }

    // Requisição simples (período <= 15 dias ou paginação manual com cursor)
    const shopeeResponse = await getShopeeOrders({
      timeFrom,
      timeTo,
      status: orderStatus,
      cursor,
      pageSize,
    });

    return NextResponse.json({
      ok: true,
      data: {
        orders: shopeeResponse.orders,
        hasMore: shopeeResponse.has_more,
        nextCursor: shopeeResponse.next_cursor,
      },
      meta: {
        timeFrom,
        timeTo,
        periodDays: Math.round(periodDays),
        status: orderStatus ?? null,
        fetchMode: 'paginated',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro inesperado';
    const code = err instanceof BadRequestError ? err.code : undefined;
    if (
      !SHOPEE_MOCK_MODE &&
      !code &&
      typeof message === 'string' &&
      message.toLowerCase().includes('missing shopee')
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            message: 'Shopee não configurado. Gere o access_token após autorizar o app na Shopee.',
            code: 'SHOPEE_NOT_CONFIGURED',
          },
        },
        { status: 503 }
      );
    }

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
