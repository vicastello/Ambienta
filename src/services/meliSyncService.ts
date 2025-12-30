import { getMeliOrder, listMeliOrders } from '@/lib/mercadoLivreClient';
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
  includeDetails?: boolean;
  detailConcurrency?: number;
  detailDelayMs?: number;
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
  const includeDetails = params.includeDetails ?? params.periodDays <= 7;
  const detailConcurrency = Math.max(1, params.detailConcurrency ?? 4);
  const detailDelayMs = Math.max(0, params.detailDelayMs ?? 200);

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

    const detailsById =
      includeDetails && ordersApi.length > 0
        ? await fetchMeliOrderDetails(
            ordersApi.map((order) => order.id),
            params.accessToken,
            detailConcurrency,
            detailDelayMs,
          )
        : new Map<string, Record<string, unknown>>();

    const ordersInserts: MeliOrdersInsert[] = ordersApi.map((order: MeliOrder) => {
      const detail = detailsById.get(String(order.id));
      const source = (detail ?? order) as MeliOrder;
      const buyerFirst = source.buyer?.first_name?.trim() ?? '';
      const buyerLast = source.buyer?.last_name?.trim() ?? '';
      const nick = source.buyer?.nickname?.trim() ?? null;
      const buyerFullName = `${buyerFirst} ${buyerLast}`.trim() || nick || null;
      const shippingCity =
        (source.shipping as any)?.receiver_address?.city?.name ??
        (source.shipping as any)?.receiver_address?.city?.id ??
        null;
      const shippingState =
        (source.shipping as any)?.receiver_address?.state?.name ??
        (source.shipping as any)?.receiver_address?.state?.id ??
        null;

      return {
        meli_order_id: typeof source.id === 'string' ? Number(source.id) : source.id,
        seller_id: (source as any).seller?.id ?? Number(params.sellerId),
        status: source.status,
        date_created: source.date_created,
        last_updated:
          (source as any).date_last_updated ??
          source.date_closed ??
          source.date_created,
        currency_id: source.currency_id,
        total_amount: Number(source.total_amount ?? 0),
        total_amount_with_shipping:
          (source as any).total_amount_with_shipping != null
            ? Number((source as any).total_amount_with_shipping)
            : null,
        shipping_cost:
          (source as any).total_shipping != null
            ? Number((source as any).total_shipping)
            : null,
        buyer_id: source.buyer?.id ?? null,
        buyer_nickname: source.buyer?.nickname ?? null,
        buyer_full_name: buyerFullName,
        buyer_email: source.buyer?.email ?? null,
        shipping_city: shippingCity,
        shipping_state: shippingState,
        tags: (source as any).tags ?? null,
        raw_payload: (detail ?? order) as any,
      };
    });

    const itemsInserts: MeliOrderItemsInsert[] = [];
    for (const order of ordersApi) {
      const detail = detailsById.get(String(order.id));
      const source = (detail ?? order) as MeliOrder;
      for (const oi of (source.order_items as MeliOrderItem[]) ?? []) {
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
          meli_order_id: typeof source.id === 'string' ? Number(source.id) : source.id,
          item_id: oi.item.id,
          title: oi.item.title,
          sku: extractMeliSku(oi),
          quantity: oi.quantity,
          unit_price: Number(oi.unit_price),
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

async function fetchMeliOrderDetails(
  orderIds: Array<string | number>,
  accessToken: string,
  concurrency: number,
  delayMs: number,
): Promise<Map<string, Record<string, unknown>>> {
  const uniqueIds = Array.from(new Set(orderIds.map((id) => String(id))));
  const results = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const batch = uniqueIds.slice(i, i + concurrency);
    const responses = await Promise.all(
      batch.map(async (orderId) => {
        try {
          const data = await getMeliOrder({ orderId, accessToken });
          return { orderId, data };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[MeliSync] Erro ao buscar detalhes do pedido ${orderId}:`, message);
          return null;
        }
      }),
    );

    responses.forEach((result) => {
      if (result?.data) {
        results.set(String(result.orderId), result.data);
      }
    });

    if (delayMs > 0 && i + concurrency < uniqueIds.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
