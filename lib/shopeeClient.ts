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

// Resposta da API get_escrow_detail
export interface ShopeeEscrowDetail {
  order_sn: string;
  voucher_from_seller: number;
  voucher_from_shopee: number;
  seller_voucher_code: string[];
  original_shopee_discount: number;
  total_discount_seller_provided: number;
  escrow_amount: number;
  buyer_total_amount: number;
  actual_shipping_fee: number;
  commission_fee: number;
  service_fee: number;
  ams_commission_fee: number; // Affiliate Marketing Solutions - commission paid to affiliates/influencers
  order_selling_price: number; // Selling price after bulk discounts (before order-level discounts)
  order_discounted_price: number; // Price after seller discount (base for fee calculation)
  seller_discount: number; // Seller-provided discount (e.g., 2% for buying more items)
  order_original_price: number;
  seller_return_refund: number;
  drc_adjustable_refund: number;
}

interface ShopeeEscrowDetailResponse {
  response: {
    order_sn: string;
    buyer_payment_info?: {
      buyer_total_amount?: number;
      seller_voucher?: number;
      shopee_voucher?: number;
      merchant_subtotal?: number;
      shipping_fee?: number;
      [key: string]: unknown;
    };
    order_income?: {
      voucher_from_seller?: number;
      voucher_from_shopee?: number;
      seller_voucher_code?: string[];
      original_shopee_discount?: number;
      escrow_amount?: number;
      buyer_total_amount?: number;
      actual_shipping_fee?: number;
      commission_fee?: number;
      service_fee?: number;
      items?: Array<{
        discount_from_voucher_seller?: number;
        discount_from_voucher_shopee?: number;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  error?: string;
  message?: string;
}

/**
 * Busca detalhes de escrow/pagamento de um pedido, incluindo breakdown de vouchers
 * @param orderSn - ID do pedido
 * @returns Detalhes financeiros incluindo voucher_from_seller e voucher_from_shopee
 */
export async function getShopeeEscrowDetail(orderSn: string): Promise<ShopeeEscrowDetail | null> {
  try {
    const path = '/payment/get_escrow_detail';

    const data = await shopeeRequest<ShopeeEscrowDetailResponse>(
      path,
      { order_sn: orderSn }
    );

    const resp = data.response;

    if (!resp || !resp.order_sn) {
      console.warn(`[Shopee Escrow] No escrow data for order ${orderSn}`);
      return null;
    }

    // Extract data from order_income (where the voucher breakdown actually lives)
    const orderIncome = resp.order_income || {};

    const result: ShopeeEscrowDetail = {
      order_sn: resp.order_sn,
      voucher_from_seller: orderIncome.voucher_from_seller ?? 0,
      voucher_from_shopee: orderIncome.voucher_from_shopee ?? 0,
      seller_voucher_code: orderIncome.seller_voucher_code ?? [],
      original_shopee_discount: orderIncome.original_shopee_discount ?? 0,
      total_discount_seller_provided: 0, // Calculate from items if needed
      escrow_amount: orderIncome.escrow_amount ?? 0,
      buyer_total_amount: orderIncome.buyer_total_amount ?? 0,
      actual_shipping_fee: orderIncome.actual_shipping_fee ?? 0,
      commission_fee: orderIncome.commission_fee ?? 0,
      service_fee: orderIncome.service_fee ?? 0,
      ams_commission_fee: (orderIncome as any).order_ams_commission_fee ?? 0, // Affiliate commission
      order_selling_price: (orderIncome as any).order_selling_price ?? 0, // Selling price after bulk discounts
      order_discounted_price: (orderIncome as any).order_discounted_price ?? 0, // Price after seller discount (base for fee calc)
      seller_discount: (orderIncome as any).seller_discount ?? 0, // Seller-provided discount (e.g., 2%)
      order_original_price: (orderIncome as any).order_original_price ?? 0,
      seller_return_refund: (orderIncome as any).seller_return_refund ?? 0,
      drc_adjustable_refund: (orderIncome as any).drc_adjustable_refund ?? 0,
    };

    // Log when there's a seller voucher
    if (result.voucher_from_seller > 0) {
      console.log(`[Shopee Escrow] Order ${orderSn} has seller voucher: R$ ${result.voucher_from_seller} (code: ${result.seller_voucher_code.join(', ')})`);
    }

    // Log when there's an affiliate commission
    if (result.ams_commission_fee > 0) {
      console.log(`[Shopee Escrow] Order ${orderSn} has affiliate commission: R$ ${result.ams_commission_fee}`);
    }

    // Log when there's a seller discount
    if (result.seller_discount > 0) {
      console.log(`[Shopee Escrow] Order ${orderSn} has seller discount: R$ ${result.seller_discount}`);
    }

    // DEBUG: Log all fees and pricing fields
    const pricing = {
      order_original_price: (orderIncome as any).order_original_price,
      order_discounted_price: (orderIncome as any).order_discounted_price,
      order_selling_price: (orderIncome as any).order_selling_price,
      order_seller_discount: (orderIncome as any).order_seller_discount,
      seller_discount: (orderIncome as any).seller_discount,
      cost_of_goods_sold: (orderIncome as any).cost_of_goods_sold,
    };
    console.log(`[Shopee Escrow PRICES] Order ${orderSn}:`, JSON.stringify(pricing));
    console.log(`[Shopee Escrow FEES] Order ${orderSn}: commission=${result.commission_fee}, service=${result.service_fee}, ams=${result.ams_commission_fee}, shipping=${result.actual_shipping_fee}, escrow=${result.escrow_amount}`);

    return result;
  } catch (err) {
    console.error(`[Shopee Escrow] Error fetching escrow for ${orderSn}:`, err);
    return null;
  }
}

/**
 * Busca detalhes de escrow para múltiplos pedidos em batch
 * @param orderSnList - Lista de order_sn
 * @returns Map de order_sn para escrow details
 */
export async function getShopeeEscrowDetailsForOrders(
  orderSnList: string[],
  options?: { concurrency?: number; delayMs?: number }
): Promise<Map<string, ShopeeEscrowDetail>> {
  const results = new Map<string, ShopeeEscrowDetail>();

  // A API get_escrow_detail aceita apenas um pedido por vez
  // Processamos em paralelo com limite de concorrência
  const envConcurrency = Number(process.env.SHOPEE_ESCROW_CONCURRENCY || 0);
  const envDelayMs = Number(process.env.SHOPEE_ESCROW_DELAY_MS || 0);
  const concurrencyRaw = options?.concurrency ?? (Number.isFinite(envConcurrency) && envConcurrency > 0 ? envConcurrency : 5);
  const delayRaw = options?.delayMs ?? (Number.isFinite(envDelayMs) && envDelayMs >= 0 ? envDelayMs : 200);
  const concurrency = Math.min(20, Math.max(1, Math.floor(concurrencyRaw)));
  const delayMs = Math.max(0, Math.floor(delayRaw));

  for (let i = 0; i < orderSnList.length; i += concurrency) {
    const batch = orderSnList.slice(i, i + concurrency);
    const promises = batch.map(async (orderSn) => {
      const escrow = await getShopeeEscrowDetail(orderSn);
      if (escrow) {
        results.set(orderSn, escrow);
      }
    });

    await Promise.all(promises);

    // Rate limiting entre batches
    if (delayMs > 0 && i + concurrency < orderSnList.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
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

/**
 * Busca pedido e escrow na Shopee e salva no banco (shopee_orders).
 * Usado pelo Force Sync.
 */
export async function fetchAndSaveShopeeOrder(orderSn: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { shopId } = getShopeeConfig();

    // 1. Fetch Basic Details to ensure we have the order record
    // We try to fetch details even if it exists, to ensure fresh status
    const details = await getShopeeOrderDetails([orderSn]);
    if (!details || details.length === 0) {
      return { success: false, error: 'Pedido não encontrado na Shopee' };
    }
    const order = details[0];

    // 2. Fetch Escrow Details for financial data
    const escrow = await getShopeeEscrowDetail(orderSn);

    // 3. Merge Data
    const { city, state } = extractCityState(order.recipient_address?.full_address);
    const orderIncome = (order as any).order_income || {}; // Details might have it?

    // Escrow data overrides or fills blanks
    let orderSellingPrice = (orderIncome as any).order_selling_price || 0;
    let orderDiscountedPrice = (orderIncome as any).order_discounted_price || 0;
    let sellerDiscount = (orderIncome as any).seller_discount || 0;
    let escrowAmount = (orderIncome as any).escrow_amount || 0;
    let voucherFromSeller = (orderIncome as any).voucher_from_seller || 0;
    let voucherFromShopee = (orderIncome as any).voucher_from_shopee || 0;
    let commissionFee = (orderIncome as any).commission_fee || 0;
    let serviceFee = (orderIncome as any).service_fee || 0;
    let amsCommissionFee = (orderIncome as any).order_ams_commission_fee || 0;
    let actualShippingFee = (orderIncome as any).actual_shipping_fee || 0;

    if (escrow) {
      orderSellingPrice = escrow.order_selling_price || orderSellingPrice;
      orderDiscountedPrice = escrow.order_discounted_price || orderDiscountedPrice;
      sellerDiscount = escrow.seller_discount || sellerDiscount;
      escrowAmount = escrow.escrow_amount || escrowAmount;
      voucherFromSeller = escrow.voucher_from_seller || voucherFromSeller;
      voucherFromShopee = escrow.voucher_from_shopee || voucherFromShopee;
      commissionFee = escrow.commission_fee || commissionFee;
      serviceFee = escrow.service_fee || serviceFee;
      amsCommissionFee = escrow.ams_commission_fee || amsCommissionFee;
      actualShippingFee = escrow.actual_shipping_fee || actualShippingFee;
    }

    const orderDiscounted = Number(orderDiscountedPrice || order.total_amount || 0) || 0;
    // buyer_total_amount isn't strictly in ShopeeOrder type but might be in raw payload. 
    // We'll use order.total_amount as fallback.

    // 4. Upsert to DB
    const { error: upsertError } = await supabaseAdmin
      .from('shopee_orders')
      .upsert({
        order_sn: order.order_sn,
        shop_id: parseInt(shopId, 10),
        order_status: order.order_status,
        create_time: new Date(order.create_time * 1000).toISOString(),
        update_time: new Date(order.update_time * 1000).toISOString(),
        currency: order.currency || 'BRL',
        total_amount: parseFloat(order.total_amount) || 0,
        shipping_carrier: order.shipping_carrier || null,
        cod: order.cod || false,
        // buyer_user_id not directly available in minimal ShopeeOrder type unless we cast
        // assuming generic mapping for now
        recipient_name: order.recipient_address?.name || null,
        recipient_phone: order.recipient_address?.phone || null,
        recipient_full_address: order.recipient_address?.full_address || null,
        recipient_city: city,
        recipient_state: state,
        raw_payload: order as any,

        // Financials
        order_selling_price: orderSellingPrice,
        order_discounted_price: orderDiscountedPrice,
        seller_discount: sellerDiscount,
        escrow_amount: escrowAmount,
        voucher_from_seller: voucherFromSeller,
        voucher_from_shopee: voucherFromShopee,
        commission_fee: commissionFee,
        service_fee: serviceFee,
        ams_commission_fee: amsCommissionFee,
        actual_shipping_fee: actualShippingFee,

        updated_at: new Date().toISOString()
      }, { onConflict: 'order_sn' });

    if (upsertError) {
      console.error('[ShopeeClient] Error saving order:', upsertError);
      return { success: false, error: upsertError.message };
    }

    return { success: true };

  } catch (err: any) {
    console.error('[ShopeeClient] Error in fetchAndSaveShopeeOrder:', err);
    return { success: false, error: err.message };
  }
}
