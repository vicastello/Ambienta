import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

type SyncItem = {
    marketplaceOrderId: string;
    marketplace: 'shopee' | 'mercado_livre' | 'magalu';
};

type ProgressEvent = {
    type: 'progress' | 'success' | 'error' | 'complete';
    current: number;
    total: number;
    orderId?: string;
    message?: string;
    errors?: string[];
    stats?: {
        synced: number;
        linked: number;
        failed: number;
        skipped: number;
    };
};

/**
 * POST /api/financeiro/pagamentos/batch-sync
 * 
 * Batch sync missing orders from Tiny and Shopee APIs.
 * Uses Server-Sent Events to stream progress updates.
 * 
 * Body: {
 *   orders: Array<{ marketplaceOrderId: string; marketplace: string }>
 * }
 */
export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();

    // Create a readable stream for SSE
    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (event: ProgressEvent) => {
                const data = `data: ${JSON.stringify(event)}\n\n`;
                controller.enqueue(encoder.encode(data));
            };

            try {
                const body = await request.json();
                const orders: SyncItem[] = body.orders || [];

                if (orders.length === 0) {
                    sendEvent({
                        type: 'error',
                        current: 0,
                        total: 0,
                        message: 'Nenhum pedido para sincronizar',
                    });
                    controller.close();
                    return;
                }

                const total = orders.length;
                const stats = { synced: 0, linked: 0, failed: 0, skipped: 0 };
                const errors: string[] = [];

                // Dynamic imports to avoid loading heavy modules up front
                const { fetchAndSaveTinyOrder } = await import('@/lib/tinyClient');
                const { fetchAndSaveShopeeOrder } = await import('@/lib/shopeeClient');

                // Process orders one by one with delays to avoid rate limits
                for (let i = 0; i < orders.length; i++) {
                    const { marketplaceOrderId, marketplace } = orders[i];

                    // Extract base order ID (remove suffixes like _AJUSTE, _2, etc.)
                    const baseOrderId = marketplaceOrderId
                        .replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA)(?:_\d+)?$|_\d+$/, '');

                    sendEvent({
                        type: 'progress',
                        current: i + 1,
                        total,
                        orderId: baseOrderId,
                        message: `Sincronizando ${baseOrderId}...`,
                    });

                    try {
                        // Check if link already exists
                        const { data: existingLink } = await supabaseAdmin
                            .from('marketplace_order_links')
                            .select('id')
                            .eq('marketplace', marketplace)
                            .eq('marketplace_order_id', baseOrderId)
                            .maybeSingle();

                        if (existingLink) {
                            stats.skipped++;
                            continue;
                        }

                        // 1. Sync from Tiny API
                        const tinyResult = await fetchAndSaveTinyOrder(baseOrderId, marketplace, true);

                        if (!tinyResult.success) {
                            // Not finding in Tiny might be expected for some transaction types
                            if (tinyResult.error?.includes('não encontrado')) {
                                stats.skipped++;
                                continue;
                            }
                            throw new Error(tinyResult.error || 'Falha ao sincronizar do Tiny');
                        }

                        stats.synced++;

                        // 2. Sync Shopee-specific data if applicable
                        if (marketplace === 'shopee') {
                            try {
                                await fetchAndSaveShopeeOrder(baseOrderId);
                            } catch (shopeeErr) {
                                // Non-blocking - Tiny sync is the critical part
                                console.warn(`[BatchSync] Shopee details failed for ${baseOrderId}:`, shopeeErr);
                            }
                        }

                        // 3. Create link (only if we have a valid tinyOrderId)
                        if (tinyResult.tinyOrderId) {
                            const { error: linkError } = await supabaseAdmin
                                .from('marketplace_order_links')
                                .insert({
                                    marketplace: marketplace as 'magalu' | 'shopee' | 'mercado_livre',
                                    marketplace_order_id: baseOrderId,
                                    tiny_order_id: tinyResult.tinyOrderId,
                                    linked_by: 'batch-sync',
                                    confidence_score: 1.0,
                                    notes: 'Sincronização automática via importação de pagamentos',
                                    product_count: tinyResult.productCount || 1,
                                });

                            if (linkError) {
                                // Might be duplicate - that's ok
                                if (!linkError.message.includes('duplicate')) {
                                    throw new Error(`Erro ao criar link: ${linkError.message}`);
                                }
                            }

                            stats.linked++;
                        }


                        sendEvent({
                            type: 'success',
                            current: i + 1,
                            total,
                            orderId: baseOrderId,
                            message: `✓ ${baseOrderId} sincronizado`,
                        });

                    } catch (orderError: any) {
                        stats.failed++;
                        const errorMsg = `${baseOrderId}: ${orderError.message || 'Erro desconhecido'}`;
                        errors.push(errorMsg);
                        console.error(`[BatchSync] Error for ${baseOrderId}:`, orderError);

                        sendEvent({
                            type: 'error',
                            current: i + 1,
                            total,
                            orderId: baseOrderId,
                            message: errorMsg,
                        });

                        // If rate limited, add longer delay
                        if (orderError.message?.includes('429') || orderError.message?.includes('rate')) {
                            await new Promise(r => setTimeout(r, 5000));
                        }
                    }

                    // Small delay to avoid overwhelming the APIs
                    // Tiny API has ~60 requests/min limit
                    if (i < orders.length - 1) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                }

                // Send final completion event
                sendEvent({
                    type: 'complete',
                    current: total,
                    total,
                    message: `Sincronização concluída: ${stats.linked} vinculados, ${stats.failed} erros, ${stats.skipped} ignorados`,
                    errors: errors.length > 0 ? errors : undefined,
                    stats,
                });

            } catch (error: any) {
                console.error('[BatchSync] Fatal error:', error);
                sendEvent({
                    type: 'error',
                    current: 0,
                    total: 0,
                    message: `Erro fatal: ${error.message || 'Erro desconhecido'}`,
                });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
