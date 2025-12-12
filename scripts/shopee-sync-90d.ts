#!/usr/bin/env npx tsx
import { config } from 'dotenv';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Carregar .env.local
config({ path: '.env.local' });

const SHOPEE_BASE_URL = 'https://partner.shopeemobile.com';

// Configuração
const partnerId = process.env.SHOPEE_PARTNER_ID!;
const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
const shopId = process.env.SHOPEE_SHOP_ID!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getAccessToken(): Promise<string> {
  // Prioriza token armazenado na tabela; fallback para env se existir
  const { data } = await (supabase as any)
    .from('shopee_tokens')
    .select('access_token')
    .eq('id', 1)
    .single();
  if (data?.access_token) return data.access_token;
  if (!process.env.SHOPEE_ACCESS_TOKEN) {
    throw new Error('Shopee access token não configurado');
  }
  return process.env.SHOPEE_ACCESS_TOKEN;
}

function generateSignature(path: string, timestamp: number, accessToken: string): string {
  // path deve ser o caminho completo incluindo /api/v2
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  const hmac = crypto.createHmac('sha256', partnerKey);
  hmac.update(baseString);
  return hmac.digest('hex');
}

async function shopeeRequest<T>(apiPath: string, params: Record<string, string | number>): Promise<T> {
  const accessToken = await getAccessToken();
  // apiPath é sem /api/v2, mas para assinatura precisamos do path completo
  const fullPath = `/api/v2${apiPath}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSignature(fullPath, timestamp, accessToken);

  const url = new URL(SHOPEE_BASE_URL + fullPath);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('shop_id', shopId);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  console.log(`[Shopee] Request: ${fullPath}`);
  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error && data.error !== '' && data.error !== 0) {
    throw new Error(`Shopee error: ${data.message || data.error}`);
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

interface OrderDetailResponse {
  response?: {
    order_list?: any[];
  };
}

interface EscrowResponse {
  response?: {
    order_income?: any;
    order_income_items?: any[];
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

async function getOrderDetails(orderSns: string[]): Promise<any[]> {
  if (orderSns.length === 0) return [];
  
  const response = await shopeeRequest<OrderDetailResponse>('/order/get_order_detail', {
    order_sn_list: orderSns.join(','),
    response_optional_fields: 'buyer_user_id,buyer_username,recipient_address,total_amount,item_list',
  });

  return response.response?.order_list || [];
}

async function getEscrowDetail(orderSn: string): Promise<EscrowResponse | null> {
  try {
    const data = await shopeeRequest<EscrowResponse>('/payment/get_escrow_detail', { order_sn: orderSn });
    return data;
  } catch (err: any) {
    console.warn(`  Aviso: falha ao buscar escrow para ${orderSn}: ${err?.message || err}`);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCityState(fullAddress: string | undefined): { city: string | null; state: string | null } {
  if (!fullAddress) return { city: null, state: null };
  
  const patterns = [
    /[-,]\s*([^-,]+)\s*[-/]\s*([A-Z]{2})\s*$/i,
    /\b([A-Za-zÀ-ÿ\s]+)\s*[-/]\s*([A-Z]{2})\s*$/i,
  ];
  
  for (const pattern of patterns) {
    const match = fullAddress.match(pattern);
    if (match) {
      return {
        city: match[1].trim(),
        state: match[2].toUpperCase(),
      };
    }
  }
  
  return { city: null, state: null };
}

function mapOrderToDb(order: any) {
  const { city, state } = extractCityState(order.recipient_address?.full_address);
  const orderIncome = order.order_income || {};
  const orderDiscounted = Number(orderIncome.order_discounted_price || order.total_amount || 0) || 0;
  const buyerTotal = Number(orderIncome.buyer_total_amount || orderDiscounted || 0) || 0;
  
  return {
    order_sn: order.order_sn,
    shop_id: parseInt(shopId, 10),
    order_status: order.order_status,
    create_time: new Date(order.create_time * 1000).toISOString(),
    update_time: new Date(order.update_time * 1000).toISOString(),
    currency: order.currency || 'BRL',
    total_amount: buyerTotal || orderDiscounted || parseFloat(order.total_amount) || 0,
    shipping_carrier: order.shipping_carrier || null,
    cod: order.cod || false,
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

  const agg = new Map<string, any>();
  const escrowItems: Record<string, any> = {};
  (order.order_income?.items || order.order_income_items || []).forEach((it: any) => {
    const key = `${it.item_id}|${Number(it.model_id ?? 0) || 0}`;
    escrowItems[key] = it;
  });

  for (const item of order.item_list as any[]) {
    const quantity = Number(item.model_quantity_purchased ?? item.quantity ?? 1) || 1;
    const original_price = parseFloat(item.model_original_price) || null;
    let discounted_price =
      parseFloat(item.model_discounted_price || item.variation_discounted_price || item.item_price) || null;

    const keyEscrow = `${item.item_id}|${Number(item.model_id ?? 0) || 0}`;
    const escrow = escrowItems[keyEscrow];
    if (escrow?.discounted_price) {
      discounted_price = Number(escrow.discounted_price) / quantity;
    }

    const modelId = Number(item.model_id ?? 0) || 0;
    const key = `${order.order_sn}|${item.item_id}|${modelId}`;

    if (agg.has(key)) {
      const curr = agg.get(key);
      curr.quantity += quantity;
    } else {
      agg.set(key, {
        order_sn: order.order_sn,
        item_id: item.item_id,
        model_id: modelId,
        item_name: item.item_name,
        model_name: item.model_name || null,
        item_sku: item.item_sku || null,
        model_sku: item.model_sku || null,
        quantity,
        original_price,
        discounted_price,
        is_wholesale: item.is_wholesale || false,
        raw_payload: item,
      });
    }
  }

  return Array.from(agg.values());
}

async function syncPeriod(timeFrom: number, timeTo: number, chunkNum: number, totalChunks: number): Promise<number> {
  console.log(`\n[Chunk ${chunkNum}/${totalChunks}] ${new Date(timeFrom * 1000).toISOString().split('T')[0]} → ${new Date(timeTo * 1000).toISOString().split('T')[0]}`);
  
  const allOrderSns: string[] = [];
  let cursor: string | undefined;
  let page = 0;

  // 1. Coletar todos os order_sn do período
  do {
    page++;
    const response = await getOrderList(timeFrom, timeTo, cursor);
    const orders = response.response?.order_list || [];
    
    if (orders.length > 0) {
      allOrderSns.push(...orders.map(o => o.order_sn));
      console.log(`  Página ${page}: +${orders.length} pedidos (total: ${allOrderSns.length})`);
    }

    cursor = response.response?.more ? response.response?.next_cursor : undefined;
    
    if (cursor) await sleep(300);
  } while (cursor);

  if (allOrderSns.length === 0) {
    console.log('  Nenhum pedido no período');
    return 0;
  }

  // 2. Buscar detalhes em batches de 50
  const allOrders: any[] = [];
  for (let i = 0; i < allOrderSns.length; i += 50) {
    const batch = allOrderSns.slice(i, i + 50);
    console.log(`  Detalhes batch ${Math.floor(i/50)+1}/${Math.ceil(allOrderSns.length/50)} (${batch.length} pedidos)`);
    
    try {
      const details = await getOrderDetails(batch);
      for (const order of details) {
        const escrow = await getEscrowDetail(order.order_sn);
        if (escrow?.response?.order_income) {
          order.order_income = escrow.response.order_income;
        }
        if (escrow?.response?.order_income_items) {
          order.order_income_items = escrow.response.order_income_items;
        }
        allOrders.push(order);
        await sleep(150); // leve rate limit entre pedidos
      }
    } catch (err: any) {
      console.error(`  Erro ao buscar detalhes: ${err.message}`);
    }
    
    await sleep(300);
  }

  // 3. Upsert no banco
  const ordersToUpsert = allOrders.map(mapOrderToDb);
  const itemsToUpsert = allOrders.flatMap(mapItemsToDb);

  // Upsert pedidos
  for (let i = 0; i < ordersToUpsert.length; i += 500) {
    const batch = ordersToUpsert.slice(i, i + 500);
    const { error } = await supabase
      .from('shopee_orders')
      .upsert(batch as any, { onConflict: 'order_sn' });
    
    if (error) {
      console.error(`  Erro ao salvar pedidos: ${error.message}`);
    }
  }

  // Upsert itens
  if (itemsToUpsert.length > 0) {
    for (let i = 0; i < itemsToUpsert.length; i += 500) {
      const batch = itemsToUpsert.slice(i, i + 500);
      const { error } = await supabase
        .from('shopee_order_items')
        .upsert(batch as any, { onConflict: 'order_sn,item_id,model_id' });
      
      if (error) {
        console.error(`  Erro ao salvar itens: ${error.message}`);
      }
    }
  }

  console.log(`  ✓ ${ordersToUpsert.length} pedidos, ${itemsToUpsert.length} itens salvos`);
  return ordersToUpsert.length;
}

async function main() {
  console.log('='.repeat(60));
  const argDays = process.argv.find((a) => a.startsWith('--days='));
  const periodDays = argDays ? Math.min(Math.max(Number(argDays.split('=')[1]) || 0, 1), 180) : 90;
  console.log(`SHOPEE SYNC - Últimos ${periodDays} dias`);
  console.log('='.repeat(60));

  const now = Math.floor(Date.now() / 1000);
  const timeFrom = now - periodDays * 24 * 60 * 60;
  const timeTo = now;

  // Dividir em chunks de 15 dias (limite da API)
  const chunkSeconds = 15 * 24 * 60 * 60;
  const chunks: Array<{ from: number; to: number }> = [];

  for (let start = timeFrom; start < timeTo; start += chunkSeconds) {
    chunks.push({
      from: start,
      to: Math.min(start + chunkSeconds - 1, timeTo),
    });
  }

  console.log(`\nPeríodo: ${new Date(timeFrom * 1000).toISOString().split('T')[0]} → ${new Date(timeTo * 1000).toISOString().split('T')[0]}`);
  console.log(`Chunks: ${chunks.length} (cada um com até 15 dias)\n`);

  let totalOrders = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const count = await syncPeriod(chunk.from, chunk.to, i + 1, chunks.length);
    totalOrders += count;
    
    // Delay entre chunks
    if (i < chunks.length - 1) {
      await sleep(500);
    }
  }

  // Atualizar cursor
  await supabase
    .from('shopee_sync_cursor')
    .upsert({
      id: 1,
      sync_status: 'idle',
      last_sync_at: new Date().toISOString(),
      total_orders_synced: totalOrders,
      updated_at: new Date().toISOString(),
    } as any);

  console.log('\n' + '='.repeat(60));
  console.log(`CONCLUÍDO: ${totalOrders} pedidos sincronizados`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
