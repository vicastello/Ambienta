import 'server-only';
import crypto from 'node:crypto';
import type { ShopeeOrderListResponse, ShopeeOrderStatus } from '@/src/types/shopee';

const SHOPEE_BASE_URL = 'https://partner.shopeemobile.com/api/v2';

function getShopeeConfig() {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const shopId = process.env.SHOPEE_SHOP_ID;
  const accessToken = process.env.SHOPEE_ACCESS_TOKEN;

  if (!partnerId) throw new Error('Missing SHOPEE_PARTNER_ID env var');
  if (!partnerKey) throw new Error('Missing SHOPEE_PARTNER_KEY env var');
  if (!shopId) throw new Error('Missing SHOPEE_SHOP_ID env var');
  if (!accessToken) throw new Error('Missing SHOPEE_ACCESS_TOKEN env var');

  return {
    partnerId,
    partnerKey,
    shopId,
    accessToken,
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
  const timestamp = Math.floor(Date.now() / 1000);
  const isShopLevel = Boolean(options?.accessToken && options?.shopId);
  const { partnerId } = getShopeeConfig();

  const sign = generateShopeeSignature(path, timestamp, {
    accessToken: isShopLevel ? options?.accessToken : undefined,
    shopId: isShopLevel ? options?.shopId : undefined,
  });

  const url = new URL(SHOPEE_BASE_URL + path);
  const searchParams = url.searchParams;

  searchParams.set('partner_id', partnerId);
  searchParams.set('timestamp', String(timestamp));
  searchParams.set('sign', sign);

  if (isShopLevel) {
    searchParams.set('access_token', options!.accessToken!);
    searchParams.set('shop_id', options!.shopId!);
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
    throw new Error(`Shopee request failed (${res.status}): ${data?.message ?? data?.error ?? 'Unknown error'}`);
  }

  const errorCode = data?.error;
  const errorMessage = data?.message ?? data?.error_msg;
  if (errorCode && errorCode !== '0') {
    throw new Error(`Shopee error ${errorCode}: ${errorMessage ?? 'Unknown error'}`);
  }
  if (typeof errorMessage === 'string' && errorMessage.toLowerCase() !== 'success') {
    throw new Error(`Shopee: ${errorMessage}`);
  }

  return data as T;
}

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

  // Para estender para outros endpoints, reutilize shopeeRequest alterando path e params.
  // Por exemplo: /order/get_order_detail ou /product/get_model_list.
  const { accessToken, shopId } = getShopeeConfig();
  return shopeeRequest<ShopeeOrderListResponse>(path, queryParams, {
    accessToken,
    shopId,
  });
}
