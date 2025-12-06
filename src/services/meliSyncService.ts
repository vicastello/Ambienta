import { listMeliOrders } from '@/lib/mercadoLivreClient';
import { upsertMeliOrderItems } from '@/src/repositories/meliOrderItemsRepository';
import { upsertMeliOrders } from '@/src/repositories/meliOrdersRepository';
import type { MeliOrderItemsInsert, MeliOrdersInsert } from '@/src/types/db-public';
import { extractMeliSku, type MeliOrder, type MeliOrderItem } from '@/src/types/mercadoLivre';

export interface MeliSyncParams {
  sellerId: string;
  accessToken: string;
  periodDays: number;
  pageLimit?: number;
  pageSize?: number;
}

export interface MeliSyncResult {
  ordersUpserted: number;
  itemsUpserted: number;
  pagesFetched: number;
}

/**
 * Sync usage (manual):
 * curl -X POST http://localhost:3000/api/marketplaces/mercado-livre/sync \
 *   -H "Content-Type: application/json" \
 *   -d '{"periodDays":3,"pageLimit":2,"pageSize":50}'
 *
 * periodDays: quantos dias para trás buscar (define date_from/date_to).
 * pageLimit: quantas páginas paginadas (offset/limit) serão buscadas.
 * pageSize: tamanho de página (máx. 50 na API do ML).
 * Persiste em public.meli_orders e public.meli_order_items via repositórios.
 *
 * ---------------------------------------------------------------------------
 * Local validation checklist (Supabase local):
 * 1) Reset local DB with all migrations:
 *    supabase stop --all
 *    supabase start
 *    supabase db reset
 *    (confirme que 20251212123000_meli_cron_sync.sql aplicou sem erros)
 *
 * 2) Run dev pointing to local Supabase (already set in .env.local):
 *    npm run dev -- -H 0.0.0.0
 *
 * 3) Populate recent orders via sync (fills buyer_full_name, buyer_email,
 *    shipping_city, shipping_state in meli_orders):
 *    curl -X POST "http://0.0.0.0:3000/api/marketplaces/mercado-livre/sync" \
 *      -H "Content-Type: application/json" \
 *      -d '{"periodDays":7,"pageLimit":3,"pageSize":50}'
 *
 *    - periodDays: quantos dias para trás buscar (date_from/date_to).
 *    - pageLimit: quantas páginas da API serão percorridas.
 *    - pageSize: tamanho de página (máx. 50 no ML).
 *
 * 4) Validar leitura e UI:
 *    GET http://0.0.0.0:3000/api/marketplaces/mercado-livre/orders/db?periodDays=7&pageSize=50
 *    Abrir http://0.0.0.0:3000/marketplaces/mercado-livre e conferir cliente/cidade/UF.
 * ---------------------------------------------------------------------------
 */

export async function syncMeliOrdersToSupabase(params: MeliSyncParams): Promise<MeliSyncResult> {
  const timeTo = new Date();
  const timeFrom = new Date(timeTo);
  timeFrom.setDate(timeTo.getDate() - params.periodDays);

  const dateFrom = timeFrom.toISOString();
  const dateTo = timeTo.toISOString();

  const pageSize = Math.min(params.pageSize ?? 50, 50);
  const maxPages = params.pageLimit ?? 3;

  let offset = 0;
  let page = 0;
  let totalOrdersUpserted = 0;
  let totalItemsUpserted = 0;

  while (page < maxPages) {
    const result = await listMeliOrders({
      accessToken: params.accessToken,
      sellerId: params.sellerId,
      offset,
      limit: pageSize,
      dateFrom,
      dateTo,
    });

    const ordersApi = result.results ?? [];
    if (!ordersApi.length) break;

    const ordersInserts: MeliOrdersInsert[] = ordersApi.map((order: MeliOrder) => {
      const buyerFirst = order.buyer?.first_name?.trim() ?? '';
      const buyerLast = order.buyer?.last_name?.trim() ?? '';
      const nick = order.buyer?.nickname?.trim() ?? null;
      const buyerFullName = `${buyerFirst} ${buyerLast}`.trim() || nick || null;
      const shippingCity =
        (order.shipping as any)?.receiver_address?.city?.name ??
        (order.shipping as any)?.receiver_address?.city?.id ??
        null;
      const shippingState =
        (order.shipping as any)?.receiver_address?.state?.name ??
        (order.shipping as any)?.receiver_address?.state?.id ??
        null;

      return {
        meli_order_id: typeof order.id === 'string' ? Number(order.id) : order.id,
        seller_id: (order as any).seller?.id ?? Number(params.sellerId),
        status: order.status,
        date_created: order.date_created,
        last_updated:
          (order as any).date_last_updated ??
          order.date_closed ??
          order.date_created,
        currency_id: order.currency_id,
        total_amount: String(order.total_amount ?? 0),
        total_amount_with_shipping:
          (order as any).total_amount_with_shipping != null
            ? String((order as any).total_amount_with_shipping)
            : null,
        shipping_cost:
          (order as any).total_shipping != null
            ? String((order as any).total_shipping)
            : null,
        buyer_id: order.buyer?.id ?? null,
        buyer_nickname: order.buyer?.nickname ?? null,
        buyer_full_name: buyerFullName,
        buyer_email: order.buyer?.email ?? null,
        shipping_city: shippingCity,
        shipping_state: shippingState,
        tags: (order as any).tags ?? null,
        raw_payload: order as any,
      };
    });

    const itemsInserts: MeliOrderItemsInsert[] = [];
    for (const order of ordersApi) {
      for (const oi of (order.order_items as MeliOrderItem[]) ?? []) {
        const rawItem = oi.item;
        const pictureFromArray =
          rawItem?.pictures && rawItem.pictures.length > 0
            ? rawItem.pictures[0]?.secure_url || rawItem.pictures[0]?.url || null
            : null;
        const itemThumbnail =
          pictureFromArray ||
          rawItem?.secure_thumbnail?.trim() ||
          rawItem?.thumbnail?.trim() ||
          null;
        itemsInserts.push({
          meli_order_id: typeof order.id === 'string' ? Number(order.id) : order.id,
          item_id: oi.item.id,
          title: oi.item.title,
          sku: extractMeliSku(oi),
          quantity: oi.quantity,
          unit_price: String(oi.unit_price),
          currency_id: oi.currency_id,
          category_id: oi.item.category_id ?? null,
          variation_id: oi.item.variation_id ? String(oi.item.variation_id) : null,
          item_thumbnail_url: itemThumbnail,
          raw_payload: oi as any,
        });
      }
    }

    await upsertMeliOrders(ordersInserts);
    await upsertMeliOrderItems(itemsInserts);

    totalOrdersUpserted += ordersInserts.length;
    totalItemsUpserted += itemsInserts.length;

    offset += pageSize;
    page += 1;

    if (!result.paging || offset >= (result.paging.total ?? 0)) {
      break;
    }
  }

  console.log('[MeliSync] Sync finished', {
    periodDays: params.periodDays,
    totalOrdersUpserted,
    totalItemsUpserted,
    pagesFetched: page,
  });

  return {
    ordersUpserted: totalOrdersUpserted,
    itemsUpserted: totalItemsUpserted,
    pagesFetched: page,
  };
}
