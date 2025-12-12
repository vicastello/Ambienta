#!/usr/bin/env npx tsx
/**
 * Sincroniza pedidos da Shopee em um intervalo de datas, trazendo valores líquidos via escrow_detail.
 * Usa retries ilimitados (com backoff) para garantir conclusão.
 *
 * Uso:
 *   NODE_OPTIONS='-r dotenv/config' DOTENV_CONFIG_PATH=.env.local npx tsx scripts/shopee-sync-range.ts --from=2025-11-01 --to=2025-12-12
 *
 * Observações:
 * - Requer SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_SHOP_ID e supabase service key em .env.local.
 * - Prioriza o access_token da tabela shopee_tokens (id=1); se não tiver, usa SHOPEE_ACCESS_TOKEN do env.
 */

import crypto from 'node:crypto';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SHOPEE_BASE_URL = 'https://partner.shopeemobile.com';
const partnerId = process.env.SHOPEE_PARTNER_ID!;
const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
const shopId = process.env.SHOPEE_SHOP_ID!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!partnerId || !partnerKey || !shopId) {
  throw new Error('Shopee config ausente (SHOPEE_PARTNER_ID/KEY/SHOP_ID).');
}
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase config ausente (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type ShopeeOrderStatus =
  | 'UNPAID'
  | 'READY_TO_SHIP'
  | 'PROCESSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TO_RETURN'
  | 'IN_CANCEL';

type ShopeeOrder = any;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(fn: () => Promise<T>, label: string, baseDelay = 1000): Promise<T> {
  let attempt = 0;
  // retries ilimitados; limita apenas o backoff a 30s para não ficar enorme
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err: any) {
      const delay = Math.min(baseDelay * attempt, 30000);
      console.warn(`[retry] ${label} (tentativa ${attempt}) falhou: ${err?.message || err}`);
      await sleep(delay);
    }
  }
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.from('shopee_tokens').select('access_token').eq('id', 1).single();
  if (data?.access_token) return data.access_token as string;
  if (!process.env.SHOPEE_ACCESS_TOKEN) throw new Error('Shopee access token não encontrado.');
  return process.env.SHOPEE_ACCESS_TOKEN;
}

