/**
 * Cliente Magalu - Nova API OAuth 2.0
 * Base: https://api.magalu.com
 * Auth: OAuth 2.0 via ID Magalu
 */

import { supabaseAdmin } from './supabaseAdmin';

const MAGALU_API_BASE = 'https://api.magalu.com';
const MAGALU_TOKEN_URL = 'https://id.magalu.com/oauth/token';

// Channel ID do Magazine Luiza
const MAGALU_CHANNEL_ID = '9fe0d853-732b-4e4a-a0b0-cff988ed043d';

// ============ TIPOS ============

export interface MagaluTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: Date;
  scope: string;
  tenant_id?: string;
}

export interface MagaluOrderItem {
  code: string;
  sku: {
    code: string;
    name: string;
  };
  quantity: number;
  unit_price: {
    total: number;
    freight: number;
    discount: number;
  };
}

export interface MagaluDelivery {
  code: string;
  delivered_carrier_date?: string;
  estimate_delivery_date?: string;
  type: string;
  recipient: {
    name: string;
    phone?: string;
    document_number?: string;
  };
  address: {
    city: string;
    state: string;
    neighborhood?: string;
    street?: string;
    number?: string;
    complement?: string;
    zip_code?: string;
  };
  items: MagaluOrderItem[];
}

export interface MagaluOrder {
  code: string;
  channel: {
    id: string;
    name?: string;
  };
  placed_at: string;
  updated_at: string;
  approved_at?: string;
  status: string;
  sub_status?: string;
  customer: {
    document_number?: string;
    name: string;
    email?: string;
    phone?: string;
  };
  handling_time?: {
    limit_date: string;
  };
  total: {
    order: number;
    freight: number;
    discount: number;
  };
  deliveries: MagaluDelivery[];
  payments?: Array<{
    method: string;
    installments: number;
    value: number;
  }>;
}

export interface MagaluOrderListResponse {
  results: MagaluOrder[];
  meta: {
    page: {
      limit: number;
      offset: number;
      count: number;
      max_limit: number;
    };
    links?: {
      next?: string;
      self?: string;
    };
  };
}

// ============ GERENCIAMENTO DE TOKENS ============

/**
 * Busca tokens do banco de dados
 */
async function getTokensFromDb(): Promise<MagaluTokens | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any)
    .from('magalu_tokens')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type || 'Bearer',
    expires_in: data.expires_in,
    expires_at: new Date(data.expires_at),
    scope: data.scope,
    tenant_id: data.tenant_id,
  };
}

/**
 * Salva tokens no banco de dados
 */
