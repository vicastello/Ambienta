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
 * Get Tiny API token from database (with auto-refresh)
 */
async function getTinyToken(): Promise<string | null> {
    try {
        // Use the auth module that handles token refresh automatically
        const { getAccessTokenFromDbOrRefresh } = await import('./tinyAuth');
        const token = await getAccessTokenFromDbOrRefresh();
        return token;
    } catch (error) {
        console.error('[TinyClient] Error getting token:', error);
        return null;
    }
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

    console.log('[TinyClient] Searching for order using API v3:', {
        marketplaceOrderId,
        marketplace,
        tokenPrefix: token.substring(0, 20) + '...',
    });

    try {
        // Use the v3 API with Bearer token authentication
        const { tinyGet, TinyApiError } = await import('./tinyApi');

        // Search by marketplace order ID (numeroPedidoEcommerce in v3 API)
        const response = await tinyGet<{
            itens?: Array<{
                id: number;
                numeroPedido: number;
                cliente?: { nome?: string };
                ecommerce?: { numeroPedidoEcommerce?: string; canal?: string };
                dataCriacao: string;
                valorTotalPedido?: number | string;
            }>;
            paginacao?: { total: number };
        }>('/pedidos', token, {
            numeroPedidoEcommerce: marketplaceOrderId,
            limit: 10,
        }, {
            context: 'manual-link-search',
            endpointLabel: '/pedidos (search by ecommerce)',
        });

        console.log('[TinyClient] API v3 response:', {
            hasItems: !!response.itens,
            itemsCount: response.itens?.length || 0,
            total: response.paginacao?.total || 0,
        });

        // Parse orders from v3 response format
        const orders: TinyOrder[] = [];
        if (response.itens && response.itens.length > 0) {
            for (const pedido of response.itens) {
                orders.push({
                    id: pedido.id,
                    numero_pedido: String(pedido.numeroPedido),
                    cliente_nome: pedido.cliente?.nome || 'N/A',
                    valor_total_pedido: typeof pedido.valorTotalPedido === 'string'
                        ? parseFloat(pedido.valorTotalPedido)
                        : (pedido.valorTotalPedido || 0),
                    data_pedido: pedido.dataCriacao || new Date().toISOString(),
                    marketplace: pedido.ecommerce?.canal || marketplace,
                });
            }
        }

        // Cache the result
        orderCache.set(cacheKey, {
            data: orders,
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        });

        return { orders };

    } catch (error: any) {
        console.error('[TinyClient] Error searching order:', error);

        // Check for rate limit
        if (error?.status === 429) {
            return {
                rateLimited: true,
                retryAfter: 5,
            };
        }

        // Return error message
        const errorMessage = error?.message || error?.body || 'Erro desconhecido';
        return { error: `Erro ao buscar pedido: ${errorMessage}` };
    }
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
                tiny_id: order.id,
                numero_pedido: order.numero_pedido,
                cliente_nome: order.cliente_nome,
                valor_total_pedido: order.valor_total_pedido,
                data_criacao: order.data_pedido,
                canal: order.marketplace,
            } as any);

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
