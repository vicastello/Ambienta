import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateMarketplaceFees } from '@/lib/marketplace-fees';

export const dynamic = 'force-dynamic';

// Marketplace-specific due date rules (days after order creation)
const MARKETPLACE_DUE_DAYS: Record<string, number> = {
    'shopee': 14,      // Shopee: D+14
    'mercado': 15,     // Mercado Livre: D+15
    'meli': 15,        // Mercado Livre (alias): D+15
    'magalu': 30,      // Magalu: D+30
    'magazine': 30,    // Magalu (alias): D+30
    'default': 30,     // Outros canais: D+30
};

/**
 * Calculate due date based on marketplace channel
 */
function getDueDays(canal: string | null): number {
    if (!canal) return MARKETPLACE_DUE_DAYS.default;
    const lowerCanal = canal.toLowerCase();

    for (const [key, days] of Object.entries(MARKETPLACE_DUE_DAYS)) {
        if (key !== 'default' && lowerCanal.includes(key)) {
            return days;
        }
    }
    return MARKETPLACE_DUE_DAYS.default;
}

/**
 * Calculate due date for an order
 */
function calculateDueDate(orderDate: Date, canal: string | null): Date {
    const dueDays = getDueDays(canal);
    const dueDate = new Date(orderDate);
    dueDate.setDate(dueDate.getDate() + dueDays);
    return dueDate;
}

/**
 * Calculate sparkline data (7 points) bucketed by time
 */