export async function saveTokensToDb(tokens: {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
  scope?: string;
  tenant_id?: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any)
    .from('magalu_tokens')
    .upsert({
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      expires_in: tokens.expires_in,
      expires_at: expiresAt.toISOString(),
      scope: tokens.scope,
      tenant_id: tokens.tenant_id,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Erro ao salvar tokens Magalu: ${error.message}`);
  }
}

/**
 * Faz refresh do access_token usando o refresh_token
 */
async function refreshAccessToken(refreshToken: string): Promise<MagaluTokens> {
  const clientId = process.env.MAGALU_CLIENT_ID;
  const clientSecret = process.env.MAGALU_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('MAGALU_CLIENT_ID e MAGALU_CLIENT_SECRET não configurados');
  }

  console.log('[Magalu] Fazendo refresh do access_token...');

  const response = await fetch(MAGALU_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Magalu] Erro no refresh:', response.status, errorText);
    throw new Error(`Erro ao renovar token Magalu: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  const tokens: MagaluTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type || 'Bearer',
    expires_in: data.expires_in,
    expires_at: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
  };

  // Salvar novos tokens
  await saveTokensToDb(tokens);

  console.log('[Magalu] Token renovado com sucesso!');
  return tokens;
}

/**
 * Obtém um access_token válido (renovando se necessário)
 */
export async function getValidAccessToken(): Promise<string> {
  const tokens = await getTokensFromDb();

  if (!tokens) {
    throw new Error('Magalu não configurado. Faça a autenticação OAuth primeiro.');
  }

  // Verificar se token está expirado (com margem de 5 minutos)
  const now = new Date();
  const expiresAt = new Date(tokens.expires_at);
  const marginMs = 5 * 60 * 1000; // 5 minutos

  if (expiresAt.getTime() - marginMs <= now.getTime()) {
    console.log('[Magalu] Token expirado ou próximo de expirar, renovando...');
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    return newTokens.access_token;
  }

  return tokens.access_token;
}

// ============ CHAMADAS À API ============

interface MagaluRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Faz uma requisição autenticada à API do Magalu
 */
async function magaluRequest<T>(
  path: string,
  options: MagaluRequestOptions = {}
): Promise<T> {
  const tokens = await getTokensFromDb();
  if (!tokens) {
    throw new Error('Tokens Magalu não encontrados. Faça login primeiro.');
  }

  const accessToken = await getValidAccessToken();
  const { method = 'GET', body, headers = {} } = options;

  const url = `${MAGALU_API_BASE}${path}`;

  // Headers obrigatórios para API do Magalu
  const requestHeaders: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...headers,
  };

  // X-Tenant-Id é obrigatório para endpoints de seller
  if (tokens.tenant_id) {
    requestHeaders['X-Tenant-Id'] = tokens.tenant_id;
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    
    // Se token inválido, tentar renovar e refazer requisição
    if (response.status === 401) {
      console.log('[Magalu] Token inválido, tentando renovar...');
      if (tokens) {
        await refreshAccessToken(tokens.refresh_token);
        // Refazer requisição com novo token
        return magaluRequest<T>(path, options);
      }
    }

    throw new Error(`Magalu API Error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ============ ENDPOINTS DE PEDIDOS ============

export interface ListOrdersParams {
  limit?: number;       // máx 100
  offset?: number;
  status?: string;
  placed_at_from?: string; // ISO date
  placed_at_to?: string;
  updated_at_from?: string;
  updated_at_to?: string;
}

/**
 * Lista pedidos do Magalu
 * GET /seller/v1/orders
 */
export async function listMagaluOrdersV2(params: ListOrdersParams = {}): Promise<MagaluOrderListResponse> {
  const searchParams = new URLSearchParams();

  if (params.limit) searchParams.set('_limit', String(Math.min(params.limit, 100)));
  if (params.offset) searchParams.set('_offset', String(params.offset));
  if (params.status) searchParams.set('status', params.status);
  if (params.placed_at_from) searchParams.set('placed_at_from', params.placed_at_from);
  if (params.placed_at_to) searchParams.set('placed_at_to', params.placed_at_to);
  if (params.updated_at_from) searchParams.set('updated_at_from', params.updated_at_from);
  if (params.updated_at_to) searchParams.set('updated_at_to', params.updated_at_to);

  const query = searchParams.toString();
  const path = `/seller/v1/orders${query ? `?${query}` : ''}`;

  return magaluRequest<MagaluOrderListResponse>(path);
}

/**
 * Busca um pedido específico por código
 * GET /seller/v1/orders/:code
 */
export async function getMagaluOrderByCode(code: string): Promise<MagaluOrder> {
  return magaluRequest<MagaluOrder>(`/seller/v1/orders/${code}`);
}

/**
 * Busca todos os pedidos de um período (com paginação automática)
 */
export async function getAllMagaluOrdersForPeriod(params: {
  fromDate: Date;
  toDate: Date;
  onProgress?: (info: { loaded: number; total: number }) => void;
}): Promise<MagaluOrder[]> {
  const { fromDate, toDate, onProgress } = params;
  const allOrders: MagaluOrder[] = [];
  const limit = 100;
  let offset = 0;
  let total = 0;

  do {
    const response = await listMagaluOrdersV2({
      limit,
      offset,
      placed_at_from: fromDate.toISOString(),
      placed_at_to: toDate.toISOString(),
    });

    allOrders.push(...response.results);
    // API não retorna total, usa count e verifica se há next
    offset += limit;
    // Se count < limit, não há mais páginas
    if (response.meta.page.count < limit || !response.meta.links?.next) {
      break;
    }

    if (onProgress) {
      onProgress({ loaded: allOrders.length, total: allOrders.length });
    }

    // Rate limiting entre páginas
    await new Promise((r) => setTimeout(r, 200));
  } while (true);

  return allOrders;
}

// ============ MAPEAMENTO PARA DB ============

/**
 * Converte pedido da API para formato do banco
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMagaluOrderToDb(order: any, tenantId?: string) {
  const firstDelivery = order.deliveries?.[0];
  const shipping = firstDelivery?.shipping;
  const recipient = shipping?.recipient;
  const address = recipient?.address;

  // Valores vêm em centavos (normalizer: 100)
  const normalizer = order.amounts?.normalizer || 100;
  const totalAmount = (order.amounts?.total || 0) / normalizer;
  const totalFreight = (order.amounts?.freight?.total || 0) / normalizer;
  const totalDiscount = (order.amounts?.discount?.total || 0) / normalizer;

  return {
    id_order: order.code,
    id_order_marketplace: order.code,
    order_status: order.status,
    marketplace_name: 'Magalu',
    store_name: order.channel?.extras?.alias || 'Magazine Luiza',
    tenant_id: tenantId,

    // Datas
    inserted_date: new Date().toISOString(),
    purchased_date: order.purchased_at || order.created_at,
    approved_date: order.approved_at,
    updated_date: order.updated_at,
    estimated_delivery_date: shipping?.deadline?.limit_date,
    handling_time_limit: shipping?.deadline?.limit_date,

    // Valores (convertidos de centavos para reais)
    total_amount: totalAmount,
    total_freight: totalFreight,
    total_discount: totalDiscount,

    // Cliente/Destinatário
    receiver_name: recipient?.name || order.customer?.name,
    customer_mail: order.customer?.email,
    delivery_address_city: address?.city,
    delivery_address_state: address?.state,
    delivery_address_full: address
      ? `${address.street || ''} ${address.number || ''}, ${address.district || ''}, ${address.city || ''} - ${address.state || ''}, ${address.zipcode || ''}`
      : null,
    delivery_mode: shipping?.provider?.description || shipping?.provider?.name,

    // Metadata
    raw_payload: order,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Converte itens do pedido para formato do banco
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMagaluOrderItemsToDb(order: any) {
  const items: Array<{
    id_order: string;
    id_sku: string;
    id_order_package: number | null;
    product_name: string;
    quantity: number;
    price: number;
    freight: number;
    discount: number;
    raw_payload: unknown;
  }> = [];

  for (const delivery of order.deliveries || []) {
    // Normalizer para converter de centavos para reais
    const normalizer = delivery.amounts?.normalizer || 100;
    
    for (const item of delivery.items || []) {
      const itemNormalizer = item.amounts?.normalizer || item.unit_price?.normalizer || 100;
      const unitPrice = (item.unit_price?.value || 0) / itemNormalizer;
      const itemFreight = (item.amounts?.freight?.total || 0) / itemNormalizer;
      const itemDiscount = (item.amounts?.discount?.total || 0) / itemNormalizer;
      
      items.push({
        id_order: order.code,
        id_sku: item.info?.sku || item.sku?.code || item.code || '',
        id_order_package: null,
        product_name: item.info?.name || item.sku?.name || '',
        quantity: item.quantity || 1,
        price: unitPrice,
        freight: itemFreight,
        discount: itemDiscount,
        raw_payload: item,
      });
    }
  }

  return items;
}

// ============ VERIFICAÇÃO DE STATUS ============

/**
 * Verifica se o Magalu está configurado e autenticado
 */
export async function checkMagaluStatus(): Promise<{
  configured: boolean;
  authenticated: boolean;
  expiresAt?: Date;
  error?: string;
}> {
  const clientId = process.env.MAGALU_CLIENT_ID;
  const clientSecret = process.env.MAGALU_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      configured: false,
      authenticated: false,
      error: 'MAGALU_CLIENT_ID e MAGALU_CLIENT_SECRET não configurados',
    };
  }

  try {
    const tokens = await getTokensFromDb();
    if (!tokens) {
      return {
        configured: true,
        authenticated: false,
        error: 'Tokens não encontrados. Faça a autenticação OAuth.',
      };
    }

    return {
      configured: true,
      authenticated: true,
      expiresAt: tokens.expires_at,
    };
  } catch (error) {
    return {
      configured: true,
      authenticated: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// Exportar constante do channel ID
export { MAGALU_CHANNEL_ID };
