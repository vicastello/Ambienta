import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

type SyncItem = {
    marketplaceOrderId: string;
    marketplace: 'shopee' | 'mercado_livre' | 'magalu';
    syncType?: 'link' | 'escrow';
};

const ESCROW_BATCH_SIZE = 25;
const ESCROW_CONCURRENCY = 6;
const ESCROW_DELAY_MS = 120;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const chunkArray = <T,>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};
const normalizeOrderId = (orderId: string) =>
    orderId
        .replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA|FRETE|COMISSAO)(?:_?\d+)?$/i, '')
        .replace(/_\d+$/, '');

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
                const { syncShopeeEscrowForOrders } = await import('@/lib/shopeeEscrowSync');

                const normalizedOrders = orders.map((order) => ({
                    ...order,
                    syncType: order.syncType ?? 'link',
                }));

                const linkOrders = normalizedOrders.filter((order) => order.syncType !== 'escrow');
                const escrowOrders = normalizedOrders.filter((order) => order.syncType === 'escrow');

                let current = 0;

                // Process link orders (Tiny + optional Shopee detail)
                for (const order of linkOrders) {
                    const { marketplaceOrderId, marketplace } = order;
                    const baseOrderId = normalizeOrderId(marketplaceOrderId);
                    current += 1;

                    sendEvent({
                        type: 'progress',
                        current,
                        total,
                        orderId: baseOrderId,
                        message: `Sincronizando ${baseOrderId}...`,
                    });

                    if (!baseOrderId) {
                        stats.skipped++;
                        sendEvent({
                            type: 'error',
                            current,
                            total,
                            orderId: marketplaceOrderId,
                            message: 'Pedido inválido para sincronização',
                        });
                        continue;
                    }

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
                            sendEvent({
                                type: 'success',
                                current,
                                total,
                                orderId: baseOrderId,
                                message: `⟳ ${baseOrderId} já vinculado`,
                            });
                            continue;
                        }

                        // 1. Sync from Tiny API
                        const tinyResult = await fetchAndSaveTinyOrder(baseOrderId, marketplace, true);

                        if (!tinyResult.success) {
                            // Not finding in Tiny might be expected for some transaction types
                            if (tinyResult.error?.includes('não encontrado')) {
                                stats.skipped++;
                                sendEvent({
                                    type: 'success',
                                    current,
                                    total,
                                    orderId: baseOrderId,
                                    message: `⟳ ${baseOrderId} não encontrado no Tiny`,
                                });
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
                            current,
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
                            current,
                            total,
                            orderId: baseOrderId,
                            message: errorMsg,
                        });

                        // If rate limited, add longer delay
                        if (orderError.message?.includes('429') || orderError.message?.includes('rate')) {
                            await sleep(5000);
                        }
                    }

                    // Small delay to avoid overwhelming the APIs
                    // Tiny API has ~60 requests/min limit
                    if (current < total) {
                        await sleep(300);
                    }
                }

                // Process escrow-only orders (Shopee only)
                const escrowShopeeOrders = escrowOrders.filter((order) => order.marketplace === 'shopee');
                const escrowOtherOrders = escrowOrders.filter((order) => order.marketplace !== 'shopee');

                for (const order of escrowOtherOrders) {
                    const baseOrderId = normalizeOrderId(order.marketplaceOrderId);
                    current += 1;
                    stats.skipped++;
                    sendEvent({
                        type: 'progress',
                        current,
                        total,
                        orderId: baseOrderId,
                        message: `Escrow não aplicável para ${baseOrderId}`,
                    });
                    sendEvent({
                        type: 'success',
                        current,
                        total,
                        orderId: baseOrderId,
                        message: `⟳ ${baseOrderId} ignorado (sem escrow)`,
                    });
                }

                const escrowChunks = chunkArray(escrowShopeeOrders, ESCROW_BATCH_SIZE);
                for (const chunk of escrowChunks) {
                    const orderIds = chunk
                        .map((order) => normalizeOrderId(order.marketplaceOrderId))
                        .filter((orderId) => orderId.length > 0);
                    const uniqueOrderIds = Array.from(new Set(orderIds));

                    if (uniqueOrderIds.length > 0) {
                        try {
                            const escrowResult = await syncShopeeEscrowForOrders(uniqueOrderIds, {
                                concurrency: ESCROW_CONCURRENCY,
                                delayMs: ESCROW_DELAY_MS,
                            });
                            const failed = new Set(escrowResult.failedOrders || []);
                            const skipped = new Set(escrowResult.skippedOrders || []);

                            for (const order of chunk) {
                                const baseOrderId = normalizeOrderId(order.marketplaceOrderId);
                                current += 1;
                                sendEvent({
                                    type: 'progress',
                                    current,
                                    total,
                                    orderId: baseOrderId,
                                    message: `Buscando escrow ${baseOrderId}...`,
                                });

                                if (!baseOrderId) {
                                    stats.skipped++;
                                    sendEvent({
                                        type: 'error',
                                        current,
                                        total,
                                        orderId: order.marketplaceOrderId,
                                        message: 'Pedido inválido para escrow',
                                    });
                                    continue;
                                }

                                if (failed.has(baseOrderId)) {
                                    stats.failed++;
                                    const errorMsg = `${baseOrderId}: Falha ao sincronizar escrow`;
                                    errors.push(errorMsg);
                                    sendEvent({
                                        type: 'error',
                                        current,
                                        total,
                                        orderId: baseOrderId,
                                        message: errorMsg,
                                    });
                                } else if (skipped.has(baseOrderId)) {
                                    stats.skipped++;
                                    sendEvent({
                                        type: 'success',
                                        current,
                                        total,
                                        orderId: baseOrderId,
                                        message: `⟳ ${baseOrderId} já atualizado`,
                                    });
                                } else {
                                    stats.synced++;
                                    sendEvent({
                                        type: 'success',
                                        current,
                                        total,
                                        orderId: baseOrderId,
                                        message: `✓ ${baseOrderId} escrow atualizado`,
                                    });
                                }
                            }
                        } catch (escrowError: any) {
                            console.error('[BatchSync] Shopee escrow sync failed:', escrowError);
                            for (const order of chunk) {
                                const baseOrderId = normalizeOrderId(order.marketplaceOrderId);
                                current += 1;
                                stats.failed++;
                                const errorMsg = `${baseOrderId}: Falha ao sincronizar escrow`;
                                errors.push(errorMsg);
                                sendEvent({
                                    type: 'progress',
                                    current,
                                    total,
                                    orderId: baseOrderId,
                                    message: `Buscando escrow ${baseOrderId}...`,
                                });
                                sendEvent({
                                    type: 'error',
                                    current,
                                    total,
                                    orderId: baseOrderId,
                                    message: errorMsg,
                                });
                            }
                        }
                    } else {
                        for (const order of chunk) {
                            const baseOrderId = normalizeOrderId(order.marketplaceOrderId);
                            current += 1;
                            stats.skipped++;
                            sendEvent({
                                type: 'progress',
                                current,
                                total,
                                orderId: baseOrderId,
                                message: `Escrow não aplicável para ${baseOrderId}`,
                            });
                            sendEvent({
                                type: 'success',
                                current,
                                total,
                                orderId: baseOrderId,
                                message: `⟳ ${baseOrderId} ignorado (sem escrow)`,
                            });
                        }
                    }

                    if (chunk !== escrowChunks[escrowChunks.length - 1]) {
                        await sleep(200);
                    }
                }

                // Send final completion event
                sendEvent({
                    type: 'complete',
                    current: total,
                    total,
                    message: `Sincronização concluída: ${stats.synced} atualizados, ${stats.linked} vinculados, ${stats.failed} erros, ${stats.skipped} ignorados`,
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
