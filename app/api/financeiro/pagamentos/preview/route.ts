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

        console.log('[PaymentPreview] Start:', { marketplace, filename: file?.name });

        if (!file) {
            return NextResponse.json({ error: 'Arquivo não fornecido' }, { status: 400 });
        }

        if (!marketplace) {
            return NextResponse.json({ error: 'Marketplace não especificado' }, { status: 400 });
        }

        // 1. Parse file
        const parseResult = await parsePaymentFile(file, marketplace);
        console.log(`[PaymentPreview] Parsed ${parseResult.payments.length} payments in ${Date.now() - startTime}ms`);

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
        let rulesEngine: RulesEngine;
        try {
            // Note: Using 'as any' until auto_rules table is added to Supabase types
            const { data: dbRules } = await (supabaseAdmin as any)
                .from('auto_rules')
                .select('*')
                .eq('enabled', true)
                .order('priority', { ascending: false });

            // Convert DB rows to AutoRule format
            const userRules: AutoRule[] = (dbRules || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                description: row.description,
                marketplace: row.marketplace,
                conditions: row.conditions || [],
                conditionLogic: row.condition_logic || 'AND',
                actions: row.actions || [],
                priority: row.priority,
                enabled: row.enabled,
                stopOnMatch: row.stop_on_match,
                isSystemRule: row.is_system_rule,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }));

            // Combine user rules with system rules
            const allRules = [...userRules, ...getSystemRules()];
            rulesEngine = new RulesEngine(allRules);

            console.log(`[Preview] Loaded ${userRules.length} user rules + ${getSystemRules().length} system rules for ${marketplace}`);

            // Detailed logging of user rules for debugging
            if (userRules.length > 0) {
                console.log('[Preview] User rules details:', userRules.map(r => ({
                    id: r.id,
                    name: r.name,
                    marketplace: r.marketplace,
                    enabled: r.enabled,
                    conditions: r.conditions,
                    actions: r.actions,
                })));
            }
        } catch (error) {
            console.warn('[Preview] Error loading new rules, falling back to empty:', error);
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

        console.log(`[PaymentPreview] Fetching data for ${orderIdsArray.length} order IDs (${baseOrderIds.length} unique base IDs)`);

        // 3b. BATCH QUERY: Fetch all marketplace_order_links at once
        const batchQueryStart = Date.now();
        const { data: allLinks } = await supabaseAdmin
            .from('marketplace_order_links')
            .select(`
                marketplace_order_id,
                tiny_order_id,
                tiny_orders!inner(
                    id,
                    numero_pedido,
                    cliente_nome,
                    valor_total_pedido,
                    valor,
                    valor_frete,
                    data_criacao
                )
            `)
            .eq('marketplace', marketplace)
            .in('marketplace_order_id', orderIdsArray);

        // Create lookup map for O(1) access
        // Using 'any' to work around Supabase TypeScript inference issues
        const linksMap = new Map<string, any>();
        if (allLinks) {
            for (const link of allLinks as any[]) {
                linksMap.set(link.marketplace_order_id, link);
            }
        }
        console.log(`[PaymentPreview] Fetched ${allLinks?.length || 0} order links in ${Date.now() - batchQueryStart}ms`);

        // 3c. BATCH QUERY: Fetch all shopee_order_items at once (for Shopee only)
        type ShopeeOrderItem = { order_sn: string; quantity: number | null; discounted_price: number | null; original_price: number | null };
        const itemsByOrderSn = new Map<string, ShopeeOrderItem[]>();

        if (marketplace === 'shopee' && baseOrderIds.length > 0) {
            const itemsQueryStart = Date.now();
            const { data: allItems } = await supabaseAdmin
                .from('shopee_order_items')
                .select('order_sn, quantity, discounted_price, original_price')
                .in('order_sn', baseOrderIds);

            // Group items by order_sn
            if (allItems) {
                for (const item of allItems) {
                    const existing = itemsByOrderSn.get(item.order_sn) || [];
                    existing.push(item);
                    itemsByOrderSn.set(item.order_sn, existing);
                }
            }
            console.log(`[PaymentPreview] Fetched ${allItems?.length || 0} shopee items for ${itemsByOrderSn.size} orders in ${Date.now() - itemsQueryStart}ms`);
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
        };
        const shopeeOrdersMap = new Map<string, ShopeeOrderData>();

        if (marketplace === 'shopee' && baseOrderIds.length > 0) {
            const ordersQueryStart = Date.now();
            // Using 'as any' to work around Supabase TypeScript column validation issues
            const { data: allShopeeOrders } = await (supabaseAdmin as any)
                .from('shopee_orders')
                .select('order_sn, total_amount, voucher_from_seller, voucher_from_shopee, seller_voucher_code, ams_commission_fee, order_selling_price, order_discounted_price, seller_discount, escrow_amount')
                .in('order_sn', baseOrderIds);

            if (allShopeeOrders) {
                for (const order of allShopeeOrders as any[]) {
                    shopeeOrdersMap.set(order.order_sn, order as ShopeeOrderData);
                }
            }
            console.log(`[PaymentPreview] Fetched ${allShopeeOrders?.length || 0} shopee orders in ${Date.now() - ordersQueryStart}ms`);
        }

        console.log(`[PaymentPreview] All batch queries completed in ${Date.now() - batchQueryStart}ms`);

        // 4. Process payments using cached data (no more individual queries!)
        const previewPayments: PreviewPayment[] = [];
        const processStart = Date.now();

        console.log(`[Preview] Starting to process ${parseResult.payments.length} payments with ${rulesEngine.getRules().length} active rules`);

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

            // Debug logging for rule matching (only log first 5 to avoid spam)
            if (previewPayments.length < 5) {
                console.log(`[Preview] Payment ${previewPayments.length + 1}:`, {
                    orderId: payment.marketplaceOrderId,
                    desc: payment.transactionDescription?.substring(0, 60),
                    inputToEngine: {
                        description: paymentInput.transactionDescription?.substring(0, 60),
                        type: paymentInput.transactionType,
                    },
                    tags: engineResult.tags,
                    totalRulesEvaluated: engineResult.totalRulesEvaluated,
                    matchedRules: engineResult.matchedRules.filter(r => r.matched).map(r => ({
                        name: r.ruleName,
                        conditions: r.conditionResults,
                    })),
                });
            }

            // ALWAYS log when user-defined rules match (to verify they're working)
            const userRuleMatches = engineResult.matchedRules.filter(r =>
                r.matched && !r.ruleName.startsWith('Sistema:')
            );
            if (userRuleMatches.length > 0) {
                console.log(`[Preview] ✓ USER RULE MATCHED:`, {
                    orderId: payment.marketplaceOrderId,
                    desc: payment.transactionDescription?.substring(0, 60),
                    tags: engineResult.tags,
                    matchedUserRules: userRuleMatches.map(r => r.ruleName),
                });
            }

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

                if (escrowData && shopeeOrderValue && shopeeOrderValue > 0) {
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
                if (escrowData?.order_selling_price) {
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

                // Determine if this is "leve mais pague menos"
                const isLeveMaisPagueMenos = sellerDiscount > 0 &&
                    orderSellingPrice > 0 &&
                    (sellerDiscount / orderSellingPrice) <= 0.05;

                // Add automatic tags based on escrow data
                if (voucherFromSeller > 0) {
                    engineResult.tags.push('cupom loja');
                }
                if (amsCommissionFee > 0) {
                    engineResult.tags.push('comissão afiliado');
                }
                if (isLeveMaisPagueMenos) {
                    engineResult.tags.push('leve mais pague menos');
                }
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
                    const isLeveMaisPagueMenos = sellerDiscount > 0 &&
                        orderSellingPrice > 0 &&
                        (sellerDiscount / orderSellingPrice) <= 0.05;

                    if (marketplace === 'shopee') {
                        if (refundAmount > 0 && shopeeOrderValue !== null && shopeeOrderValue > 0) {
                            orderValue = shopeeOrderValue;
                        } else if (isLeveMaisPagueMenos && orderDiscountedPrice > 0) {
                            orderValue = orderDiscountedPrice;
                        } else if (orderSellingPrice > 0) {
                            orderValue = orderSellingPrice;
                        } else if (shopeeOrderValue !== null && shopeeOrderValue > 0) {
                            orderValue = shopeeOrderValue;
                        } else {
                            orderValue = Math.max(0, Number((linkData as any).tiny_orders.valor || (linkData as any).tiny_orders.valor_total_pedido || 0) - Number((linkData as any).tiny_orders.valor_frete || 0));
                        }
                    } else {
                        orderValue = Math.max(0, Number((linkData as any).tiny_orders.valor || (linkData as any).tiny_orders.valor_total_pedido || 0) - Number((linkData as any).tiny_orders.valor_frete || 0));
                    }

                    const feeCalc = await calculateMarketplaceFees({
                        marketplace: marketplace as 'shopee' | 'mercado_livre' | 'magalu',
                        orderDate: orderDate,
                        orderValue: orderValue,
                        productCount: productCount,
                        isKit: false,
                        usesFreeShipping: undefined,
                        isCampaignOrder: false,
                        sellerVoucher: marketplace === 'shopee' ? voucherFromSeller : undefined,
                        amsCommissionFee: marketplace === 'shopee' ? amsCommissionFee : undefined,
                    });

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
                            isLeveMaisPagueMenos: sellerDiscount > 0 && orderSellingPrice > 0 && (sellerDiscount / orderSellingPrice) <= 0.05,
                            escrowDifference: escrowAmount > 0 ? feeCalc.netValue - escrowAmount : 0,
                        } : undefined,
                    };
                } catch (error) {
                    console.error('[Preview API] Fee calculation error:', error);
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
                    valor_total_pedido: Number((linkData as any).tiny_orders.valor_total_pedido || (linkData as any).tiny_orders.valor || 0),
                    valor_esperado: valorEsperado,
                    fees_breakdown: feesBreakdown,
                    data_criacao: (linkData as any).tiny_orders.data_criacao || null,
                } : undefined,
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
