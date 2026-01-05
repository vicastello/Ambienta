import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { syncShopeeEscrowForOrders } from '@/lib/shopeeEscrowSync';
import { parsePaymentFile, type ParsedPayment } from '@/lib/paymentParsers';
import { applySmartTags, detectMultiEntry, convertDbRulesToTagRules } from '@/lib/smartTagger';
import { calculateMarketplaceFees } from '@/lib/marketplace-fees';
import {
    RulesEngine,
    getSystemRules,
    getCachedRules,
    setCachedRules,
    normalizeMarketplaces,
    normalizeConditionField,
    type AutoRule,
    type PaymentInput,
} from '@/lib/rules';

// Config removed for App Router compatibility

const getMeliRefundAmount = (raw: any): number => {
    const payments = Array.isArray(raw?.payments) ? raw.payments : [];
    const refunded = payments.reduce((sum: number, p: any) => {
        return sum + (Number(p?.transaction_amount_refunded) || 0);
    }, 0);
    return refunded > 0 ? refunded : 0;
};

const getShopeeRefundAmountFromEscrow = (escrowDetail: any, orderStatus?: string): number => {
    if (!escrowDetail || typeof escrowDetail !== 'object') return 0;
    const sellerReturnRefund = Number(escrowDetail.seller_return_refund || 0);
    if (sellerReturnRefund !== 0) return Math.abs(sellerReturnRefund);
    const drcRefund = Number(escrowDetail.drc_adjustable_refund || 0);
    if (drcRefund > 0) return drcRefund;
    const buyerTotal = Number(escrowDetail.buyer_total_amount || 0);
    const orderSelling = Number(escrowDetail.order_selling_price || 0);
    const escrowAmount = Number(escrowDetail.escrow_amount || 0);
    if (buyerTotal > 0 && orderSelling <= 0 && escrowAmount <= 0) return buyerTotal;
    return 0;
};

const FULL_REFUND_EPSILON = 0.01;
const isFullRefund = (refundAmount: number, originalValue: number | null) => {
    if (!(refundAmount > 0 && typeof originalValue === 'number' && originalValue > 0)) return false;
    return refundAmount >= originalValue - FULL_REFUND_EPSILON;
};

const applyFullRefundOverride = (feeCalc: any) => {
    feeCalc.commissionFee = 0;
    feeCalc.campaignFee = 0;
    feeCalc.fixedCost = 0;
    feeCalc.sellerVoucher = undefined;
    feeCalc.amsCommissionFee = undefined;
    feeCalc.totalFees = 0;
    feeCalc.netValue = 0;
    if (feeCalc.breakdown) {
        feeCalc.breakdown.fixedCostPerUnit = 0;
        feeCalc.breakdown.units = 0;
    }
};

export type PreviewPayment = ParsedPayment & {
    tags: string[];
    isAdjustment: boolean;
    isRefund: boolean;
    isFreightAdjustment: boolean; // Freight/weight adjustments - don't show expected/difference
    matchedRuleNames?: string[];   // Rules that were automatically applied
    matchedRuleDetails?: PreviewRuleMatchDetail[];
    autoRuleAppliedNames?: string[];
    autoRuleSnapshot?: {
        tags: string[];
        transactionType?: string;
        transactionDescription?: string;
        expenseCategory?: string | null;
        isExpense?: boolean;
        matchedRuleNames?: string[];
    };
    autoRuleOptOut?: boolean;
    matchStatus: 'linked' | 'unmatched' | 'multiple_entries';
    tinyOrderId?: number;
    tinyOrderInfo?: {
        id: number;
        numero_pedido: string;
        cliente_nome: string;
        valor_total_pedido: number;
        valor_esperado?: number;
        fees_breakdown?: any;
        data_criacao?: string | null;
    };
    relatedPayments?: string[]; // Other marketplace order IDs in same group
    netBalance?: number;
    diferenca?: number; // Difference between netAmount and valorEsperado for sorting
};

type PreviewRuleMatchDetail = {
    ruleId: string;
    ruleName: string;
    matchedConditions: number;
    totalConditions: number;
    conditionResults: Array<{
        conditionId: string;
        field: string;
        operator: string;
        expectedValue: string | number;
        actualValue: string | number;
        matched: boolean;
    }>;
    appliedActions: any[];
    stoppedProcessing: boolean;
    isSystemRule: boolean;
};