function sign(path: string, ts: number, accessToken: string): string {
  const baseString = `${partnerId}${path}${ts}${accessToken}${shopId}`;
  return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

async function shopeeRequest<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const accessToken = await getAccessToken();
  const fullPath = path.startsWith('/api/v2') ? path : `/api/v2${path}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const url = new URL(SHOPEE_BASE_URL + fullPath);

  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign(fullPath, timestamp, accessToken));
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('shop_id', shopId);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.error && data.error !== '0')) {
    throw new Error(data.message || data.error || `status ${res.status}`);
  }
  return data as T;
}

interface OrderListResponse {
  response?: {
    order_list?: Array<{ order_sn: string }>;
    more?: boolean;
    next_cursor?: string;
  };
}

async function getOrderList(timeFrom: number, timeTo: number, cursor?: string): Promise<OrderListResponse> {
  return shopeeRequest<OrderListResponse>('/order/get_order_list', {
    time_range_field: 'create_time',
    time_from: timeFrom,
    time_to: timeTo,
    page_size: 100,
    ...(cursor ? { cursor } : {}),
  });
}

interface OrderDetailResponse {
  response?: { order_list?: ShopeeOrder[] };
}

async function getOrderDetails(orderSns: string[]): Promise<ShopeeOrder[]> {
  const resp = await shopeeRequest<OrderDetailResponse>('/order/get_order_detail', {
    order_sn_list: orderSns.join(','),
    response_optional_fields: 'buyer_user_id,buyer_username,recipient_address,total_amount,item_list',
  });
  return resp.response?.order_list || [];
}

interface EscrowResponse {
  response?: {
    order_income?: any;
    order_income_items?: any[];
  };
}

async function getEscrowDetail(orderSn: string): Promise<EscrowResponse | null> {
  return fetchWithRetry(
    () => shopeeRequest<EscrowResponse>('/payment/get_escrow_detail', { order_sn: orderSn }),
    `escrow ${orderSn}`,
    500
  );
}

function extractCityState(fullAddress: string | undefined): { city: string | null; state: string | null } {
  if (!fullAddress) return { city: null, state: null };
  const patterns = [
    /[-,]\s*([^-,]+)\s*[-/]\s*([A-Z]{2})\s*$/i,
    /\b([A-Za-zÀ-ÿ\s]+)\s*[-/]\s*([A-Z]{2})\s*$/i,
  ];
  for (const p of patterns) {
    const m = fullAddress.match(p);
    if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  }
  return { city: null, state: null };
}

function mapOrderToDb(order: any) {
  const { city, state } = extractCityState(order.recipient_address?.full_address);
  const income = order.order_income || {};
  const orderDiscounted = Number(income.order_discounted_price || order.total_amount || 0) || 0;
  const buyerTotal = Number(income.buyer_total_amount || orderDiscounted || 0) || 0;
  return {
    order_sn: order.order_sn,
    shop_id: Number(shopId),
    order_status: order.order_status,
    create_time: new Date(order.create_time * 1000).toISOString(),
    update_time: new Date(order.update_time * 1000).toISOString(),
    currency: order.currency || 'BRL',
    total_amount: buyerTotal || orderDiscounted || Number(order.total_amount) || 0,
    shipping_carrier: order.shipping_carrier || null,
    cod: !!order.cod,
    buyer_user_id: order.buyer_user_id || null,
    buyer_username: order.buyer_username || null,
    recipient_name: order.recipient_address?.name || null,
    recipient_phone: order.recipient_address?.phone || null,
    recipient_full_address: order.recipient_address?.full_address || null,
    recipient_city: city,
    recipient_state: state,
    raw_payload: order,
  };
}

function mapItemsToDb(order: any): any[] {
  if (!order.item_list?.length) return [];
  const escrowMap: Record<string, any> = {};
  (order.order_income?.items || order.order_income_items || []).forEach((it: any) => {
    const key = `${it.item_id}|${Number(it.model_id ?? 0)}`;
    escrowMap[key] = it;
  });
  const agg = new Map<string, any>();
  for (const item of order.item_list as any[]) {
    const qty = Number(item.model_quantity_purchased ?? item.quantity ?? 1) || 1;
    const modelId = Number(item.model_id ?? 0) || 0;
    const keyEsc = `${item.item_id}|${modelId}`;
    const escrow = escrowMap[keyEsc];
    let discounted =
      escrow?.discounted_price != null
        ? Number(escrow.discounted_price) / qty
        : Number(item.model_discounted_price || item.variation_discounted_price || item.item_price) || null;
    const original = Number(item.model_original_price) || null;
    const key = `${order.order_sn}|${item.item_id}|${modelId}`;
    if (agg.has(key)) {
      const curr = agg.get(key);
      curr.quantity += qty;
    } else {
      agg.set(key, {
        order_sn: order.order_sn,
        item_id: item.item_id,
        model_id: modelId,
        item_name: item.item_name,
        model_name: item.model_name || null,
        item_sku: item.item_sku || null,
        model_sku: item.model_sku || null,
        quantity: qty,
        original_price: original,
        discounted_price: discounted,
        is_wholesale: item.is_wholesale || false,
        raw_payload: item,
      });
    }
  }
  return Array.from(agg.values());
}

async function upsertBatch(table: string, rows: any[], conflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    await fetchWithRetry(
      async () => {
        const { error } = await supabase.from(table).upsert(batch as any, { onConflict: conflict });
        if (error) throw new Error(error.message);
      },
      `${table} upsert (${i}/${rows.length})`,
      1000
    );
    await sleep(200);
  }
}

function parseDate(dateStr: string): number {
  return Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
}

function chunkRanges(startTs: number, endTs: number, maxDays = 10): Array<{ from: number; to: number }> {
  const daySec = 24 * 60 * 60;
  const chunks: Array<{ from: number; to: number }> = [];
  let cur = startTs;
  while (cur < endTs) {
    const to = Math.min(cur + maxDays * daySec, endTs);
    chunks.push({ from: cur, to });
    cur = to;
  }
  return chunks;
}

async function main() {
  const argFrom = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1];
  const argTo = process.argv.find((a) => a.startsWith('--to='))?.split('=')[1];
  if (!argFrom || !argTo) {
    console.error('Use: --from=YYYY-MM-DD --to=YYYY-MM-DD');
    process.exit(1);
  }
  const startTs = parseDate(argFrom);
  const endTs = parseDate(argTo) + 24 * 60 * 60; // incluir dia final inteiro
  const ranges = chunkRanges(startTs, endTs, 10); // chunk de 10 dias para não estourar limite

  console.log('='.repeat(60));
  console.log(`Shopee sync ${argFrom} -> ${argTo} (chunks: ${ranges.length})`);
  console.log('='.repeat(60));

  let totalOrders = 0;
  let totalItems = 0;

  for (let idx = 0; idx < ranges.length; idx++) {
    const { from, to } = ranges[idx];
    console.log(`\n[Chunk ${idx + 1}/${ranges.length}] ${new Date(from * 1000).toISOString().slice(0, 10)} → ${new Date(to * 1000).toISOString().slice(0, 10)}`);

    // 1) Coletar order_sn com paginação e retries
    const orderSns: string[] = [];
    let cursor: string | undefined;
    do {
      const pageResp = await fetchWithRetry(
        () => getOrderList(from, to - 1, cursor),
        'get_order_list',
        1000
      );
      const list = pageResp.response?.order_list || [];
      orderSns.push(...list.map((o) => o.order_sn));
      cursor = pageResp.response?.more ? pageResp.response?.next_cursor : undefined;
      if (cursor) await sleep(300);
    } while (cursor);

    console.log(`  Encontrados ${orderSns.length} pedidos no chunk`);
    if (orderSns.length === 0) continue;

    // 2) Detalhes em batches de 50 + escrow
    const allOrders: ShopeeOrder[] = [];
    for (let i = 0; i < orderSns.length; i += 50) {
      const batch = orderSns.slice(i, i + 50);
      console.log(`  Detalhes batch ${i / 50 + 1}/${Math.ceil(orderSns.length / 50)} (${batch.length} pedidos)`);
      const details = await fetchWithRetry(() => getOrderDetails(batch), 'get_order_detail', 1000);
      for (const order of details) {
        const escrow = await getEscrowDetail(order.order_sn);
        if (escrow?.response?.order_income) order.order_income = escrow.response.order_income;
        if (escrow?.response?.order_income_items) order.order_income_items = escrow.response.order_income_items;
        allOrders.push(order);
        await sleep(120); // rate limit leve entre escrows
      }
      await sleep(300);
    }

    // 3) Mapear e salvar
    const ordersDb = allOrders.map(mapOrderToDb);
    const itemsDb = allOrders.flatMap(mapItemsToDb);
    await upsertBatch('shopee_orders', ordersDb, 'order_sn');
    if (itemsDb.length) {
      await upsertBatch('shopee_order_items', itemsDb, 'order_sn,item_id,model_id');
    }
    totalOrders += ordersDb.length;
    totalItems += itemsDb.length;
    console.log(`  ✓ Salvos ${ordersDb.length} pedidos, ${itemsDb.length} itens`);
  }

  console.log('\nResumo final:');
  console.log(`  Pedidos salvos: ${totalOrders}`);
  console.log(`  Itens salvos: ${totalItems}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
