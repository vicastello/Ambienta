import 'server-only';
import crypto from 'node:crypto';
import type {
  ShopeeOrder,
  ShopeeOrderListApiResponse,
  ShopeeOrderListResponse,
  ShopeeOrderStatus,
} from '@/src/types/shopee';
import { supabaseAdmin } from './supabaseAdmin';

// Base host; prefix /api/v2 is added per-request para assinatura correta
const SHOPEE_BASE_URL = 'https://partner.shopeemobile.com';

type ShopeeTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
};

async function getShopeeTokens(): Promise<ShopeeTokens | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin as any)
    .from('shopee_tokens')
    .select('*')
    .eq('id', 1)
    .single();

  if (data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    };
  }

  const envAccess = process.env.SHOPEE_ACCESS_TOKEN;
  const envRefresh = process.env.SHOPEE_REFRESH_TOKEN;
  if (envAccess) {
    // Seed no banco para permitir refresh via cron
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any)
      .from('shopee_tokens')
      .upsert({
        id: 1,
        access_token: envAccess,
        refresh_token: envRefresh,
        updated_at: new Date().toISOString(),
      });
    return {
      access_token: envAccess,
      refresh_token: envRefresh,
    };
  }

  return null;
}

async function saveShopeeTokens(tokens: ShopeeTokens) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any)
    .from('shopee_tokens')
    .upsert({
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at ?? null,
      updated_at: new Date().toISOString(),
    });
}