function calculateSparkline(
    items: any[],
    getValue: (item: any) => number,
    getDate: (item: any) => Date,
    startDate?: Date,
    endDate?: Date
): number[] {
    const buckets = Array(7).fill(0);

    // Determine range
    let start = startDate;
    let end = endDate;

    if (!start || !end) {
        if (!items.length) return buckets;
        const timestamps = items.map(i => getDate(i).getTime());
        if (!start) start = new Date(Math.min(...timestamps));
        if (!end) end = new Date(Math.max(...timestamps));
    }

    // Ensure valid range (default to 7 days if start >= end)
    if (start.getTime() >= end.getTime()) {
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const duration = end.getTime() - start.getTime();
    // avoid division by zero
    if (duration <= 0) return buckets;

    const bucketSize = duration / 7;

    items.forEach(item => {
        const itemDate = getDate(item);
        const diff = itemDate.getTime() - start!.getTime();
        let bucketIndex = Math.floor(diff / bucketSize);
        if (bucketIndex < 0) bucketIndex = 0;
        if (bucketIndex > 6) bucketIndex = 6;

        buckets[bucketIndex] += getValue(item);
    });

    return buckets;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);

        // Pagination
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        // Filters
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');
        const statusPagamento = searchParams.get('statusPagamento') || 'todos'; // todos, pagos, pendentes
        const marketplace = searchParams.get('marketplace') || 'todos';

        const busca = searchParams.get('busca');

        // Debug logging
        console.log('[CashFlowAPI] Filters:', {
            dataInicio,
            dataFim,
            statusPagamento,
            marketplace,
            busca,
            fullUrl: request.url
        });

        // Helper to get next day date string [YYYY-MM-DD] for inclusive upper bound filtering
        const getNextDay = (dateStr: string): string => {
            try {
                const date = new Date(dateStr);
                date.setDate(date.getDate() + 1);
                return date.toISOString().split('T')[0];
            } catch (e) {
                return dateStr;
            }
        };

        // Helper to apply filters
        const applyFilters = (query: any, ignoreStatus = false) => {
            // Text Search
            if (busca) {
                // Search in client name, ecommerce order number, and channel
                // Note: numero_pedido is int8, so ilike fails. We exclude it for now to prevent errors.
                query = query.or(`cliente_nome.ilike.%${busca}%,numero_pedido_ecommerce.ilike.%${busca}%,canal.ilike.%${busca}%`);
            }

            // data_criacao is type DATE (not TIMESTAMPTZ), so we compare with plain dates
            // The frontend sends dates in YYYY-MM-DD format from local timezone

            // UX Improvement: If searching for a specific item (text search), ignore date filters
            // to allow finding orders from any period.
            if (!busca) {
                if (dataInicio) {
                    query = query.gte('data_criacao', dataInicio);
                }
                if (dataFim) {
                    // Use Less Than Next Day to handle both DATE and TIMESTAMP types correctly inclusive of the end date
                    query = query.lt('data_criacao', getNextDay(dataFim));
                }
            }

            // Default filter: ignore cancelled (code 2)
            query = query.neq('situacao', 2);

            // UX Improvement: If searching, also ignore status filters to find the order anywhere
            if (!busca) {
                if (!ignoreStatus && statusPagamento === 'pagos') {
                    query = query.eq('payment_received', true);
                } else if (!ignoreStatus && statusPagamento === 'pendentes') {
                    query = query.or('payment_received.is.null,payment_received.eq.false');
                }
            }

            if (marketplace !== 'todos') {
                query = query.ilike('canal', `%${marketplace}%`);
            }
            return query;
        };

        // 1. List Query (Paginated)
        let listQuery = supabaseAdmin
            .from('tiny_orders')
            .select(`
                id,
                tiny_id,
                numero_pedido,
                numero_pedido_ecommerce,
                data_criacao,
                tiny_data_faturamento,
                cliente_nome,
                valor_total_pedido,
                valor,
                situacao,
                canal,
                payment_received,
                payment_received_at,
                marketplace_payment_id,
                marketplace_order_links (
                    marketplace_order_id
                ),
                marketplace_payments!marketplace_payments_tiny_order_id_fkey (
                    net_amount,
                    gross_amount,
                    transaction_type,
                    is_expense,
                    tags
                ),
                valor_frete,
                fee_overrides
            `, { count: 'exact' });

        listQuery = applyFilters(listQuery);
        listQuery = listQuery.order('data_criacao', { ascending: false });
        listQuery = listQuery.range(offset, offset + limit - 1);

        // 2. Summary Query (All matching rows for aggregation)
        // We only need fields relevant for calculation: payment status, value, date, canal
        let summaryQuery = supabaseAdmin
            .from('tiny_orders')
            .select(`
                valor_total_pedido, 
                valor, 
                payment_received, 
                data_criacao, 
                canal,
                marketplace_payment_id,
                marketplace_payments!marketplace_payments_tiny_order_id_fkey (
                    net_amount,
                    is_expense
                ),
                marketplace_order_links (
                    product_count,
                    is_kit,
                    uses_free_shipping,
                    is_campaign_order,
                    marketplace_order_id
                ),
                valor_frete,
                fee_overrides
            `);

        summaryQuery = applyFilters(summaryQuery, true);

        // Execute queries in parallel (added manual entries query AND orphan payments query)
        const [listRes, summaryRes, manualEntriesRes, sectionOrphansRes] = await Promise.all([
            listQuery,
            summaryQuery,
            (async () => {
                // Query for manual entries (Income and Expenses)
                let q = supabaseAdmin
                    .from('cash_flow_entries')
                    .select('amount, status, due_date, type');

                // Apply similar filters to manual entries
                if (dataInicio) q = q.gte('due_date', dataInicio);
                if (dataFim) q = q.lte('due_date', dataFim); // due_date is explicitly DATE type, lte works fine

                return q;
            })(),
            (async () => {
                // Query for Orphan Payments (imported but not linked)
                let q = supabaseAdmin
                    .from('marketplace_payments')
                    .select('net_amount, payment_date, transaction_description, transaction_type, marketplace')
                    .is('tiny_order_id', null);

                // Apply filters
                if (dataInicio) q = q.gte('payment_date', dataInicio);
                if (dataFim) q = q.lte('payment_date', dataFim);

                // Marketplace filter
                if (marketplace !== 'todos') {
                    q = q.eq('marketplace', marketplace);
                }

                return q;
            })()
        ]);

        if (listRes.error) {
            console.error('[CashFlowAPI] List error:', listRes.error);
            throw listRes.error;
        }
        if (summaryRes.error) {
            console.error('[CashFlowAPI] Summary error:', summaryRes.error);
            throw summaryRes.error;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day for correct date comparison

        // ... existing shopee pre-fetch logic ... Same as before ...
        // Note: For Summary logic ideally we should also pre-fetch Shopee financial data if we want perfect accuracy
        // for "Pending" orders (to detect refunds etc), but that requires fetching huge amount of data.
        // For Summary, we accept "Standard Estimation" using the fee calculator defaults as "Expected".

        // Pre-fetch Shopee data for bulk processing to avoid N+1 queries
        // This is for the LIST view (paginated)
        const shopeeOrderIds = listRes.data
            .filter(o => o.canal?.toLowerCase().includes('shopee') && o.numero_pedido_ecommerce)
            .map(o => o.numero_pedido_ecommerce as string);

        // ... (shopee pre-fetch logic continues below, unchanged)

        const shopeeOrdersMap = new Map<string, any>();
        const shopeeItemsMap = new Map<string, any[]>();

        if (shopeeOrderIds.length > 0) {
            // Fetch Orders Data (financials)
            const { data: sOrders } = await supabaseAdmin
                .from('shopee_orders')
                .select('order_sn, order_selling_price, seller_discount, voucher_from_seller, ams_commission_fee, escrow_amount, order_discounted_price, voucher_from_shopee')
                .in('order_sn', shopeeOrderIds) as any;

            if (sOrders) {
                sOrders.forEach((o: any) => shopeeOrdersMap.set(o.order_sn, o));
            }

            // Fetch Order Items (for product count / refund detection / bundle deal detection)
            const { data: sItems } = await supabaseAdmin
                .from('shopee_order_items')
                .select('order_sn, quantity, discounted_price, original_price, is_wholesale, raw_payload')
                .in('order_sn', shopeeOrderIds);

            if (sItems) {
                sItems.forEach(item => {
                    const current = shopeeItemsMap.get(item.order_sn) || [];
                    current.push(item);
                    shopeeItemsMap.set(item.order_sn, current);
                });
            }
        }

        // Processing List (async to calculate fees)
        const orders = await Promise.all(listRes.data.map(async (order) => {
            let financialStatus = 'pendente';
            let vencimentoEstimado: string | null = null;

            // @ts-ignore - payment_received exists but not in generated types
            if (order.payment_received) {
                financialStatus = 'pago';
            } else {
                const orderDate = new Date(order.data_criacao || new Date());
                const dueDate = calculateDueDate(orderDate, order.canal);
                vencimentoEstimado = dueDate.toISOString();

                if (today > dueDate) {
                    financialStatus = 'atrasado';
                }
            }

            const vTotal = Number(order.valor || order.valor_total_pedido || 0);
            const vFrete = Number(order.valor_frete || 0);
            const valorOriginal = vTotal; // The original total is still the same for display
            const baseTaxas = Math.max(0, vTotal - vFrete); // Base for fees is total minus freight

            // If we have matched payments (array), calculate the Effective Net Amount
            // Sum of all payments linked to this order (handling adjustments)
            const payments = Array.isArray(order.marketplace_payments) ? order.marketplace_payments : (order.marketplace_payments ? [order.marketplace_payments] : []);

            let valorEfetivo = 0; // Default to 0 (Not received yet)

            if (payments.length > 0) {
                // Sum all net amounts (subtract expenses/adjustments)
                const totalPaid = payments.reduce((sum: number, p: any) => {
                    const val = Number(p.net_amount || 0);
                    return sum + (p.is_expense ? -val : val);
                }, 0);
                valorEfetivo = totalPaid;
            } else if (financialStatus === 'pago') {
                // Fallback: If Tiny says it's paid but we have no payments linked,
                // assume the Original Value is what was received (Legacy behavior)
                valorEfetivo = valorOriginal;
            }

            // Calculate total adjustment amount (refunds, etc.) for difference calculation
            // This allows us to show the "real" difference (discrepancies) vs "expected" adjustments
            const totalAjustes = payments
                .filter((p: any) => p.is_expense === true)
                .reduce((sum: number, p: any) => sum + Number(p.net_amount || 0), 0);

            // Calculate expected fees
            let valorEsperado: number | undefined;
            let diferenca: number | undefined;
            let feesBreakdown: any;

            // Try to determine marketplace from canal
            const canal = order.canal?.toLowerCase() || '';
            let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;
            if (canal.includes('shopee')) marketplace = 'shopee';
            else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
            else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

            if (marketplace && valorOriginal > 0) {
                try {
                    const linkData = order.marketplace_order_links?.[0] as any;
                    let productCount = linkData?.product_count || 1;
                    let isKit = linkData?.is_kit || false;
                    let useFreeShipping = (order.fee_overrides as any)?.usesFreeShipping ?? (linkData?.uses_free_shipping || false);

                    let voucherFromSeller = 0;
                    let amsCommissionFee = 0;

                    // Use baseTaxas as default, but Shopee will override with order_selling_price
                    let feeBase = baseTaxas;

                    // Advanced Logic for Shopee (Synced with Preview Logic)
                    if (marketplace === 'shopee' && order.numero_pedido_ecommerce) {
                        const sOrder = shopeeOrdersMap.get(order.numero_pedido_ecommerce);
                        const sItems = shopeeItemsMap.get(order.numero_pedido_ecommerce);

                        // ALWAYS prefer real item count from Shopee over link data
                        // This fixes cases where link has product_count: 1 but order has 2+ items
                        if (sItems && sItems.length > 0) {
                            const realItemCount = sItems.reduce((acc: number, i: any) => acc + (i.quantity || 1), 0);
                            // Override if link is missing/wrong (link says 1 but items say more)
                            if (!linkData?.product_count || realItemCount > (linkData?.product_count || 1)) {
                                productCount = realItemCount;
                            }
                        }

                        if (sOrder && sItems && sItems.length > 0) {
                            // CRITICAL FIX: Use Shopee's order_selling_price as the fee base
                            if (sOrder.order_selling_price) {
                                feeBase = Number(sOrder.order_selling_price) || baseTaxas;
                            }

                            // BUNDLE DEAL DETECTION (Leve Mais Pague Menos)
                            // When promotion_type is "bundle_deal", Shopee calculates commission
                            // on the discounted value (after seller_discount)
                            // For other promotions (flash_sale, etc.), commission is on full price
                            const hasBundleDeal = sItems.some((item: any) =>
                                item.raw_payload?.promotion_type === 'bundle_deal' ||
                                item.is_wholesale === true
                            );

                            if (hasBundleDeal && sOrder.seller_discount) {
                                const sellerDiscount = Number(sOrder.seller_discount) || 0;
                                if (sellerDiscount > 0 && sellerDiscount < feeBase) {
                                    feeBase = feeBase - sellerDiscount;
                                }
                            }

                            // 1. Calculate calculated order value (sum of items)
                            const shopeeOrderValue = sItems.reduce((sum: number, item: any) => {
                                const price = item.discounted_price || item.original_price || 0;
                                const qty = item.quantity || 1;
                                return sum + (price * qty);
                            }, 0);

                            // 2. Refund Detection
                            // If actual selling price is lower than calculated, it means refund occurred
                            if (sOrder.order_selling_price && shopeeOrderValue > 0) {
                                const actualOrderValue = Number(sOrder.order_selling_price) || 0;
                                if (actualOrderValue < shopeeOrderValue && actualOrderValue > 0) {
                                    // Refund detected! Calculate ratio and adjust count
                                    const refundRatio = actualOrderValue / shopeeOrderValue;
                                    const originalCount = sItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
                                    const adjustedCount = Math.round(originalCount * refundRatio);
                                    productCount = Math.max(1, adjustedCount);
                                }
                            }

                            // 3. Extract Vouchers & Fees
                            if (sOrder.voucher_from_seller) {
                                voucherFromSeller = Number(sOrder.voucher_from_seller) || 0;
                            }
                            if (sOrder.ams_commission_fee) {
                                amsCommissionFee = Number(sOrder.ams_commission_fee) || 0;
                            }
                        }
                    }

                    const feeCalc = await calculateMarketplaceFees({
                        marketplace,
                        orderValue: feeBase,
                        productCount,
                        isKit,
                        usesFreeShipping: useFreeShipping,
                        sellerVoucher: voucherFromSeller > 0 ? voucherFromSeller : undefined,
                        amsCommissionFee: amsCommissionFee > 0 ? amsCommissionFee : undefined,
                        isCampaignOrder: linkData?.is_campaign_order || false,
                        orderDate: new Date(order.data_criacao || new Date())
                    });

                    // Apply manual overrides if present
                    if (order.fee_overrides) {
                        const overrides = order.fee_overrides as any;
                        if (overrides.commissionFee !== undefined) feeCalc.commissionFee = Number(overrides.commissionFee);
                        if (overrides.fixedCost !== undefined) feeCalc.fixedCost = Number(overrides.fixedCost);
                        if (overrides.campaignFee !== undefined) feeCalc.campaignFee = Number(overrides.campaignFee);

                        // Recalculate totals
                        feeCalc.totalFees = feeCalc.commissionFee + (feeCalc.campaignFee || 0) + feeCalc.fixedCost;
                        feeCalc.netValue = feeCalc.grossValue - feeCalc.totalFees;
                    }

                    if (feeCalc) {
                        // Attach Shopee Data for FeeBreakdownCard parity
                        if (marketplace === 'shopee' && order.numero_pedido_ecommerce) {
                            const sOrder = shopeeOrdersMap.get(order.numero_pedido_ecommerce);
                            if (sOrder) {
                                const orderSellingPrice = Number(sOrder.order_selling_price) || 0;
                                const sellerDiscount = Number(sOrder.seller_discount) || 0;
                                const isLeveMaisPagueMenos = sellerDiscount > 0 && orderSellingPrice > 0 && (sellerDiscount / orderSellingPrice) <= 0.05;

                                (feeCalc as any).shopeeData = {
                                    orderSellingPrice,
                                    orderDiscountedPrice: Number(sOrder.order_discounted_price) || 0,
                                    sellerDiscount,
                                    escrowAmount: Number(sOrder.escrow_amount) || 0,
                                    voucherFromSeller: Number(sOrder.voucher_from_seller) || 0,
                                    voucherFromShopee: Number(sOrder.voucher_from_shopee) || 0,
                                    amsCommissionFee: Number(sOrder.ams_commission_fee) || 0,
                                    isLeveMaisPagueMenos,
                                    // Refund info (using vars from scope if possible, else 0/defaults)
                                    // Note: we didn't store refundAmount in a variable in the outer scope, 
                                    // so we might miss it unless we refactor. 
                                    // ideally we move logic up or recalculate.
                                    refundAmount: 0,
                                    originalProductCount: 0,
                                    originalOrderValue: 0,
                                    escrowDifference: 0 // Frontend calculates this? No, backend usually does.
                                };
                            }
                        }

                        valorEsperado = feeCalc.netValue;

                        // Calculate difference only if PAID or if there are payments
                        // Avoid showing difference for pending orders where we naturally have 0 received
                        if (financialStatus === 'pago' || payments.length > 0) {
                            const valorEsperadoAjustado = valorEsperado - totalAjustes;
                            const rawDiferenca = valorEfetivo - valorEsperadoAjustado;
                            diferenca = Math.abs(rawDiferenca) < 0.01 ? 0 : Math.round(rawDiferenca * 100) / 100;
                        }

                        feesBreakdown = feeCalc;
                    }
                } catch (error) {
                    console.error('[CashFlowAPI] Fee calculation error for order:', order.id, error);
                }
            }

            return {
                id: order.id,
                tiny_id: order.tiny_id,
                numero_pedido: order.numero_pedido,
                numero_pedido_ecommerce: order.numero_pedido_ecommerce,
                cliente: order.cliente_nome,
                valor: valorEfetivo,
                valor_original: valorOriginal,
                valor_esperado: valorEsperado,
                diferenca: diferenca,
                fees_breakdown: feesBreakdown,
                data_pedido: order.data_criacao,
                data_faturamento: order.tiny_data_faturamento,
                vencimento_estimado: vencimentoEstimado,
                status_pagamento: financialStatus,
                data_pagamento: order.payment_received_at,
                canal: order.canal,
                marketplace_info: order.marketplace_order_links?.[0] || null,
                payments_breakdown: payments // Pass all payments for UI details
            };
        }));

        // Processing Summary
        const summary = {
            recebido: 0,
            pendente: 0,
            atrasado: 0,
            total: 0,
            expenses: {
                total: 0,
                paid: 0,
                pending: 0,
                overdue: 0
            },
            sparklines: {
                total: [] as number[],
                recebido: [] as number[],
                pendente: [] as number[],
                atrasado: [] as number[],
                saidas: [] as number[]
            }
        };

        // Prepare data for sparklines
        const sparklineItems: any[] = [];

        // ------------------------------------------------------------------
        // REFACTORED SUMMARY CALCULATION (ASYNC)
        // ------------------------------------------------------------------

        // Helper to process summary item asynchronously
        const processSummaryItem = async (o: any) => {
            const vTotal = Number(o.valor || o.valor_total_pedido || 0);
            const vFrete = Number(o.valor_frete || 0);
            const valorOriginal = vTotal;
            const baseTaxas = Math.max(0, vTotal - vFrete);

            // Re-calculate fee if there's an override for summary accuracy
            let vEsperado: number | undefined;
            if (o.fee_overrides) {
                const overrides = o.fee_overrides as any;
                const totalFees = (Number(overrides.commissionFee) || 0) +
                    (Number(overrides.fixedCost) || 0) +
                    (Number(overrides.campaignFee) || 0);
                vEsperado = baseTaxas - totalFees;
            }

            // Prefer Net Amount from payment(s) if available
            const payments = Array.isArray(o.marketplace_payments) ? o.marketplace_payments : (o.marketplace_payments ? [o.marketplace_payments] : []);

            let valor = o.fee_overrides ? (vEsperado || 0) : valorOriginal;
            let usedEstimatedValue = false;

            if (payments.length > 0) {
                valor = payments.reduce((sum: number, p: any) => {
                    const val = Number(p.net_amount || 0);
                    // Use Math.abs and is_expense to guarantee correct sign
                    // Expenses subtract, Income adds
                    return sum + (p.is_expense ? -Math.abs(val) : Math.abs(val));
                }, 0);
            } else if (!o.payment_received) {
                // If Pending and NO Payments, use Expected Net Value (Calculated)
                // This answers the user request: "Pending card should show expected value"

                if (vEsperado !== undefined) {
                    valor = vEsperado;
                } else {
                    // Calculate expected fees on fly using cached configs
                    const canal = o.canal?.toLowerCase() || '';
                    let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;
                    if (canal.includes('shopee')) marketplace = 'shopee';
                    else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
                    else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

                    if (marketplace) {
                        try {
                            const linkData = o.marketplace_order_links?.[0] as any;

                            // Initialize with link data or defaults
                            let productCount = linkData?.product_count || 1;
                            let isKit = linkData?.is_kit || false;
                            let amsCommissionFee = 0;
                            let feeBase = baseTaxas; // Default, will be overridden for Shopee

                            // ALWAYS prefer real item count from Shopee over link data
                            // This ensures Summary matches List View calculations
                            if (marketplace === 'shopee') {
                                const sItems = shopeeItemsMap.get(o.numero_pedido_ecommerce);
                                const sOrder = shopeeOrdersMap.get(o.numero_pedido_ecommerce);

                                if (sItems && sItems.length > 0) {
                                    const realItemCount = sItems.reduce((acc: number, i: any) => acc + (i.quantity || 1), 0);
                                    // Override if link is missing/wrong (link says 1 but items say more)
                                    if (!linkData?.product_count || realItemCount > (linkData?.product_count || 1)) {
                                        productCount = realItemCount;
                                    }
                                }

                                // CRITICAL FIX: Use order_selling_price as the fee base for Shopee
                                if (sOrder?.order_selling_price) {
                                    feeBase = Number(sOrder.order_selling_price) || baseTaxas;
                                }

                                // BUNDLE DEAL DETECTION (Leve Mais Pague Menos)
                                // Only subtract seller_discount for bundle_deal promotions
                                const hasBundleDeal = sItems?.some((item: any) =>
                                    item.raw_payload?.promotion_type === 'bundle_deal' ||
                                    item.is_wholesale === true
                                );

                                if (hasBundleDeal && sOrder?.seller_discount) {
                                    const sellerDiscount = Number(sOrder.seller_discount) || 0;
                                    if (sellerDiscount > 0 && sellerDiscount < feeBase) {
                                        feeBase = feeBase - sellerDiscount;
                                    }
                                }

                                // Extract AMS Commission for more accurate pending value estimation
                                if (sOrder?.ams_commission_fee) {
                                    amsCommissionFee = Number(sOrder.ams_commission_fee) || 0;
                                }
                            }

                            const feeCalc = await calculateMarketplaceFees({
                                marketplace,
                                orderValue: feeBase,
                                productCount,
                                isKit,
                                usesFreeShipping: (o.fee_overrides as any)?.usesFreeShipping ?? (linkData?.uses_free_shipping || false),
                                amsCommissionFee: amsCommissionFee > 0 ? amsCommissionFee : undefined,
                                isCampaignOrder: linkData?.is_campaign_order || false,
                                orderDate: new Date(o.data_criacao || new Date())
                            });
                            valor = feeCalc.netValue;
                            usedEstimatedValue = true;
                        } catch (e) {
                            // Fallback to gross if error (e.g. missing config)
                            valor = valorOriginal;
                        }
                    }
                }
            } else if (o.payment_received) {
                // Paid in Tiny but no payments synced?
                // Probably manual link or legacy. Use Gross.
                valor = valorOriginal;
            }

            // --- Accumulate ---
            // Use local vars to avoid race conditions (accumulator pattern) or return result object
            return {
                valor,
                payment_received: o.payment_received,
                data_criacao: o.data_criacao,
                canal: o.canal,
                is_estimated: usedEstimatedValue
            };
        };

        // Process all summary items
        // Important: Using Promise.all here might be heavy if thousands of orders.
        // Optimally we'd use a batching approach or standard loop if synchronous, but we need async fee calc.
        // However, `calculateMarketplaceFees` mainly hits memory cache.
        const summaryResults = await Promise.all(summaryRes.data.map(processSummaryItem));

        // Aggregate results
        summaryResults.forEach(item => {
            summary.total += item.valor;

            if (item.payment_received) {
                summary.recebido += item.valor;
            } else {
                const orderDate = new Date(item.data_criacao || new Date());
                const dueDate = calculateDueDate(orderDate, item.canal);

                if (today > dueDate) {
                    summary.atrasado += item.valor;
                } else {
                    summary.pendente += item.valor;
                }
            }

            // sparklines populate...
            sparklineItems.push({
                date: new Date(item.data_criacao || new Date()),
                valor: item.valor, // Now using expected net for pending
                type: 'income',
                status: item.payment_received ? 'pago' : (today > calculateDueDate(new Date(item.data_criacao), item.canal) ? 'atrasado' : 'pendente')
            });
        });


        // 2. Process Manual Entries (Income and Expense)
        if (manualEntriesRes.data) {
            manualEntriesRes.data.forEach((entry: any) => {
                const valor = Number(entry.amount || 0);

                if (entry.type === 'expense') {
                    summary.expenses.total += valor;
                    // Subtract expense from Grand Total (Net Balance concept)
                    summary.total -= valor;

                    if (entry.status === 'confirmed') {
                        summary.expenses.paid += valor;
                    } else {
                        const dueDate = new Date(entry.due_date);
                        // Fix for overdue calculation consistency
                        if (today > dueDate && entry.status !== 'confirmed') {
                            summary.expenses.overdue += valor;
                        } else {
                            summary.expenses.pending += valor;
                        }
                    }
                } else {
                    // Income logic
                    summary.total += valor;

                    if (entry.status === 'confirmed') {
                        summary.recebido += valor;
                    } else {
                        const dueDate = new Date(entry.due_date);
                        if (today > dueDate && entry.status !== 'confirmed') {
                            summary.atrasado += valor;
                        } else {
                            summary.pendente += valor;
                        }
                    }
                }

                // Add to sparkline items
                sparklineItems.push({
                    date: new Date(entry.due_date),
                    valor,
                    type: entry.type === 'expense' ? 'expense' : 'income',
                    status: entry.status === 'confirmed' ? 'pago' : (today > new Date(entry.due_date) ? 'atrasado' : 'pendente')
                });
            });
        }

        // 3. Process Orphan Payments (Ads, Adjustments, etc.)
        if (sectionOrphansRes && sectionOrphansRes.data) {
            sectionOrphansRes.data.forEach((p: any) => {
                let description = p.transaction_description || p.description || p.transaction_type || 'Importado';

                // Check for Ads/Recarga keywords but exclude refunds
                const descLower = description.toLowerCase();
                const isAdsOrRecharge = descLower.match(/recarga|ads|publicidade/) &&
                    !descLower.match(/reembolso|estorno|cancelamento/);

                const isExpense = (p.net_amount || 0) < 0 || !!isAdsOrRecharge;
                const valor = Math.abs(Number(p.net_amount || 0));

                if (isExpense) {
                    summary.expenses.total += valor;
                    summary.expenses.paid += valor; // Imports are always paid
                    summary.total -= valor; // Deduct from net balance
                } else {
                    // Income orphan (e.g. bonus, adjustment credit)
                    summary.total += valor;
                    summary.recebido += valor;
                }

                // Add to sparkline items
                sparklineItems.push({
                    date: new Date(p.payment_date),
                    valor,
                    type: isExpense ? 'expense' : 'income',
                    status: 'pago' // Always paid
                });
            });
        }

        // Calculate Sparklines
        const rangeStart = dataInicio ? new Date(dataInicio) : undefined;
        const rangeEnd = dataFim ? new Date(dataFim) : undefined;

        // 1. Total (Net Balance: Income - Expense)
        summary.sparklines.total = calculateSparkline(
            sparklineItems,
            (item) => item.type === 'expense' ? -item.valor : item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // 2. Recebido (Paid Income)
        summary.sparklines.recebido = calculateSparkline(
            sparklineItems.filter(i => i.type === 'income' && i.status === 'pago'),
            (item) => item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // 3. Pendente (Pending Income)
        summary.sparklines.pendente = calculateSparkline(
            sparklineItems.filter(i => i.type === 'income' && i.status === 'pendente'),
            (item) => item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // 4. Atrasado (Overdue Income)
        summary.sparklines.atrasado = calculateSparkline(
            sparklineItems.filter(i => i.type === 'income' && i.status === 'atrasado'),
            (item) => item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // 5. Saídas (Expenses)
        summary.sparklines.saidas = calculateSparkline(
            sparklineItems.filter(i => i.type === 'expense'),
            (item) => item.valor,
            (item) => item.date,
            rangeStart,
            rangeEnd
        );

        // Construct final expenses array for the Chart
        const finalExpenses: any[] = [];

        // 1. Add Manual Expenses
        if (manualEntriesRes.data) {
            finalExpenses.push(...manualEntriesRes.data.filter((e: any) => e.type === 'expense'));
        }

        // 2. Add Orphan Expenses (Ads/Recarga)
        if (sectionOrphansRes && sectionOrphansRes.data) {
            sectionOrphansRes.data.forEach((p: any) => {
                let description = p.transaction_description || p.description || p.transaction_type || 'Importado';
                const descLower = description.toLowerCase();
                const isAdsOrRecharge = descLower.match(/recarga|ads|publicidade/) &&
                    !descLower.match(/reembolso|estorno|cancelamento/);

                const isExpense = (p.net_amount || 0) < 0 || !!isAdsOrRecharge;

                if (isExpense) {
                    finalExpenses.push({
                        amount: Math.abs(Number(p.net_amount || 0)),
                        due_date: p.payment_date,
                        status: 'confirmed', // Imports are always paid
                        type: 'expense',
                        description: description
                    });
                }
            });
        }

        return NextResponse.json({
            orders,
            chartOrders: sparklineItems
                .filter(i => i.type === 'income')
                .map(i => ({
                    id: 0,
                    valor: i.valor,
                    data_pedido: i.date,
                    status_pagamento: i.status
                })),
            expenses: finalExpenses, // Return correctly filtered and merged expenses
            meta: {
                total: listRes.count,
                page,
                limit,
                totalPages: listRes.count ? Math.ceil(listRes.count / limit) : 0,
                summary, // Include the calculated summary
                dueDateRules: MARKETPLACE_DUE_DAYS // Expose rules for client info
            }
        });

    } catch (error: any) {
        console.error('[CashFlowAPI] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno: ' + error.message }, { status: 500 });
    }
}

