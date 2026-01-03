import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAndSaveShopeeOrder, getShopeeEscrowDetailsForOrders } from '@/lib/shopeeClient';

type ShopeeEscrowSyncResult = {
    requested: number;
    eligible: number;
    fetched: number;
    updated: number;
    failedOrders?: string[];
    skippedOrders?: string[];
    updatedOrders?: string[];
};

const ESCROW_FETCH_CHUNK_SIZE = 200;
const MAX_FETCH_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const chunkArray = <T,>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

const syncMissingShopeeOrders = async (
    orderSns: string[],
    options?: { concurrency?: number; delayMs?: number }
) => {
    const updated = new Set<string>();
    const failed = new Set<string>();
    const concurrencyRaw = options?.concurrency ?? 3;
    const delayRaw = options?.delayMs ?? 120;
    const concurrency = Math.min(4, Math.max(1, Math.floor(concurrencyRaw)));
    const delayMs = Math.max(0, Math.floor(delayRaw));
    for (let i = 0; i < orderSns.length; i += concurrency) {
        const batch = orderSns.slice(i, i + concurrency);
        await Promise.all(batch.map(async (orderSn) => {
            try {
                const result = await fetchAndSaveShopeeOrder(orderSn);
                if (result.success) {
                    updated.add(orderSn);
                } else {
                    failed.add(orderSn);
                }
            } catch {
                failed.add(orderSn);
            }
        }));
        if (delayMs > 0 && i + concurrency < orderSns.length) {
            await sleep(delayMs);
        }
    }
    return { updated, failed };
};

const fetchShopeeOrdersChunk = async (orderSns: string[], attempt = 1): Promise<{ data: any[]; error?: any }> => {
    try {
        const { data, error } = await supabaseAdmin
            .from('shopee_orders')
            .select('order_sn, raw_payload, escrow_fetched_at, escrow_amount')
            .in('order_sn', orderSns);

        if (!error) {
            return { data: data || [] };
        }

        if (attempt >= MAX_FETCH_ATTEMPTS) {
            return { data: data || [], error };
        }
    } catch (error) {
        if (attempt >= MAX_FETCH_ATTEMPTS) {
            return { data: [], error };
        }
    }

    const delayMs = 400 * Math.pow(2, attempt - 1);
    await sleep(delayMs);
    return fetchShopeeOrdersChunk(orderSns, attempt + 1);
};

const hasMissingEscrowData = (row: any) => {
    if (!row) return false;
    if (!row.escrow_fetched_at) return true;
    if (row.escrow_amount === null || row.escrow_amount === undefined) return true;
    const hasEscrowDetail = !!row.raw_payload?.escrow_detail;
    return !hasEscrowDetail;
};

