import { NextResponse } from 'next/server';
import { getShopeeOrders } from '@/lib/shopeeClient';
import type { ShopeeOrder, ShopeeOrderListResponse, ShopeeOrderStatus } from '@/src/types/shopee';

const DEFAULT_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_PAGE_SIZE = 50;
const SHOPEE_MOCK_MODE = process.env.SHOPEE_MOCK_MODE === 'true';

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

  const baseOrders: ShopeeOrder[] = Array.from({ length: 15 }).map((_, idx) => {
    const orderIndex = idx + 1;
    const createdAt = timeFrom + ((timeTo - timeFrom) / 15) * orderIndex;
    const updatedAt = createdAt + 3600;
    const statuses: ShopeeOrderStatus[] = ['UNPAID', 'READY_TO_SHIP', 'COMPLETED', 'CANCELLED'];
    const statusValue = statuses[idx % statuses.length];

    return {
      order_sn: `TEST123456789-${orderIndex}`,
      order_status: statusValue,
      create_time: Math.floor(createdAt),
      update_time: Math.floor(updatedAt),
      total_amount: (Math.round((Math.random() * 200 + 20) * 100) / 100).toString(),
      currency: 'BRL',
      cod: false,
      order_items: [
        {
          item_id: 1000 + orderIndex,
          item_name: `Produto Mock ${orderIndex}`,
          model_id: 2000 + orderIndex,
          model_name: 'Padrão',
          item_sku: `SKU-MOCK-${orderIndex}`,
          model_sku: `SKU-MODEL-${orderIndex}`,
          variation_original_price: '99.90',
          variation_discounted_price: '79.90',
          is_wholesale: false,
        },
      ],
      shipping_carrier: orderIndex % 2 === 0 ? 'Shopee Xpress' : 'Correios',
      recipient_address: {
        name: `Cliente Mock ${orderIndex}`,
        phone: `11999${orderIndex.toString().padStart(4, '0')}`,
        full_address: `Rua Exemplo ${orderIndex}, 123, São Paulo - SP`,
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const statusParam = url.searchParams.get('status');
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const pageSizeParam = url.searchParams.get('pageSize');
  const pageSize = pageSizeParam ? Number(pageSizeParam) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE;

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

    const shopeeResponse = SHOPEE_MOCK_MODE
      ? getMockShopeeOrders({
          timeFrom,
          timeTo,
          status: orderStatus,
          cursor,
          pageSize,
        })
      : await getShopeeOrders({
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
        status: orderStatus ?? null,
        ...(SHOPEE_MOCK_MODE ? { mock: true } : {}),
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