async function refreshShopeeToken(refreshToken: string): Promise<ShopeeTokens> {
  const { partnerId, partnerKey, shopId } = getShopeeConfig();
  const PATH = '/api/v2/auth/access_token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const base = `${partnerId}${PATH}${timestamp}`;
  const sign = crypto.createHmac('sha256', partnerKey).update(base).digest('hex');

  const url = new URL(`https://partner.shopeemobile.com${PATH}`);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);

  const body = {
    partner_id: Number(partnerId),
    shop_id: Number(shopId),
    refresh_token: refreshToken,
  };

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Shopee refresh failed (${res.status}): ${data.error || res.statusText}`);
  }

  const expiresAt = data.expire_in ? new Date(Date.now() + data.expire_in * 1000).toISOString() : undefined;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: expiresAt,
  };
}

async function ensureValidShopeeTokens(): Promise<ShopeeTokens> {
  const tokens = await getShopeeTokens();
  if (!tokens) {
    throw new Error('Shopee tokens not configured. Defina SHOPEE_ACCESS_TOKEN/REFRESH_TOKEN ou preencha shopee_tokens.');
  }

  const marginMs = 5 * 60 * 1000;
  if (tokens.expires_at) {
    const expires = new Date(tokens.expires_at).getTime();
    if (expires - marginMs <= Date.now() && tokens.refresh_token) {
      const refreshed = await refreshShopeeToken(tokens.refresh_token);
      await saveShopeeTokens(refreshed);
      return refreshed;
    }
  }

  return tokens;
}

function getShopeeConfig() {
  const partnerId = process.env.SHOPEE_PARTNER_ID?.trim();
  const partnerKey = process.env.SHOPEE_PARTNER_KEY?.trim();
  const shopId = process.env.SHOPEE_SHOP_ID?.trim();

  if (!partnerId) throw new Error('Missing SHOPEE_PARTNER_ID env var');
  if (!partnerKey) throw new Error('Missing SHOPEE_PARTNER_KEY env var');
  if (!shopId) throw new Error('Missing SHOPEE_SHOP_ID env var');

  return {
    partnerId,
    partnerKey,
    shopId,
  };
}

type ShopeeSignatureOptions = {
  accessToken?: string;
  shopId?: string;
};

export function generateShopeeSignature(
  path: string,
  timestamp: number,
  opts?: ShopeeSignatureOptions
): string {
  const { partnerId, partnerKey } = getShopeeConfig();
  const baseString = `${partnerId}${path}${timestamp}${opts?.accessToken ?? ''}${opts?.shopId ?? ''}`;
  const hmac = crypto.createHmac('sha256', partnerKey);
  hmac.update(baseString);
  return hmac.digest('hex');
}

async function shopeeRequest<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  options?: ShopeeSignatureOptions
): Promise<T> {
  const tokens = await ensureValidShopeeTokens();
  const timestamp = Math.floor(Date.now() / 1000);
  const isShopLevel = true;
  const { partnerId, shopId } = getShopeeConfig();
  const apiPath = path.startsWith('/api/v2') ? path : `/api/v2${path}`;

  const sign = generateShopeeSignature(apiPath, timestamp, {
    accessToken: tokens.access_token,
    shopId,
  });

  const url = new URL(SHOPEE_BASE_URL + apiPath);
  const searchParams = url.searchParams;

  searchParams.set('partner_id', partnerId);
  searchParams.set('timestamp', String(timestamp));
  searchParams.set('sign', sign);

  if (isShopLevel) {
    searchParams.set('access_token', tokens.access_token);
    searchParams.set('shop_id', shopId);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), { method: 'GET' });

  let data: any;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`Shopee: failed to parse JSON (${String(err)})`);
  }

  if (!res.ok) {
    // Se 401/403, tentar refresh e refazer uma vez
    if ((res.status === 401 || res.status === 403) && tokens.refresh_token) {
      const refreshed = await refreshShopeeToken(tokens.refresh_token);
      await saveShopeeTokens(refreshed);
      return shopeeRequest<T>(path, params, options);
    }
    throw new Error(`Shopee request failed (${res.status}): ${data?.message ?? data?.error ?? 'Unknown error'}`);
  }

  const errorCode = data?.error;
  const errorMessage = data?.message ?? data?.error_msg;
  if (errorCode && errorCode !== '0') {
    throw new Error(`Shopee error ${errorCode}: ${errorMessage ?? 'Unknown error'}`);
  }
  if (typeof errorMessage === 'string' && errorMessage && errorMessage.toLowerCase() !== 'success') {
    throw new Error(`Shopee: ${errorMessage}`);
  }

  return data as T;
}

// Shopee limita time_range para no máximo 15 dias por requisição
const MAX_TIME_RANGE_SECONDS = 15 * 24 * 60 * 60;

/**
 * Busca pedidos de um único período (máx 15 dias).
 * Use getAllShopeeOrdersForPeriod para períodos maiores.
 */
export async function getShopeeOrders(params: {
  timeFrom: number;
  timeTo: number;
  status?: ShopeeOrderStatus;
  cursor?: string;
  pageSize?: number;
}): Promise<ShopeeOrderListResponse> {
  const path = '/order/get_order_list';
  const timeFromTs = Number(params.timeFrom);
  const timeToTs = Number(params.timeTo);

  if (!Number.isFinite(timeFromTs) || !Number.isFinite(timeToTs)) {
    throw new Error('Shopee: invalid time range (timeFrom/timeTo)');
  }

  const queryParams = {
    time_from: timeFromTs,
    time_to: timeToTs,
    time_range_field: 'create_time',
    page_size: params.pageSize ?? 50,
    cursor: params.cursor,
    order_status: params.status,
  };

  const data = await shopeeRequest<ShopeeOrderListApiResponse>(path, queryParams);

  const resp = (data as any).response ?? {};
  const orders = Array.isArray(resp.order_list) ? resp.order_list : [];
  const hasMore = Boolean(resp.more);
  const nextCursor = resp.next_cursor;

  return {
    orders,
    has_more: hasMore,
    next_cursor: nextCursor,
  };
}

// Resposta da API get_order_detail
interface ShopeeOrderDetailResponse {
  response: {
    order_list: ShopeeOrder[];
  };
  error?: string;
  message?: string;
}

/**
 * Busca detalhes completos de pedidos (incluindo itens, endereço, etc.)
 * @param orderSnList - Lista de order_sn (máx 50 por requisição)
 */
export async function getShopeeOrderDetails(orderSnList: string[]): Promise<ShopeeOrder[]> {
  if (orderSnList.length === 0) return [];
  if (orderSnList.length > 50) {
    throw new Error('Shopee: máximo de 50 pedidos por requisição de detalhes');
  }

  const path = '/order/get_order_detail';

  // A Shopee espera response_optional_fields para trazer itens, endereço, etc.
  const optionalFields = 'item_list,recipient_address,buyer_user_id,shipping_carrier';

  const data = await shopeeRequest<ShopeeOrderDetailResponse>(
    path,
    {
      order_sn_list: orderSnList.join(','),
      response_optional_fields: optionalFields,
    }
  );

  const orders = data.response?.order_list ?? [];

  // Normalizar para garantir presença de order_items (API retorna item_list)
  return orders.map((order: any) => ({
    ...order,
    order_items: Array.isArray(order.order_items) && order.order_items.length > 0
      ? order.order_items
      : Array.isArray(order.item_list)
        ? order.item_list
        : [],
  }));
}

/**
 * Busca todos os pedidos de um período longo (ex: 90 dias).
 * Divide em chunks de 15 dias e faz paginação completa.
 * Opcionalmente busca detalhes completos (itens, endereço).
 */
export async function getAllShopeeOrdersForPeriod(params: {
  timeFrom: number;
  timeTo: number;
  status?: ShopeeOrderStatus;
  pageSize?: number;
  fetchDetails?: boolean;
  onProgress?: (info: { chunk: number; totalChunks: number; ordersLoaded: number }) => void;
}): Promise<ShopeeOrder[]> {
  const { timeFrom, timeTo, status, pageSize = 50, fetchDetails = true, onProgress } = params;

  // Dividir período em chunks de até 15 dias
  const chunks: Array<{ from: number; to: number }> = [];
  let chunkStart = timeFrom;
  while (chunkStart < timeTo) {
    const chunkEnd = Math.min(chunkStart + MAX_TIME_RANGE_SECONDS, timeTo);
    chunks.push({ from: chunkStart, to: chunkEnd });
    chunkStart = chunkEnd;
  }

  const allOrders: ShopeeOrder[] = [];
  const seenOrderSns = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let cursor: string | undefined;
    let hasMore = true;

    // Paginar dentro do chunk
    while (hasMore) {
      const response = await getShopeeOrders({
        timeFrom: chunk.from,
        timeTo: chunk.to,
        status,
        cursor,
        pageSize,
      });

      // Adicionar pedidos únicos (evitar duplicatas na fronteira dos chunks)
      for (const order of response.orders) {
        if (!seenOrderSns.has(order.order_sn)) {
          seenOrderSns.add(order.order_sn);
          allOrders.push(order);
        }
      }

      hasMore = response.has_more;
      cursor = response.next_cursor;

      // Rate limiting: pequeno delay entre requisições
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    onProgress?.({
      chunk: i + 1,
      totalChunks: chunks.length,
      ordersLoaded: allOrders.length,
    });

    // Delay entre chunks
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  // Buscar detalhes completos se solicitado
  if (fetchDetails && allOrders.length > 0) {
    const orderSns = allOrders.map((o) => o.order_sn);
    const detailedOrders: ShopeeOrder[] = [];

    // Processar em batches de 50
    for (let i = 0; i < orderSns.length; i += 50) {
      const batch = orderSns.slice(i, i + 50);
      try {
        const details = await getShopeeOrderDetails(batch);
        detailedOrders.push(...details);
      } catch (err) {
        // Se falhar ao buscar detalhes, usar dados básicos
        console.error(`[Shopee] Erro ao buscar detalhes do batch ${i / 50 + 1}:`, err);
        const basicOrders = allOrders.filter((o) => batch.includes(o.order_sn));
        detailedOrders.push(...basicOrders);
      }

      // Rate limiting entre batches de detalhes
      if (i + 50 < orderSns.length) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    return detailedOrders;
  }

  return allOrders;
}
