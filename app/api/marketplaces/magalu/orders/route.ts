import { NextResponse } from 'next/server';
import { listMagaluOrders } from '@/lib/magaluClient';
import type { MagaluOrder } from '@/src/types/magalu';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAGALU_MOCK_MODE = process.env.MAGALU_MOCK_MODE === 'true';

function getMockMagaluOrders(params: { page: number; perPage: number; status?: string }) {
  const { page, perPage, status } = params;
  const baseOrders: MagaluOrder[] = Array.from({ length: 30 }).map((_, idx) => {
    const id = 200000 + idx + 1;
    const statuses = ['approved', 'ready_to_ship', 'shipped', 'delivered', 'canceled'];
    const orderStatus = statuses[idx % statuses.length];
    const total = Math.round((Math.random() * 200 + 80) * 100) / 100;
    return {
      OrderStatus: orderStatus,
      IdOrder: `MG-${id}`,
      EstimatedDeliveryDate: new Date(Date.now() + idx * 86400000).toISOString(),
      TotalAmount: total.toString(),
      TotalFreight: '19.90',
      TotalDiscount: '0',
      ApprovedDate: new Date(Date.now() - idx * 3600 * 1000).toISOString(),
      ReceiverName: `Cliente Magalu ${idx + 1}`,
      CustomerMail: `cliente${idx + 1}@example.com`,
      IdOrderMarketplace: `MLG-${id}`,
      InsertedDate: new Date(Date.now() - idx * 7200 * 1000).toISOString(),
      PurchasedDate: new Date(Date.now() - idx * 7200 * 1000).toISOString(),
      UpdatedDate: new Date(Date.now() - idx * 1800 * 1000).toISOString(),
      MarketplaceName: 'Magalu',
      StoreName: 'Loja Ambienta',
      DeliveryAddressCity: idx % 2 === 0 ? 'São Paulo' : 'Belo Horizonte',
      DeliveryAddressState: idx % 2 === 0 ? 'SP' : 'MG',
      Products: [
        {
          IdSku: `SKU-${id}`,
          Quantity: 1,
          Price: total.toString(),
          Freight: '19.90',
          Discount: '0',
          IdOrderPackage: 1,
        },
      ],
      Payments: [
        {
          Name: 'credit_card',
          Installments: 2,
          Amount: total,
        },
      ],
    };
  });

  const filtered = status ? baseOrders.filter((o) => o.OrderStatus === status) : baseOrders;
  const start = (page - 1) * perPage;
  const sliced = filtered.slice(start, start + perPage);
  return {
    Orders: sliced,
    Page: page,
    PerPage: perPage,
    Total: filtered.length,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get('page') || DEFAULT_PAGE);
  const perPage = Number(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE);
  const status = url.searchParams.get('status') || undefined;
  const cursor = url.searchParams.get('cursor');
  const pageFromCursor = cursor ? Number(cursor) || page : page;

  if (!process.env.MAGALU_ACCESS_TOKEN && !MAGALU_MOCK_MODE) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'MAGALU_NOT_CONFIGURED',
          message: 'Magalu não configurado. Complete o fluxo OAuth em /marketplaces/magalu para obter o access token.',
        },
      },
      { status: 503 }
    );
  }

  try {
    const response = MAGALU_MOCK_MODE
      ? getMockMagaluOrders({ page: pageFromCursor, perPage, status })
      : await listMagaluOrders({
          page: pageFromCursor,
          perPage,
          status,
        });

    const hasMore = response.Page * response.PerPage < response.Total;
    const nextCursor = hasMore ? String(response.Page + 1) : undefined;

    return NextResponse.json({
      ok: true,
      data: {
        orders: response.Orders,
        hasMore,
        nextCursor,
      },
      meta: {
        page: response.Page,
        perPage: response.PerPage,
        status: status ?? null,
        mock: MAGALU_MOCK_MODE || undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao buscar pedidos do Magalu.';
    return NextResponse.json(
      {
        ok: false,
        error: {
          message,
        },
      },
      { status: 500 }
    );
  }
}
