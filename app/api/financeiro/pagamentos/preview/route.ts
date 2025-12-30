import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parsePaymentFile, type ParsedPayment } from '@/lib/paymentParsers';
import { applySmartTags, detectMultiEntry, convertDbRulesToTagRules } from '@/lib/smartTagger';
import { calculateMarketplaceFees } from '@/lib/marketplace-fees';
import { RulesEngine, getSystemRules, type AutoRule, type PaymentInput } from '@/lib/rules';

export const config = {
    api: {
        bodyParser: false,
    },
};

const getMeliRefundAmount = (raw: any): number => {
    const payments = Array.isArray(raw?.payments) ? raw.payments : [];
    const refunded = payments.reduce((sum: number, p: any) => {
        return sum + (Number(p?.transaction_amount_refunded) || 0);
    }, 0);
    return refunded > 0 ? refunded : 0;
};

const getShopeeRefundAmountFromEscrow = (escrowDetail: any): number => {
    if (!escrowDetail || typeof escrowDetail !== 'object') return 0;
    const drcRefund = Number(escrowDetail.drc_adjustable_refund || 0);
    if (drcRefund > 0) return drcRefund;
    const sellerReturnRefund = Math.abs(Number(escrowDetail.seller_return_refund || 0));
    if (sellerReturnRefund > 0) return sellerReturnRefund;
    const buyerTotal = Number(escrowDetail.buyer_total_amount || 0);
    const selling = Number(escrowDetail.order_selling_price || 0);
    const delta = buyerTotal - selling;
    if (buyerTotal > 0 && delta > 0) return delta;
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

        // 2. Fetch rules from new auto_rules table + system rules
        // NOTE: User rules are NOT applied automatically during preview.
        // They are fetched by the frontend and shown as "suggestions" for manual approval.
        // Only system rules are applied automatically for basic tagging.
        let rulesEngine: RulesEngine;
        try {
            // Initialize RulesEngine with ONLY system rules
            // User rules will be suggested on the frontend
            const systemRules = getSystemRules();
            rulesEngine = new RulesEngine(systemRules);

        } catch (error) {
            console.warn('[Preview] Error loading rules, falling back to empty:', error);
            rulesEngine = new RulesEngine(getSystemRules());
        }

        // ============================================================
        // PERFORMANCE OPTIMIZATION: Batch queries instead of N+1
        // ============================================================

        // 3a. Collect all unique order IDs (both original and base versions)
        const allOrderIds = new Set<string>();
        const baseOrderIdMap = new Map<string, string>(); // marketplaceOrderId -> baseId

        for (const payment of parseResult.payments) {
            const baseId = payment.marketplaceOrderId.replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA)(?:_\d+)?$|_\d+$/, '');
            allOrderIds.add(payment.marketplaceOrderId);
            allOrderIds.add(baseId);
            baseOrderIdMap.set(payment.marketplaceOrderId, baseId);
        }

        const orderIdsArray = Array.from(allOrderIds);
        const baseOrderIds = [...new Set(Array.from(baseOrderIdMap.values()))];


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
        type ShopeeOrderItem = { order_sn: string; quantity: number | null; discounted_price: number | null; original_price: number | null };
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
                    .select('order_sn, quantity, discounted_price, original_price')
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

            // Process through the new rules engine
            const engineResult = rulesEngine.process(paymentInput, marketplace);

            // Check for freight-related adjustments (specific patterns)
            const freightFeePatterns = [
                /frete\s+de\s+devolu/i,
                /devolucao.*frete/i,
                /cobran[çc]a.*frete/i,
                /peso\s+diferente/i,
                /ajuste.*peso/i,
            ];
            const fullText = `${payment.transactionDescription || ''} ${payment.transactionType || ''}`;
            const isFreightAdjustment = engineResult.tags.includes('ajuste') &&
                freightFeePatterns.some(p => p.test(fullText));


            // Look up order link from pre-fetched map (O(1) instead of DB query)
            const baseMarketplaceOrderId = baseOrderIdMap.get(payment.marketplaceOrderId) || payment.marketplaceOrderId;
            const linkData = linksMap.get(payment.marketplaceOrderId) || linksMap.get(baseMarketplaceOrderId);

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
            let escrowAmount = 0;
            let meliRefundAmount = 0;
            let meliOriginalOrderValue = 0;

            if (marketplace === 'shopee' && payment.marketplaceOrderId) {
                // Get items from pre-fetched map (O(1) instead of DB query)
                const itemsData = itemsByOrderSn.get(baseMarketplaceOrderId);

                if (itemsData && itemsData.length > 0) {
                    productCount = itemsData.reduce((sum, item) => sum + (item.quantity || 1), 0);
                    shopeeOrderValue = itemsData.reduce((sum, item) => {
                        const price = item.discounted_price || item.original_price || 0;
                        const qty = item.quantity || 1;
                        return sum + (price * qty);
                    }, 0);
                }

                // Get shopee order data from pre-fetched map (O(1) instead of DB query)
                const escrowData = shopeeOrdersMap.get(baseMarketplaceOrderId);

                const escrowDetail = escrowData?.raw_payload?.escrow_detail;
                const escrowBuyerTotal = Number(escrowDetail?.buyer_total_amount || 0);
                const escrowRefund = getShopeeRefundAmountFromEscrow(escrowDetail);

                if (escrowBuyerTotal > 0) {
                    shopeeOrderValue = escrowBuyerTotal;
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
                } else if (escrowData && shopeeOrderValue && shopeeOrderValue > 0) {
                    const totalAmount = Number(escrowData.total_amount) || 0;
                    const sellingPrice = Number(escrowData.order_selling_price) || 0;
                    const actualOrderValue = totalAmount > 0 ? totalAmount : sellingPrice;

                    if (actualOrderValue > 0 && actualOrderValue < shopeeOrderValue) {
                        originalProductCount = productCount;
                        originalOrderValue = shopeeOrderValue;
                        refundAmount = shopeeOrderValue - actualOrderValue;

                        const refundRatio = actualOrderValue / shopeeOrderValue;
                        const adjustedCount = Math.round(productCount * refundRatio);
                        productCount = Math.max(1, adjustedCount);
                        shopeeOrderValue = actualOrderValue;
                    }
                }

                if (escrowData?.voucher_from_seller) {
                    voucherFromSeller = Number(escrowData.voucher_from_seller) || 0;
                }
                if (escrowData?.ams_commission_fee) {
                    amsCommissionFee = Number(escrowData.ams_commission_fee) || 0;
                }
                if (escrowData?.order_selling_price != null) {
                    orderSellingPrice = Number(escrowData.order_selling_price) || 0;
                }
                if (escrowData?.order_discounted_price) {
                    orderDiscountedPrice = Number(escrowData.order_discounted_price) || 0;
                }
                if (escrowData?.seller_discount) {
                    sellerDiscount = Number(escrowData.seller_discount) || 0;
                }
                if (escrowData?.escrow_amount) {
                    escrowAmount = Number(escrowData.escrow_amount) || 0;
                }
                if (escrowData?.voucher_from_shopee) {
                    voucherFromShopee = Number(escrowData.voucher_from_shopee) || 0;
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
                    engineResult.tags.push('cupom loja');
                }
                if (amsCommissionFee > 0) {
                    engineResult.tags.push('comissão afiliado');
                }
                if (hasSellerDiscountTag) {
                    engineResult.tags.push('desconto loja');
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
                    // When seller_discount > 0, use order_discounted_price for fee calculation
                    // This is the correct base that Shopee uses (escrow API provides this directly)
                    const hasSellerDiscount = sellerDiscount > 0 && orderDiscountedPrice > 0;
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
                        if (refundAmount > 0 && shopeeOrderValue !== null && shopeeOrderValue > 0) {
                            orderValue = shopeeOrderValue;
                        } else if (hasSellerDiscount) {
                            orderValue = orderDiscountedPrice;
                        } else if (orderSellingPrice > 0) {
                            orderValue = orderSellingPrice;
                        } else if (shopeeOrderValue !== null && shopeeOrderValue > 0) {
                            orderValue = shopeeOrderValue;
                        } else {
                            orderValue = Math.max(0, tinyTotal - tinyFrete);
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
                            originalProductCount,
                            originalOrderValue,
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

            previewPayments.push({
                ...payment,
                // Apply engine result modifications
                transactionType: engineResult.transactionType || payment.transactionType,
                transactionDescription: engineResult.transactionDescription || payment.transactionDescription,
                tags: engineResult.tags,
                isAdjustment: engineResult.tags.some(t => ['ajuste', 'compensacao', 'correcao'].includes(t)),
                isRefund: engineResult.tags.some(t => ['reembolso', 'devolucao', 'estorno', 'chargeback'].includes(t)),
                isFreightAdjustment: isFreightAdjustment,
                // Include matched rule names for visual indicator
                matchedRuleNames: engineResult.matchedRules
                    .filter(r => r.matched)
                    .map(r => r.ruleName),
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
            summary: {
                total: previewPayments.length,
                linked,
                unmatched,
                multiEntry,
                matchRate: previewPayments.length > 0
                    ? ((linked / previewPayments.length) * 100).toFixed(1) + '%'
                    : '0%',
            },
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
