/**
 * Enhanced Tiny ERP API Client
 * Includes rate limit protection and exponential backoff
 */

import { supabaseAdmin } from './supabaseAdmin';

const TINY_API_BASE = 'https://api.tiny.com.br/api2';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// In-memory cache for recent lookups (5 minutes TTL)
const orderCache = new Map<string, { data: any; expiresAt: number }>();

type TinyOrder = {
    id: number;
    numero_pedido: string;
    cliente_nome: string;
    valor_total_pedido: number;
    data_pedido: string;
    marketplace?: string;
};

type FetchResult = {
    orders?: TinyOrder[];
    error?: string;
    rateLimited?: boolean;
    retryAfter?: number;
};

/**
 * Get Tiny API token from database
 */
async function getTinyToken(): Promise<string | null> {
    const { data } = await supabaseAdmin
        .from('tiny_tokens')
        .select('access_token')
        .limit(1)
        .single();

    return data?.access_token || null;
}

/**
 * Fetch order from Tiny API by marketplace order ID
 * Includes rate limit handling and caching
 */
export async function fetchTinyOrderByMarketplaceId(
    marketplaceOrderId: string,
    marketplace: string
): Promise<FetchResult> {
    const cacheKey = `${marketplace}:${marketplaceOrderId}`;

    // Check cache first
    const cached = orderCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return { orders: cached.data };
    }

    const token = await getTinyToken();
    if (!token) {
        return { error: 'Token da Tiny não encontrado' };
    }

    let lastError: any = null;
    let retryDelay = INITIAL_BACKOFF_MS;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // Search by marketplace order ID in Tiny
            const response = await fetch(`${TINY_API_BASE}/pedidos.pesquisa.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token,
                    formato: 'json',
                    numero_ecommerce: marketplaceOrderId,
                }),
            });

            const data = await response.json();

            // Check for rate limit (429 or specific Tiny error)
            if (response.status === 429 || data.retorno?.codigo_erro === '429') {
                console.warn(`[TinyClient] Rate limited on attempt ${attempt + 1}`);

                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retryDelay *= 2; // Exponential backoff
                    continue;
                } else {
                    return {
                        rateLimited: true,
                        retryAfter: Math.ceil(retryDelay / 1000),
                    };
                }
            }

            // Check for API errors
            if (data.retorno?.status === 'Erro') {
                return {
                    error: data.retorno.erros?.[0]?.erro || 'Erro desconhecido da API Tiny',
                };
            }

            // Parse orders
            const orders: TinyOrder[] = [];
            if (data.retorno?.pedidos) {
                for (const pedidoWrapper of data.retorno.pedidos) {
                    const pedido = pedidoWrapper.pedido;
                    orders.push({
                        id: parseInt(pedido.id),
                        numero_pedido: pedido.numero || pedido.numero_pedido,
                        cliente_nome: pedido.cliente?.nome || pedido.nome_cliente || 'N/A',
                        valor_total_pedido: parseFloat(pedido.valor_total || pedido.total || 0),
                        data_pedido: pedido.data_pedido || new Date().toISOString(),
                        marketplace: pedido.ecommerce?.nome || marketplace,
                    });
                }
            }

            // Cache the result
            orderCache.set(cacheKey, {
                data: orders,
                expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            });

            return { orders };

        } catch (error) {
            lastError = error;
            console.error(`[TinyClient] Attempt ${attempt + 1} failed:`, error);

            if (attempt < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2;
            }
        }
    }

    return {
        error: lastError instanceof Error ? lastError.message : 'Erro ao conectar com a API Tiny',
    };
}

/**
 * Fetch and save order from Tiny to database
 * Used for manual linking when order doesn't exist locally
 */
export async function fetchAndSaveTinyOrder(
    marketplaceOrderId: string,
    marketplace: string
): Promise<{ success: boolean; tinyOrderId?: number; error?: string }> {
    const result = await fetchTinyOrderByMarketplaceId(marketplaceOrderId, marketplace);

    if (result.error || result.rateLimited) {
        return {
            success: false,
            error: result.error || 'Rate limited',
        };
    }

    if (!result.orders || result.orders.length === 0) {
        return {
            success: false,
            error: 'Pedido não encontrado na Tiny',
        };
    }

    const order = result.orders[0];

    // Save to tiny_orders if not exists
    const { data: existing } = await supabaseAdmin
        .from('tiny_orders')
        .select('id')
        .eq('id', order.id)
        .maybeSingle();

    if (!existing) {
        const { error: insertError } = await supabaseAdmin
            .from('tiny_orders')
            .insert({
                id: order.id,
                numero_pedido: order.numero_pedido,
                cliente_nome: order.cliente_nome,
                valor_total_pedido: order.valor_total_pedido,
                data_pedido: order.data_pedido,
                // Add other fields as needed
            });

        if (insertError) {
            console.error('[TinyClient] Error saving order:', insertError);
            return {
                success: false,
                error: 'Erro ao salvar pedido no banco de dados',
            };
        }
    }

    return {
        success: true,
        tinyOrderId: order.id,
    };
}
