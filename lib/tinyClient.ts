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
            // Tiny API expects form-urlencoded data, not JSON
            const formData = new URLSearchParams();
            formData.set('token', token);
            formData.set('formato', 'json');
            formData.set('numero_ecommerce', marketplaceOrderId);

            const response = await fetch(`${TINY_API_BASE}/pedidos.pesquisa.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });

            // Try to parse as JSON first, regardless of content-type
            // Tiny sometimes returns JSON with text/html or other content types
            const text = await response.text();
            let data: any;

            try {
                data = JSON.parse(text);
                console.log('[TinyClient] Parsed JSON response successfully');
            } catch {
                // Response is not valid JSON (likely XML or HTML error page)
                console.error('[TinyClient] Received non-JSON response:', text.substring(0, 300));

                // Check if it's an authentication error in XML/HTML
                if (text.includes('Token inválido') || text.includes('Token invalido')) {
                    return { error: 'Token da Tiny inválido ou expirado' };
                }
                if (text.includes('Acesso negado')) {
                    return { error: 'Acesso negado pela API Tiny. Verifique as permissões do token.' };
                }
                // Check for XML success status (Tiny sometimes returns XML even with formato=json)
                if (text.includes('<status>OK</status>') || text.includes('<status_processamento>2</status_processamento>')) {
                    // Try to extract data from XML - for now return empty orders
                    console.warn('[TinyClient] Received XML instead of JSON, but status is OK');
                    return { orders: [], error: 'API retornou XML - pedido pode não existir' };
                }
                if (text.includes('Nenhum registro encontrado')) {
                    return { orders: [] };
                }

                return { error: `Erro ao comunicar com a API Tiny. Resposta: ${text.substring(0, 100)}` };
            }

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