export async function syncShopeeEscrowForOrders(
    orderSnList: string[],
    options?: { concurrency?: number; delayMs?: number }
): Promise<ShopeeEscrowSyncResult> {
    const uniqueOrderSns = Array.from(new Set(
        orderSnList
            .filter((orderSn) => !!orderSn)
            .map((orderSn) => String(orderSn).trim())
            .filter((orderSn) => orderSn.length > 0)
    ));

    if (uniqueOrderSns.length === 0) {
        return { requested: 0, eligible: 0, fetched: 0, updated: 0 };
    }

    const ordersByOrderSn = new Map<string, any>();
    const chunks = chunkArray(uniqueOrderSns, ESCROW_FETCH_CHUNK_SIZE);
    for (const chunk of chunks) {
        const { data, error } = await fetchShopeeOrdersChunk(chunk);
        if (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[Shopee Escrow Sync] Failed to load chunk:', message);
            continue;
        }
        for (const row of data || []) {
            if (row?.order_sn) {
                ordersByOrderSn.set(row.order_sn, row);
            }
        }
    }

    const orders = Array.from(ordersByOrderSn.values());
    const existingOrderSns = new Set(orders.map((order) => order.order_sn));
    const missingOrderSns = uniqueOrderSns.filter((orderSn) => !existingOrderSns.has(orderSn));
    const eligibleOrders = orders.filter(hasMissingEscrowData);
    const eligibleExistingOrderSns = eligibleOrders.map((order) => order.order_sn);
    const eligibleOrderSns = [
        ...eligibleExistingOrderSns,
        ...missingOrderSns,
    ];
    const eligibleSet = new Set(eligibleOrderSns);
    const skippedOrders = uniqueOrderSns.filter((orderSn) => !eligibleSet.has(orderSn));

    if (eligibleOrderSns.length === 0) {
        return {
            requested: uniqueOrderSns.length,
            eligible: 0,
            fetched: 0,
            updated: 0,
            skippedOrders,
        };
    }

    const rawPayloadByOrderSn = new Map<string, any>();
    eligibleOrders.forEach((row) => {
        rawPayloadByOrderSn.set(row.order_sn, row.raw_payload);
    });

    const mergeEscrowDetail = (rawPayload: any, escrow: any) => {
        const base = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
            ? rawPayload
            : {};
        return {
            ...base,
            escrow_detail: escrow,
        };
    };

    // Retryable fetch with up to 3 passes to be resilient to 429/5xx
    const escrowMap = new Map<string, any>();
    const passes = [
        { delay: 0 },
        { delay: 500 },
        { delay: 1500 },
    ];

    for (const pass of passes) {
        const remaining = eligibleExistingOrderSns.filter((sn) => !escrowMap.has(sn));
        if (remaining.length === 0) break;
        if (pass.delay > 0) {
            await new Promise((r) => setTimeout(r, pass.delay));
        }
        const batchMap = await getShopeeEscrowDetailsForOrders(remaining, options);
        for (const [sn, escrow] of batchMap.entries()) {
            if (!escrowMap.has(sn)) {
                escrowMap.set(sn, escrow);
            }
        }
    }

    let updated = 0;
    const updatedOrders = new Set<string>();
    const failedOrderSet = new Set<string>();
    const missingAfterFetch = eligibleExistingOrderSns.filter((sn) => !escrowMap.has(sn));
    missingAfterFetch.forEach((sn) => failedOrderSet.add(sn));
    for (const [orderSn, escrow] of escrowMap) {
        const nextRawPayload = mergeEscrowDetail(rawPayloadByOrderSn.get(orderSn), escrow);
        const payload = {
            voucher_from_seller: escrow.voucher_from_seller,
            voucher_from_shopee: escrow.voucher_from_shopee,
            seller_voucher_code: escrow.seller_voucher_code,
            escrow_amount: escrow.escrow_amount,
            ams_commission_fee: escrow.ams_commission_fee,
            order_selling_price: escrow.order_selling_price,
            order_discounted_price: escrow.order_discounted_price,
            seller_discount: escrow.seller_discount,
            total_amount: escrow.buyer_total_amount ?? undefined,
            raw_payload: nextRawPayload,
            escrow_fetched_at: new Date().toISOString(),
        };
        const { error: updateError } = await (supabaseAdmin as any)
            .from('shopee_orders')
            .update(payload)
            .eq('order_sn', orderSn);

        if (updateError) {
            console.error('[Shopee Escrow Sync] Update error:', updateError.message);
            failedOrderSet.add(orderSn);
        } else {
            updated += 1;
            updatedOrders.add(orderSn);
        }
    }

    let missingUpdatedCount = 0;
    if (missingOrderSns.length > 0) {
        const missingResult = await syncMissingShopeeOrders(missingOrderSns, options);
        missingResult.failed.forEach((sn) => failedOrderSet.add(sn));
        missingResult.updated.forEach((sn) => updatedOrders.add(sn));
        missingUpdatedCount = missingResult.updated.size;
        updated += missingUpdatedCount;
    }

    return {
        requested: uniqueOrderSns.length,
        eligible: eligibleOrderSns.length,
        fetched: escrowMap.size + missingUpdatedCount,
        updated,
        failedOrders: Array.from(failedOrderSet),
        skippedOrders,
        updatedOrders: Array.from(updatedOrders),
    };
}