const dbRowToRule = (row: any): AutoRule => {
    const normalizedConditions = Array.isArray(row.conditions)
        ? row.conditions.map((condition: any) => ({
            ...condition,
            field: normalizeConditionField(String(condition.field || '')),
        }))
        : [];

    return {
        id: row.id,
        name: row.name,
        description: row.description,
        marketplaces: normalizeMarketplaces(row.marketplaces ?? row.marketplace),
        conditions: normalizedConditions,
        conditionLogic: row.condition_logic || 'AND',
        actions: row.actions || [],
        priority: row.priority,
        enabled: row.enabled,
        stopOnMatch: row.stop_on_match,
        isSystemRule: row.is_system_rule,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
};

const loadUserRules = async (marketplace: string) => {
    const cached = getCachedRules(marketplace);
    if (cached) return cached;

    const { data, error } = await supabaseAdmin
        .from('auto_rules' as any)
        .select('*')
        .eq('enabled', true);

    if (error) {
        console.warn('[Preview] Error loading user rules:', error);
        return [];
    }

    let rules = (data || []).map(dbRowToRule);
    if (marketplace && marketplace !== 'all') {
        rules = rules.filter((rule) => rule.marketplaces.includes(marketplace));
    }
    setCachedRules(marketplace, rules);
    return rules;
};
const RUN_INLINE_ESCROW_SYNC = true; // Enable inline for small batches; large batches fall back to pending list
const INLINE_ESCROW_LIMIT = 100; // Max orders to fetch inline to avoid long blocking

export type PreviewResponse = {
    success: boolean;
    sessionId?: string;
    marketplace: string;
    dateRange: {
        start: string | null;
        end: string | null;
    };
    payments: PreviewPayment[];
    summary: {
        total: number;
        linked: number;
        unmatched: number;
        multiEntry: number;
        matchRate: string;
    };
    rulesAppliedBackend?: boolean;
    pendingEscrowOrders?: string[];
    escrowSyncErrors?: { orderSn: string; reason: string }[];
    errors?: string[];
};

export async function POST(request: NextRequest) {
    try {
        const startTime = Date.now();
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const marketplace = formData.get('marketplace') as 'magalu' | 'mercado_livre' | 'shopee';


        if (!file) {
            return NextResponse.json({ error: 'Arquivo não fornecido' }, { status: 400 });
        }

        if (!marketplace) {
            return NextResponse.json({ error: 'Marketplace não especificado' }, { status: 400 });
        }

        // 1. Parse file
        const parseResult = await parsePaymentFile(file, marketplace);

        // Clear cache to ensure we have the latest config
        const { clearFeeConfigCache } = await import('@/lib/marketplace-fees');
        clearFeeConfigCache(marketplace);

        if (!parseResult.success || parseResult.payments.length === 0) {
            return NextResponse.json({
                success: false,
                marketplace,
                dateRange: { start: null, end: null },
                payments: [],
                summary: { total: 0, linked: 0, unmatched: 0, multiEntry: 0, matchRate: '0%' },
                errors: parseResult.errors,
            }, { status: 400 });
        }

        // 2. Fetch rules from auto_rules table + system rules
        // User rules are applied server-side to keep preview consistent.
        let systemRules: AutoRule[] = [];
        let userRules: AutoRule[] = [];
        let systemEngine: RulesEngine;
        let userEngine: RulesEngine;

        try {
            systemRules = getSystemRules();
            userRules = await loadUserRules(marketplace);
            systemEngine = new RulesEngine(systemRules);
            userEngine = new RulesEngine(userRules);
        } catch (error) {
            console.warn('[Preview] Error loading rules, falling back to system rules only:', error);
            systemRules = getSystemRules();
            userRules = [];
            systemEngine = new RulesEngine(systemRules);
            userEngine = new RulesEngine([]);
        }

        const systemRuleIds = new Set(systemRules.map((rule) => rule.id));

        // ============================================================
        // PERFORMANCE OPTIMIZATION: Batch queries instead of N+1
        // ============================================================

        // 3a. Collect all unique order IDs (both original and base versions)
        const allOrderIds = new Set<string>();
        const baseOrderIdMap = new Map<string, string>(); // marketplaceOrderId -> baseId

        for (const payment of parseResult.payments) {
            const baseId = payment.marketplaceOrderId.replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA|FRETE|COMISSAO)(?:_?\d+)?$|_\d+$/, '');
            allOrderIds.add(payment.marketplaceOrderId);
            allOrderIds.add(baseId);
            baseOrderIdMap.set(payment.marketplaceOrderId, baseId);
        }

        const orderIdsArray = Array.from(allOrderIds);
        const baseOrderIds = [...new Set(Array.from(baseOrderIdMap.values()))];
        const paymentsByBaseId = new Map<string, ParsedPayment[]>();
        const isExpensePayment = (p: ParsedPayment) => p.isExpense === true || Number(p.netAmount || 0) < 0;

        for (const payment of parseResult.payments) {
            const baseId = baseOrderIdMap.get(payment.marketplaceOrderId) || payment.marketplaceOrderId;
            const existing = paymentsByBaseId.get(baseId) || [];
            existing.push(payment);
            paymentsByBaseId.set(baseId, existing);
        }

        if (marketplace === 'shopee' && baseOrderIds.length > 0 && RUN_INLINE_ESCROW_SYNC && baseOrderIds.length <= INLINE_ESCROW_LIMIT) {
            const shopeeOrderIds = baseOrderIds.filter((orderId) => /\b2[0-9A-Z]{10,}\b/.test(orderId));
            if (shopeeOrderIds.length > 0) {
                try {
                    const escrowResult = await syncShopeeEscrowForOrders(shopeeOrderIds, {
                        concurrency: 6,
                        delayMs: 120,
                    });
                    console.log('[PaymentPreview] Shopee escrow sync:', escrowResult);
                } catch (error) {
                    console.error('[PaymentPreview] Shopee escrow sync failed:', error);
                }
            }
        }


        // 3b. BATCH QUERY: Fetch all marketplace_order_links at once
        // Split into batches of 200 to avoid URL size limits
        const batchQueryStart = Date.now();
        const BATCH_SIZE = 200;
        const linksMap = new Map<string, any>();
        let totalLinksFound = 0;

        for (let i = 0; i < orderIdsArray.length; i += BATCH_SIZE) {
            const batch = orderIdsArray.slice(i, i + BATCH_SIZE);
            const { data: batchLinks, error: linksError } = await supabaseAdmin
                .from('marketplace_order_links')
                .select(`
                    marketplace_order_id,
                    tiny_order_id,
                    tiny_orders!inner(
                        id,
                        numero_pedido,
                        cliente_nome,
                        valor_total_pedido,
                        valor_total_produtos,
                        valor,
                        valor_frete,
                        data_criacao
                    )
                `)
                .eq('marketplace', marketplace)
                .in('marketplace_order_id', batch);

            if (linksError) {
                console.error(`[PaymentPreview] Links query error (batch ${i}):`, linksError.message);
            }

            if (batchLinks) {
                for (const link of batchLinks as any[]) {
                    linksMap.set(link.marketplace_order_id, link);
                }
                totalLinksFound += batchLinks.length;
            }
        }

        // Debug logging for link detection
        console.log(`[PaymentPreview] Marketplace: ${marketplace}`);
        console.log(`[PaymentPreview] Order IDs from file (first 5): ${orderIdsArray.slice(0, 5).join(', ')}`);
        console.log(`[PaymentPreview] Total order IDs: ${orderIdsArray.length}, Links found: ${totalLinksFound}`);

        // 3c. BATCH QUERY: Fetch all shopee_order_items at once (for Shopee only)
        type ShopeeOrderItem = {
            order_sn: string;
            quantity: number | null;
            discounted_price: number | null;
            original_price: number | null;
            raw_payload?: any;
            is_wholesale?: boolean | null;
        };
        const itemsByOrderSn = new Map<string, ShopeeOrderItem[]>();

        if (marketplace === 'shopee' && baseOrderIds.length > 0) {
            const itemsQueryStart = Date.now();

            // Batch query shopee_order_items to avoid URL size limits
            const BATCH_SIZE = 200;
            let totalItemsFound = 0;

            for (let i = 0; i < baseOrderIds.length; i += BATCH_SIZE) {
                const batch = baseOrderIds.slice(i, i + BATCH_SIZE);
                const { data: batchItems, error: itemsError } = await supabaseAdmin
                    .from('shopee_order_items')
                    .select('order_sn, quantity, discounted_price, original_price, raw_payload, is_wholesale')
                    .in('order_sn', batch);

                if (itemsError) {
                    console.error(`[PaymentPreview] Shopee items query error (batch ${i}):`, itemsError.message);
                }

                if (batchItems) {
                    for (const item of batchItems) {
                        const existing = itemsByOrderSn.get(item.order_sn) || [];
                        existing.push(item);
                        itemsByOrderSn.set(item.order_sn, existing);
                    }
                    totalItemsFound += batchItems.length;
                }
            }
            console.log(`[PaymentPreview] Shopee items query: found ${totalItemsFound} items across ${baseOrderIds.length} orders`);
        }

        // 3d. BATCH QUERY: Fetch all shopee_orders at once (for Shopee only)
        type ShopeeOrderData = {
            order_sn: string;
            total_amount: number | null;
            voucher_from_seller: number | null;
            voucher_from_shopee: number | null;
            seller_voucher_code: string | null;
            ams_commission_fee: number | null;
            order_selling_price: number | null;
            order_discounted_price: number | null;
            seller_discount: number | null;
            escrow_amount: number | null;
            raw_payload?: any;
        };
        const shopeeOrdersMap = new Map<string, ShopeeOrderData>();
        const shopeeOrdersMissingEscrow: string[] = [];

        const pendingEscrowOrders: string[] = [];
        const escrowSyncErrors: { orderSn: string; reason: string }[] = [];

        if (marketplace === 'shopee' && baseOrderIds.length > 0) {
            const ordersQueryStart = Date.now();

            // Debug: Check if specific order is in baseOrderIds
            const testOrderId = '250324E753MYUP';
            if (baseOrderIds.includes(testOrderId)) {
                console.log('[DEBUG] Order', testOrderId, 'IS in baseOrderIds');
            } else {
                console.log('[DEBUG] Order', testOrderId, 'NOT in baseOrderIds! First 5 baseOrderIds:', baseOrderIds.slice(0, 5));
            }

            // Batch query shopee_orders to avoid URL size limits (same fix as marketplace_order_links)
            const BATCH_SIZE = 200;
            let totalShopeeOrdersFound = 0;

            for (let i = 0; i < baseOrderIds.length; i += BATCH_SIZE) {
                const batch = baseOrderIds.slice(i, i + BATCH_SIZE);
                const { data: batchOrders, error: shopeeError } = await (supabaseAdmin as any)
                    .from('shopee_orders')
                    .select('order_sn, total_amount, voucher_from_seller, voucher_from_shopee, seller_voucher_code, ams_commission_fee, order_selling_price, order_discounted_price, seller_discount, escrow_amount, raw_payload')
                    .in('order_sn', batch);

                if (shopeeError) {
                    console.error(`[PaymentPreview] Shopee orders query error (batch ${i}):`, shopeeError.message);
                }

                if (batchOrders) {
                    for (const order of batchOrders as any[]) {
                        shopeeOrdersMap.set(order.order_sn, order as ShopeeOrderData);
                        const hasEscrow = !!order.raw_payload?.escrow_detail || order.escrow_amount !== null;
                        if (!hasEscrow) {
                            shopeeOrdersMissingEscrow.push(order.order_sn);
                        }
                    }
                    totalShopeeOrdersFound += batchOrders.length;
                }
            }

            console.log(`[PaymentPreview] Shopee orders query: ${baseOrderIds.length} IDs, found ${totalShopeeOrdersFound} orders`);

            // Debug: Check if specific order was found
            const testOrder = shopeeOrdersMap.get(testOrderId);
            if (testOrder) {
                console.log('[DEBUG] Order', testOrderId, 'found in shopee_orders with data:', {
                    order_selling_price: testOrder.order_selling_price,
                    seller_discount: testOrder.seller_discount,
                    escrow_amount: testOrder.escrow_amount
                });
            } else {
                console.log('[DEBUG] Order', testOrderId, 'NOT found in shopee_orders results');
            }

            // Collect pending escrow orders so the client can sync with progress UI
            pendingEscrowOrders.push(...new Set(shopeeOrdersMissingEscrow));

            // Inline escrow sync for small batches (fast refresh) with conservative rate limits
            if (RUN_INLINE_ESCROW_SYNC && pendingEscrowOrders.length > 0 && pendingEscrowOrders.length <= INLINE_ESCROW_LIMIT) {
                try {
                    const inlineIds = [...new Set(pendingEscrowOrders)];
                    const escrowResult = await syncShopeeEscrowForOrders(inlineIds, { concurrency: 6, delayMs: 120 });
                    // Remove successful ones from pending
                    const succeeded = escrowResult.updated > 0 ? new Set(inlineIds.filter(id => !(escrowResult.failedOrders || []).includes(id))) : new Set<string>();
                    const remaining = new Set(inlineIds.filter(id => !succeeded.has(id)));
                    // Reload only the synced orders to update maps
                    if (succeeded.size > 0) {
                        const { data: refreshed, error: refreshErr } = await (supabaseAdmin as any)
                            .from('shopee_orders')
                            .select('order_sn, total_amount, voucher_from_seller, voucher_from_shopee, seller_voucher_code, ams_commission_fee, order_selling_price, order_discounted_price, seller_discount, escrow_amount, raw_payload')
                            .in('order_sn', Array.from(succeeded));
                        if (refreshErr) {
                            console.error('[PaymentPreview] Reload synced shopee_orders error:', refreshErr);
                        } else if (refreshed) {
                            for (const order of refreshed as any[]) {
                                shopeeOrdersMap.set(order.order_sn, order as ShopeeOrderData);
                            }
                        }
                    }
                    pendingEscrowOrders.length = 0;
                    pendingEscrowOrders.push(...Array.from(remaining));
                    if (escrowResult.failedOrders && escrowResult.failedOrders.length > 0) {
                        escrowResult.failedOrders.forEach((orderSn) => {
                            escrowSyncErrors.push({ orderSn, reason: 'update_failed' });
                        });
                    }
                } catch (err) {
                    console.error('[PaymentPreview] Inline Shopee escrow sync failed:', err);
                }
            }
        }

        // 3e. BATCH QUERY: Fetch all Mercado Livre orders at once (for ML only)
        const meliTotalsById = new Map<string, number>();
        const meliRefundsById = new Map<string, number>();
        if (marketplace === 'mercado_livre' && baseOrderIds.length > 0) {
            const numericIds = baseOrderIds
                .map(id => id.trim())
                .filter(id => /^\d+$/.test(id))
                .map(id => Number(id));

            const BATCH_SIZE = 200;
            for (let i = 0; i < numericIds.length; i += BATCH_SIZE) {
                const batch = numericIds.slice(i, i + BATCH_SIZE);
                const { data: meliOrders, error: meliError } = await supabaseAdmin
                    .from('meli_orders')
                    .select('meli_order_id, total_amount, total_amount_with_shipping, raw_payload')
                    .in('meli_order_id', batch);

                if (meliError) {
                    console.error(`[PaymentPreview] Meli orders query error (batch ${i}):`, meliError.message);
                }

                if (meliOrders) {
                    for (const order of meliOrders as any[]) {
                        const totalWithShipping = Number(order.total_amount_with_shipping || 0);
                        const totalAmount = Number(order.total_amount || 0);
                        const resolved = totalWithShipping > 0 ? totalWithShipping : totalAmount;
                        if (resolved > 0) {
                            meliTotalsById.set(String(order.meli_order_id), resolved);
                        }
                        if (order.raw_payload) {
                            const refund = getMeliRefundAmount(order.raw_payload);
                            if (refund > 0) {
                                meliRefundsById.set(String(order.meli_order_id), refund);
                            }
                        }
                    }
                }
            }
        }


        // 4. Process payments using cached data (no more individual queries!)
        const previewPayments: PreviewPayment[] = [];
        const processStart = Date.now();


        for (const payment of parseResult.payments) {
            // Create PaymentInput for the engine
            const paymentInput: PaymentInput = {
                marketplaceOrderId: payment.marketplaceOrderId,
                transactionDescription: payment.transactionDescription || '',
                transactionType: payment.transactionType || '',
                amount: payment.netAmount,
                paymentDate: payment.paymentDate || new Date().toISOString(),
            };

            const systemResult = systemEngine.process(paymentInput, marketplace);
            const userResult = userEngine.process(paymentInput, marketplace);
            const matchedSystemRules = systemResult.matchedRules.filter((rule) => rule.matched);
            const matchedUserRules = userResult.matchedRules.filter((rule) => rule.matched);
            const matchedRuleNames = [...matchedSystemRules, ...matchedUserRules].map((rule) => rule.ruleName);
            const matchedUserRuleNames = matchedUserRules.map((rule) => rule.ruleName);

            const baseTransactionType = systemResult.transactionType || payment.transactionType;
            const baseTransactionDescription = systemResult.transactionDescription || payment.transactionDescription;
            const baseCategory = systemResult.category;
            let baseIsExpense = payment.isExpense || systemResult.isExpense;
            if (systemResult.isIncome) baseIsExpense = false;

            const baseTags = Array.from(new Set([...(payment.tags || []), ...systemResult.tags]));
            const tagSet = new Set(baseTags);
            userResult.tags.forEach((tag) => tagSet.add(tag));

            const hasRefundTag = Array.from(tagSet).some((tag) =>
                ['reembolso', 'devolucao', 'estorno', 'chargeback'].includes(tag)
            );

            // Check for freight-related adjustments (specific patterns)
            const freightFeePatterns = [
                /frete\s+de\s+devolu/i,
                /devolucao.*frete/i,
                /cobran[çc]a.*frete/i,
                /peso\s+diferente/i,
                /ajuste.*peso/i,
            ];
            const fullText = `${payment.transactionDescription || ''} ${payment.transactionType || ''}`;
            const isFreightAdjustment = tagSet.has('ajuste') &&
                freightFeePatterns.some(p => p.test(fullText));


            // Look up order link from pre-fetched map (O(1) instead of DB query)
            const baseMarketplaceOrderId = baseOrderIdMap.get(payment.marketplaceOrderId) || payment.marketplaceOrderId;
            const linkData = linksMap.get(payment.marketplaceOrderId) || linksMap.get(baseMarketplaceOrderId);
            const orderPayments = paymentsByBaseId.get(baseMarketplaceOrderId) || [];
            const hasIncomePayment = orderPayments.some((p) => !isExpensePayment(p) && Number(p.netAmount || 0) > 0);
            const hasExpensePayment = orderPayments.some((p) => isExpensePayment(p) && Math.abs(Number(p.netAmount || 0)) > 0);
            const hasOnlyExpensePayments = !hasIncomePayment && hasExpensePayment;
            const tinyTotalFromLink = linkData?.tiny_orders
                ? (() => {
                    const tiny = (linkData as any).tiny_orders;
                    const totalPedido = Number(tiny.valor_total_pedido || 0);
                    const totalValor = Number(tiny.valor || 0);
                    const totalProdutos = Number(tiny.valor_total_produtos || 0);
                    const totalFrete = Number(tiny.valor_frete || 0);
                    if (totalPedido > 0) return totalPedido;
                    if (totalValor > 0) return totalValor;
                    if (totalProdutos > 0 && totalFrete > 0) return totalProdutos + totalFrete;
                    if (totalProdutos > 0) return totalProdutos;
                    return 0;
                })()
                : 0;

            // Get Shopee-specific data from pre-fetched maps
            let productCount = 1;
            let originalProductCount = 1;
            let shopeeOrderValue: number | null = null;
            let originalOrderValue: number | null = null;
            let refundAmount = 0;
            let voucherFromSeller = 0;
            let voucherFromShopee = 0;
            let amsCommissionFee = 0;
            let orderSellingPrice = 0;
            let orderDiscountedPrice = 0;
            let sellerDiscount = 0;
            let hasShopeeItems = false;
            let hasBundleDeal = false;
            let hasExplicitDiscountedPrice = false;
            let hasOrderLevelDiscount = false;
            let effectiveBundleDiscount = 0;
            let escrowAmount = 0;
            let freightDiscount = 0;
            let meliRefundAmount = 0;
            let meliOriginalOrderValue = 0;

            if (marketplace === 'shopee' && payment.marketplaceOrderId) {
                // Get items from pre-fetched map (O(1) instead of DB query)
                const itemsData = itemsByOrderSn.get(baseMarketplaceOrderId);

                if (itemsData && itemsData.length > 0) {
                    hasShopeeItems = true;
                    productCount = itemsData.reduce((sum, item) => sum + (item.quantity || 1), 0);
                    shopeeOrderValue = itemsData.reduce((sum, item) => {
                        const price = item.discounted_price || item.original_price || 0;
                        const qty = item.quantity || 1;
                        return sum + (price * qty);
                    }, 0);
                    hasBundleDeal = itemsData.some(item =>
                        item.raw_payload?.promotion_type === 'bundle_deal' || item.is_wholesale === true
                    );
                }

                // Get shopee order data from pre-fetched map (O(1) instead of DB query)
                const escrowData = shopeeOrdersMap.get(baseMarketplaceOrderId);

                const escrowDetail = escrowData?.raw_payload?.escrow_detail;
                const hasEscrowDetail = !!escrowDetail && typeof escrowDetail === 'object';
                if (escrowData?.voucher_from_seller) {
                    voucherFromSeller = Number(escrowData.voucher_from_seller) || 0;
                }
                if (escrowData?.ams_commission_fee) {
                    amsCommissionFee = Number(escrowData.ams_commission_fee) || 0;
                }
                if (escrowData?.order_selling_price != null) {
                    orderSellingPrice = Number(escrowData.order_selling_price) || 0;
                }
                const escrowSelling = Number(escrowDetail?.order_selling_price || 0);
                if (orderSellingPrice <= 0 && escrowSelling > 0) {
                    orderSellingPrice = escrowSelling;
                }
                if (escrowData?.order_discounted_price != null) {
                    orderDiscountedPrice = Number(escrowData.order_discounted_price) || 0;
                    if (orderDiscountedPrice > 0) {
                        hasExplicitDiscountedPrice = true;
                    }
                }
                if (escrowData?.seller_discount) {
                    sellerDiscount = Number(escrowData.seller_discount) || 0;
                }
                const escrowDiscounted = Number(escrowDetail?.order_discounted_price || 0);
                if (!hasExplicitDiscountedPrice && escrowDiscounted > 0) {
                    orderDiscountedPrice = escrowDiscounted;
                    hasExplicitDiscountedPrice = true;
                }
                if (orderSellingPrice <= 0 && orderDiscountedPrice > 0) {
                    orderSellingPrice = orderDiscountedPrice;
                }
                if (hasExplicitDiscountedPrice && orderSellingPrice > 0 && orderDiscountedPrice < orderSellingPrice - 0.01) {
                    hasOrderLevelDiscount = true;
                }
                if (sellerDiscount > 0 && hasBundleDeal && itemsData && itemsData.length > 0) {
                    const nonBundleDiscounts = itemsData.reduce((acc, item) => {
                        const promoType = item.raw_payload?.promotion_type;
                        if (promoType && promoType !== 'bundle_deal' && item.is_wholesale !== true) {
                            const orig = Number(item.original_price) || 0;
                            const disc = Number(item.discounted_price) || 0;
                            const qty = Number(item.quantity) || 1;
                            if (orig > 0 && disc > 0 && orig > disc) {
                                return acc + ((orig - disc) * qty);
                            }
                        }
                        return acc;
                    }, 0);
                    effectiveBundleDiscount = Math.max(0, sellerDiscount - nonBundleDiscounts);
                }
                if (escrowData?.escrow_amount) {
                    escrowAmount = Number(escrowData.escrow_amount) || 0;
                }
                if (escrowData?.voucher_from_shopee) {
                    voucherFromShopee = Number(escrowData.voucher_from_shopee) || 0;
                }
                const escrowBuyerTotal = Number(escrowDetail?.buyer_total_amount || 0);
                const escrowRefund = getShopeeRefundAmountFromEscrow(escrowDetail, (escrowData as any)?.order_status);

                if (escrowBuyerTotal > 0) {
                    if (!shopeeOrderValue || shopeeOrderValue <= 0) {
                        shopeeOrderValue = escrowBuyerTotal;
                    }
                    originalOrderValue = escrowBuyerTotal;
                }

                if (escrowRefund > 0 && shopeeOrderValue && shopeeOrderValue > 0) {
                    originalProductCount = productCount;
                    originalOrderValue = shopeeOrderValue;
                    refundAmount = escrowRefund;

                    const actualOrderValue = Math.max(0, shopeeOrderValue - escrowRefund);
                    const refundRatio = actualOrderValue / shopeeOrderValue;
                    const adjustedCount = Math.round(productCount * refundRatio);
                    productCount = Math.max(1, adjustedCount);
                    shopeeOrderValue = actualOrderValue;
                } else if (
                    escrowData &&
                    shopeeOrderValue &&
                    shopeeOrderValue > 0 &&
                    !hasBundleDeal &&
                    !hasOrderLevelDiscount &&
                    !hasEscrowDetail
                ) {
                    const totalAmount = Number(escrowData.total_amount) || 0;
                    const sellingPrice = Number(escrowData.order_selling_price) || 0;
                    let actualOrderValue = 0;
                    if (totalAmount > 0 && sellingPrice > 0) {
                        actualOrderValue = Math.min(totalAmount, sellingPrice);
                    } else if (totalAmount > 0) {
                        actualOrderValue = totalAmount;
                    } else {
                        actualOrderValue = sellingPrice;
                    }

                    const discountAllowance = Math.max(0, sellerDiscount)
                        + Math.max(0, voucherFromSeller)
                        + Math.max(0, voucherFromShopee);
                    const refundGap = shopeeOrderValue - actualOrderValue;
                    const isImplicitRefundGap = refundGap > Math.max(0.1, discountAllowance + 0.05);

                    if (actualOrderValue > 0 && actualOrderValue < shopeeOrderValue && isImplicitRefundGap) {
                        originalProductCount = productCount;
                        originalOrderValue = shopeeOrderValue;
                        refundAmount = shopeeOrderValue - actualOrderValue;

                        const refundRatio = actualOrderValue / shopeeOrderValue;
                        const adjustedCount = Math.round(productCount * refundRatio);
                        productCount = Math.max(1, adjustedCount);
                        shopeeOrderValue = actualOrderValue;
                    } else {
                        const hasNegativeEscrowRefund = escrowAmount < 0 && totalAmount <= 0 && sellingPrice <= 0;
                        if (hasNegativeEscrowRefund && refundAmount <= 0) {
                            originalProductCount = productCount;
                            originalOrderValue = shopeeOrderValue;
                            refundAmount = shopeeOrderValue;
                        }
                    }
                }

                const fallbackOrderValue = (originalOrderValue && originalOrderValue > 0)
                    ? originalOrderValue
                    : (shopeeOrderValue && shopeeOrderValue > 0 ? shopeeOrderValue : null);

                if (refundAmount <= 0 && hasOnlyExpensePayments && fallbackOrderValue && fallbackOrderValue > 0 && hasRefundTag) {
                    originalProductCount = productCount;
                    originalOrderValue = fallbackOrderValue;
                    refundAmount = fallbackOrderValue;
                    const actualOrderValue = Math.max(0, fallbackOrderValue - refundAmount);
                    shopeeOrderValue = actualOrderValue;
                    orderSellingPrice = actualOrderValue;
                }

                // Fallback 2: use sum of expense payments when tagged as refund and we still lack escrow detail
                if (refundAmount <= 0 && hasRefundTag) {
                    const totalExpensePayments = orderPayments
                        .filter((p) => isExpensePayment(p))
                        .reduce((sum, p) => sum + Math.abs(Number(p.netAmount || 0)), 0);
                    if (totalExpensePayments > 0) {
                        const fallbackOrderValue2 = fallbackOrderValue
                            || (tinyTotalFromLink > 0 ? tinyTotalFromLink : null)
                            || (orderSellingPrice > 0 ? orderSellingPrice : null)
                            || (shopeeOrderValue && shopeeOrderValue > 0 ? shopeeOrderValue : null)
                            || totalExpensePayments;
                        originalProductCount = productCount;
                        originalOrderValue = fallbackOrderValue2;
                        refundAmount = totalExpensePayments;
                        const actualOrderValue = Math.max(0, (fallbackOrderValue2 || 0) - refundAmount);
                        shopeeOrderValue = actualOrderValue;
                        orderSellingPrice = actualOrderValue;
                    }
                }

                if (refundAmount > 0 && freightDiscount <= 0) {
                    const actualShippingFee = Number(escrowDetail?.actual_shipping_fee || 0);
                    if (actualShippingFee > 0) {
                        freightDiscount = actualShippingFee;
                    } else if (escrowAmount < 0) {
                        freightDiscount = Math.abs(escrowAmount);
                    }
                }

                // Determine if order has seller discount (e.g., leve mais pague menos, promoção loja)
                // Use the difference between selling and discounted price to find REAL discounts
                // This avoids flagging strike-through prices (fake original prices) as discounts
                // Also account for seller voucher to avoid double tagging (Cupom Loja already covers that)
                let hasSellerDiscountTag = false;

                if (orderSellingPrice > 0 && orderDiscountedPrice > 0) {
                    const discountDelta = orderSellingPrice - orderDiscountedPrice;
                    // Check if there is a discount BEYOND the seller voucher (with small tolerance)
                    if (discountDelta > (voucherFromSeller + 0.05)) {
                        hasSellerDiscountTag = true;
                    }
                } else if (sellerDiscount > 0 && orderDiscountedPrice === 0) {
                    // Fallback if orderDiscountedPrice is missing but sellerDiscount is large?
                    // Probably better to be conservative and NOT tag if we are unsure, to avoid false positives.
                    // The user complaint is about false positives.
                    hasSellerDiscountTag = false;
                }

                // Add automatic tags based on escrow data
                if (voucherFromSeller > 0) {
                    tagSet.add('cupom loja');
                }
                if (amsCommissionFee > 0) {
                    tagSet.add('comissão afiliado');
                }
                if (hasSellerDiscountTag) {
                    tagSet.add('desconto loja');
                }
            }

            if (marketplace === 'mercado_livre') {
                meliRefundAmount = meliRefundsById.get(baseMarketplaceOrderId) || 0;
            }

            // Calculate expected fees if order is linked
            let valorEsperado: number | undefined;
            let feesBreakdown: any;

            if (linkData && linkData.tiny_orders) {
                try {
                    const orderDateStr = (linkData as any).tiny_orders.data_criacao || payment.paymentDate;
                    const normalizedDateStr = orderDateStr && !orderDateStr.includes('T')
                        ? `${orderDateStr.split(' ')[0]}T12:00:00`
                        : orderDateStr;
                    const orderDate = normalizedDateStr ? new Date(normalizedDateStr) : new Date();

                    let orderValue: number;
                    const tinyOrder = (linkData as any).tiny_orders;
                    const tinyFrete = Number(tinyOrder.valor_frete || 0);
                    const tinyProdutos = Number(tinyOrder.valor_total_produtos || 0);
                    let tinyTotal = Number(tinyOrder.valor_total_pedido || tinyOrder.valor || 0);
                    if (tinyTotal <= 0) {
                        if (tinyProdutos > 0 && tinyFrete > 0) {
                            tinyTotal = tinyProdutos + tinyFrete;
                        } else if (tinyProdutos > 0) {
                            tinyTotal = tinyProdutos;
                        }
                    }

                    if (marketplace === 'shopee') {
                        const discountedBase = hasOrderLevelDiscount ? orderDiscountedPrice : 0;
                        const bundleAdjustedBase = orderSellingPrice > 0 && effectiveBundleDiscount > 0
                            ? Math.max(0, orderSellingPrice - effectiveBundleDiscount)
                            : 0;
                        const resolvedBase = discountedBase > 0
                            ? discountedBase
                            : bundleAdjustedBase > 0
                                ? bundleAdjustedBase
                                : orderSellingPrice > 0
                                    ? orderSellingPrice
                                    : (shopeeOrderValue !== null && shopeeOrderValue > 0)
                                        ? shopeeOrderValue
                                        : Math.max(0, tinyTotal - tinyFrete);
                        if (refundAmount > 0 && shopeeOrderValue !== null && shopeeOrderValue > 0) {
                            orderValue = shopeeOrderValue;
                        } else {
                            orderValue = resolvedBase;
                        }
                    } else if (marketplace === 'mercado_livre') {
                        if (tinyTotal > 0) {
                            meliOriginalOrderValue = tinyTotal;
                        } else {
                            const meliTotal = meliTotalsById.get(baseMarketplaceOrderId);
                            meliOriginalOrderValue = meliTotal ?? 0;
                        }
                        orderValue = meliRefundAmount > 0
                            ? Math.max(0, meliOriginalOrderValue - meliRefundAmount)
                            : meliOriginalOrderValue;
                    } else {
                        orderValue = Math.max(0, tinyTotal);
                    }

                    // Use AMS fee from payment parsing (realized) if available, otherwise DB (expected)
                    const realizedAmsFee = payment.fee_overrides?.amsCommissionFee;
                    const finalAmsFee = realizedAmsFee !== undefined ? realizedAmsFee : amsCommissionFee;

                    // Debug logging for specific order
                    const hasSellerDiscount = (sellerDiscount || 0) > 0;
                    if (baseMarketplaceOrderId === '250324E753MYUP') {
                        console.log('[DEBUG 250324E753MYUP] Fee Calc Input:', {
                            orderValue,
                            orderSellingPrice,
                            orderDiscountedPrice,
                            sellerDiscount,
                            hasSellerDiscount,
                            productCount,
                            voucherFromSeller,
                            finalAmsFee
                        });
                    }

                    const fullRefund = marketplace === 'shopee'
                        ? isFullRefund(refundAmount, originalOrderValue)
                        : marketplace === 'mercado_livre'
                            ? isFullRefund(meliRefundAmount, meliOriginalOrderValue)
                            : false;

                    const feeCalc = await calculateMarketplaceFees({
                        marketplace: marketplace as 'shopee' | 'mercado_livre' | 'magalu',
                        orderDate: orderDate,
                        orderValue: orderValue,
                        productCount: productCount,
                        isKit: false,
                        usesFreeShipping: undefined,
                        isCampaignOrder: false,
                        sellerVoucher: marketplace === 'shopee' ? voucherFromSeller : undefined,
                        amsCommissionFee: marketplace === 'shopee' ? finalAmsFee : undefined,
                    });

                    if (fullRefund) {
                        applyFullRefundOverride(feeCalc);
                        productCount = 0;
                    }

                    // Debug logging for specific order
                    if (baseMarketplaceOrderId === '250324E753MYUP') {
                        console.log('[DEBUG 250324E753MYUP] Fee Calc Result:', {
                            grossValue: feeCalc.grossValue,
                            totalFees: feeCalc.totalFees,
                            netValue: feeCalc.netValue,
                            breakdown: feeCalc.breakdown
                        });
                    }

                    valorEsperado = feeCalc.netValue;

                    feesBreakdown = {
                        ...feeCalc,
                        productCount,
                        shopeeData: marketplace === 'shopee' ? {
                            orderSellingPrice,
                            orderDiscountedPrice,
                            sellerDiscount,
                            escrowAmount,
                            voucherFromSeller,
                            voucherFromShopee,
                            amsCommissionFee,
                            refundAmount,
                            freightDiscount,
                            originalProductCount,
                            originalOrderValue,
                            isLeveMaisPagueMenos: sellerDiscount > 0 && orderSellingPrice > 0 && (sellerDiscount / orderSellingPrice) <= 0.05,
                            hasSellerDiscount: sellerDiscount > 0,
                            escrowDifference: escrowAmount > 0 ? feeCalc.netValue - escrowAmount : 0,
                        } : undefined,
                    };
                    if (marketplace === 'mercado_livre' && meliRefundAmount > 0) {
                        feesBreakdown.refundAmount = meliRefundAmount;
                        feesBreakdown.refundOriginalValue = meliOriginalOrderValue;
                    }
                } catch (error) {
                    console.error('[Preview API] Fee calculation error:', error);
                }
            }

            let resolvedTinyTotal: number | undefined;
            if (linkData && linkData.tiny_orders) {
                const tinyOrder = (linkData as any).tiny_orders;
                const tinyFrete = Number(tinyOrder.valor_frete || 0);
                const tinyProdutos = Number(tinyOrder.valor_total_produtos || 0);
                let baseTotal = Number(tinyOrder.valor_total_pedido || tinyOrder.valor || 0);
                if (baseTotal <= 0) {
                    if (tinyProdutos > 0 && tinyFrete > 0) {
                        baseTotal = tinyProdutos + tinyFrete;
                    } else if (tinyProdutos > 0) {
                        baseTotal = tinyProdutos;
                    }
                }
                resolvedTinyTotal = baseTotal;
                if (marketplace === 'mercado_livre' && resolvedTinyTotal <= 0) {
                    const meliTotal = meliTotalsById.get(baseMarketplaceOrderId);
                    if (meliTotal && meliTotal > 0) {
                        resolvedTinyTotal = meliTotal;
                    }
                }
            }

            const matchedSystemRuleNames = matchedSystemRules.map((rule) => rule.ruleName);
            const finalTransactionType = userResult.transactionType || baseTransactionType;
            const finalTransactionDescription = userResult.transactionDescription || baseTransactionDescription;
            const finalCategory = userResult.category || baseCategory;
            let finalIsExpense = baseIsExpense;
            if (baseCategory) finalIsExpense = true;
            if (userResult.category) finalIsExpense = true;
            if (userResult.isExpense) finalIsExpense = true;
            if (userResult.isIncome) finalIsExpense = false;

            if (refundAmount > 0) {
                tagSet.add('devolucao');
            }
            if (freightDiscount > 0) {
                tagSet.add('frete descontado');
            }

            const finalTags = Array.from(tagSet);
            const matchedRuleDetails = [...matchedSystemRules, ...matchedUserRules].map((rule) => ({
                ruleId: rule.ruleId,
                ruleName: rule.ruleName,
                matchedConditions: rule.matchedConditions,
                totalConditions: rule.totalConditions,
                conditionResults: rule.conditionResults,
                appliedActions: rule.appliedActions,
                stoppedProcessing: rule.stoppedProcessing,
                isSystemRule: systemRuleIds.has(rule.ruleId),
            }));

            const autoRuleSnapshot = matchedUserRuleNames.length > 0
                ? {
                    tags: baseTags,
                    transactionType: baseTransactionType,
                    transactionDescription: baseTransactionDescription,
                    expenseCategory: baseCategory ?? null,
                    isExpense: baseIsExpense,
                    matchedRuleNames: matchedSystemRuleNames,
                }
                : undefined;

            previewPayments.push({
                ...payment,
                // Apply engine result modifications
                transactionType: finalTransactionType || payment.transactionType,
                transactionDescription: finalTransactionDescription || payment.transactionDescription,
                expenseCategory: finalCategory,
                isExpense: finalIsExpense,
                tags: finalTags,
                isAdjustment: finalTags.some(t => ['ajuste', 'compensacao', 'correcao'].includes(t)),
                isRefund: refundAmount > 0 || finalTags.some(t => ['reembolso', 'devolucao', 'estorno', 'chargeback'].includes(t)),
                isFreightAdjustment: isFreightAdjustment,
                autoRuleAppliedNames: matchedUserRuleNames,
                autoRuleSnapshot,
                autoRuleOptOut: false,
                // Include matched rule names for visual indicator
                matchedRuleNames,
                matchedRuleDetails,
                matchStatus: linkData ? 'linked' : 'unmatched',
                tinyOrderId: linkData?.tiny_order_id,
                tinyOrderInfo: linkData && linkData.tiny_orders ? {
                    id: (linkData as any).tiny_orders.id || linkData.tiny_order_id,
                    numero_pedido: (linkData as any).tiny_orders.numero_pedido || '',
                    cliente_nome: (linkData as any).tiny_orders.cliente_nome || '',
                    valor_total_pedido: resolvedTinyTotal || 0,
                    valor_esperado: valorEsperado,
                    fees_breakdown: feesBreakdown,
                    data_criacao: (linkData as any).tiny_orders.data_criacao || null,
                } : undefined,
                // Add diferenca for sorting (netAmount - valorEsperado)
                diferenca: valorEsperado !== undefined ? payment.netAmount - valorEsperado : undefined,
            });
        }

        console.log(`[PaymentPreview] Processed ${previewPayments.length} payments in ${Date.now() - processStart}ms`);

        // 4. Detect multi-entry scenarios
        const multiEntryGroups = detectMultiEntry(
            parseResult.payments.map((p, i) => ({
                marketplaceOrderId: p.marketplaceOrderId,
                amount: p.netAmount,
                transactionDescription: p.rawData?.toString() || '',
                balanceAfter: previewPayments[i]?.netBalance,
            }))
        );

        // Update payments with multi-entry info
        for (const [orderId, groupInfo] of multiEntryGroups.entries()) {
            const paymentsInGroup = previewPayments.filter(p => p.marketplaceOrderId === orderId);
            paymentsInGroup.forEach(p => {
                p.matchStatus = 'multiple_entries';
                p.relatedPayments = groupInfo.orderIds.filter(id => id !== p.marketplaceOrderId);
                p.netBalance = groupInfo.netBalance;
                p.tags = [...new Set([...p.tags, ...groupInfo.suggestedTags])];
            });
        }

        // 5. Calculate date range
        const dates = parseResult.payments
            .map(p => p.paymentDate || p.settlementDate)
            .filter(d => d !== null) as string[];

        const dateRange = {
            start: dates.length > 0 ? dates.sort()[0] : null,
            end: dates.length > 0 ? dates.sort()[dates.length - 1] : null,
        };

        // 6. Create preview session
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('payment_import_sessions')
            .insert({
                marketplace,
                status: 'preview',
                parsed_data: previewPayments,
                date_range_start: dateRange.start,
                date_range_end: dateRange.end,
            })
            .select()
            .single();

        if (sessionError) {
            console.error('[PaymentPreview] Error creating session:', sessionError);
        }

        // 7. Calculate summary
        const linked = previewPayments.filter(p => p.matchStatus === 'linked').length;
        const unmatched = previewPayments.filter(p => p.matchStatus === 'unmatched').length;
        const multiEntry = previewPayments.filter(p => p.matchStatus === 'multiple_entries').length;

        const response: PreviewResponse = {
            success: true,
            sessionId: session?.id,
            marketplace,
            dateRange,
            payments: previewPayments,
            rulesAppliedBackend: true,
            summary: {
                total: previewPayments.length,
                linked,
                unmatched,
                multiEntry,
                matchRate: previewPayments.length > 0
                    ? ((linked / previewPayments.length) * 100).toFixed(1) + '%'
                    : '0%',
            },
            pendingEscrowOrders,
            escrowSyncErrors,
        };

        console.log(`[PaymentPreview] Total request time: ${Date.now() - startTime}ms for ${previewPayments.length} payments`);
        return NextResponse.json(response);

    } catch (error) {
        console.error('[PaymentPreview] Unexpected error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        return NextResponse.json({
            success: false,
            marketplace: 'unknown',
            dateRange: { start: null, end: null },
            payments: [],
            summary: { total: 0, linked: 0, unmatched: 0, multiEntry: 0, matchRate: '0%' },
            errors: ['Erro interno do servidor: ' + errorMessage],
        }, { status: 500 });
    }
}

// GET endpoint to fetch import history
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const marketplace = searchParams.get('marketplace');

        let query = supabaseAdmin
            .from('payment_upload_batches')
            .select('marketplace, date_range_start, date_range_end, uploaded_at, payments_count, status')
            .eq('status', 'completed')
            .order('date_range_start', { ascending: false })
            .limit(50);

        if (marketplace) {
            query = query.eq('marketplace', marketplace);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[PaymentPreview] Error fetching history:', error);
            return NextResponse.json({ error: 'Erro ao buscar histórico' }, { status: 500 });
        }

        // Group by date ranges for easier visualization
        const history = data || [];

        return NextResponse.json({
            success: true,
            history: history.map(h => ({
                marketplace: h.marketplace,
                dateRange: {
                    start: h.date_range_start,
                    end: h.date_range_end,
                },
                uploadedAt: h.uploaded_at,
                paymentsCount: h.payments_count || 0,
            }))
        });
    } catch (error) {
        console.error('[PaymentPreview] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
