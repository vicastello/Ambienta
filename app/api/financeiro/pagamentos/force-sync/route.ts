
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAndSaveTinyOrder } from '@/lib/tinyClient';
import { fetchAndSaveShopeeOrder } from '@/lib/shopeeClient';

export async function POST(req: NextRequest) {
    try {
        const { orderIds, marketplace } = await req.json();

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return NextResponse.json({ success: false, error: 'No order IDs provided' }, { status: 400 });
        }

        if (!marketplace) {
            return NextResponse.json({ success: false, error: 'Marketplace not specified' }, { status: 400 });
        }

        const results: { orderId: string; success: boolean; error?: string }[] = [];
        const uniqueOrderIds = [...new Set(orderIds)];

        console.log(`[ForceSync] Starting sync for ${uniqueOrderIds.length} orders on ${marketplace}`);

        // Process in parallel with concurrency limit (e.g., 5) to avoid rate limits
        const CONCURRENCY = 3;
        const batches = [];
        for (let i = 0; i < uniqueOrderIds.length; i += CONCURRENCY) {
            batches.push(uniqueOrderIds.slice(i, i + CONCURRENCY));
        }

        for (const batch of batches) {
            await Promise.all(batch.map(async (orderId: string) => {
                let tinySuccess = true;
                let tinyError = '';
                let shopeeSuccess = true;
                let shopeeError = '';

                // Strip suffix if present (e.g. _AJUSTE) used internally
                // But for syncing we need the base ID
                const baseOrderId = orderId.split('_')[0];

                // 1. Sync with Tiny (always attempts this)
                try {
                    const tinyResult = await fetchAndSaveTinyOrder(baseOrderId, marketplace);
                    if (!tinyResult.success) {
                        tinySuccess = false;
                        tinyError = tinyResult.error || 'Unknown error syncing with Tiny';
                    }
                } catch (err: any) {
                    tinySuccess = false;
                    tinyError = err.message;
                }

                // 2. Sync with Shopee (if marketplace is Shopee)
                if (marketplace === 'shopee') {
                    try {
                        const shopeeResult = await fetchAndSaveShopeeOrder(baseOrderId);
                        if (!shopeeResult.success) {
                            shopeeSuccess = false;
                            shopeeError = shopeeResult.error || 'Unknown error syncing with Shopee';
                        }
                    } catch (err: any) {
                        shopeeSuccess = false;
                        shopeeError = err.message;
                    }
                }

                results.push({
                    orderId,
                    success: tinySuccess && shopeeSuccess,
                    error: [tinyError, shopeeError].filter(Boolean).join(' | ')
                });
            }));

            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`[ForceSync] Completed. Success: ${successCount}, Fail: ${results.length - successCount}`);

        return NextResponse.json({
            success: true,
            results,
            summary: {
                total: results.length,
                success: successCount,
                failed: results.length - successCount
            }
        });

    } catch (error: any) {
        console.error('[ForceSync] Handler error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
