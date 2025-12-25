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
        } catch (error) {
            console.warn('[Preview] Error loading new rules, falling back to empty:', error);
            rulesEngine = new RulesEngine(getSystemRules());
        }

        // 3. Apply rules and check for matches
        const previewPayments: PreviewPayment[] = [];

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

            // Debug logging for rule matching
            if (engineResult.tags.length > 0) {
                console.log(`[Preview] Tags applied to ${payment.marketplaceOrderId}:`, {
                    desc: payment.transactionDescription?.substring(0, 50),
                    type: payment.transactionType,
                    tags: engineResult.tags,
                    matchedRules: engineResult.matchedRules.filter(r => r.matched).map(r => r.ruleName),
                });
            }


            // Check if order exists in marketplace_order_links
            const { data: linkData } = await supabaseAdmin
                .from('marketplace_order_links')
                .select(`
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
                .in('marketplace_order_id', [payment.marketplaceOrderId, payment.marketplaceOrderId.replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA)(?:_\d+)?$|_\d+$/, '')])
                .limit(1)
                .maybeSingle();

            // Get product count and original order value from shopee_order_items for Shopee orders
            // We use discounted_price (seller's price after seller discount, before customer coupons)
            // because that's what Shopee calculates fees on
            let productCount = 1;
            let originalProductCount = 1; // Before refunds
            let shopeeOrderValue: number | null = null;
            let originalOrderValue: number | null = null; // Before refunds
            let refundAmount = 0; // Amount refunded
            let voucherFromSeller = 0;
            let voucherFromShopee = 0;
            let amsCommissionFee = 0;
            let orderSellingPrice = 0;
            let orderDiscountedPrice = 0; // Base value for fee calculation (after seller discount)
            let sellerDiscount = 0;
            let escrowAmount = 0;

            // Strip suffixes from marketplaceOrderId (e.g., "123_AJUSTE_2" -> "123", "123_REEMBOLSO" -> "123")
            // This ensures adjustment entries can still fetch related order/item data
            const baseMarketplaceOrderId = payment.marketplaceOrderId.replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA)(?:_\d+)?$|_\d+$/, '');

            if (marketplace === 'shopee' && payment.marketplaceOrderId) {
                // Get items for product count and base value
                const { data: itemsData, error: itemsError } = await supabaseAdmin
                    .from('shopee_order_items')
                    .select('quantity, discounted_price, original_price')
                    .eq('order_sn', baseMarketplaceOrderId);

                console.log(`[Preview] Order ${payment.marketplaceOrderId}: shopee_order_items query result:`,
                    itemsData ? `${itemsData.length} items found` : 'no data',
                    itemsError ? `Error: ${itemsError.message}` : '');

                if (itemsData && itemsData.length > 0) {
                    productCount = itemsData.reduce((sum, item) => sum + (item.quantity || 1), 0);
                    // Sum up discounted_price × quantity for each item
                    shopeeOrderValue = itemsData.reduce((sum, item) => {
                        const price = item.discounted_price || item.original_price || 0;
                        const qty = item.quantity || 1;
                        return sum + (price * qty);
                    }, 0);

                    // Calculate average price per unit for later refund adjustment
                    // This will be used to detect if items were refunded
                }

                // Get voucher and affiliate data from shopee_orders (if available)
                const { data: shopeeOrderData } = await supabaseAdmin
                    .from('shopee_orders')
                    .select('order_sn, total_amount, voucher_from_seller, voucher_from_shopee, seller_voucher_code, ams_commission_fee, order_selling_price, order_discounted_price, seller_discount, escrow_amount')
                    .eq('order_sn', baseMarketplaceOrderId)
                    .maybeSingle();

                // Adjust productCount if total_amount differs from calculated value
                // IMPORTANT: total_amount reflects the actual order value AFTER refunds
                // order_selling_price is the ORIGINAL value before any refunds
                // So we use total_amount to detect refunds
                const escrowData = shopeeOrderData as any;
                if (escrowData && shopeeOrderValue && shopeeOrderValue > 0) {
                    // Use total_amount as the definitive post-refund value
                    // If total_amount is not available or 0, fall back to order_selling_price
                    const totalAmount = Number(escrowData.total_amount) || 0;
                    const sellingPrice = Number(escrowData.order_selling_price) || 0;

                    // total_amount is the final value after refunds
                    // If total_amount < order_selling_price, there was a refund
                    const actualOrderValue = totalAmount > 0 ? totalAmount : sellingPrice;

                    if (actualOrderValue > 0 && actualOrderValue < shopeeOrderValue) {
                        // Refund detected! Calculate the ratio and adjust product count
                        originalProductCount = productCount;
                        originalOrderValue = shopeeOrderValue;
                        refundAmount = shopeeOrderValue - actualOrderValue;

                        const refundRatio = actualOrderValue / shopeeOrderValue;
                        const adjustedCount = Math.round(productCount * refundRatio);
                        console.log(`[Preview] Order ${payment.marketplaceOrderId}: Refund detected! Original: R$${shopeeOrderValue.toFixed(2)}, Actual: R$${actualOrderValue.toFixed(2)}, Refund: R$${refundAmount.toFixed(2)}, Original count: ${productCount}, Adjusted count: ${adjustedCount}`);
                        productCount = Math.max(1, adjustedCount);
                        // Update shopeeOrderValue to match actual post-refund value
                        shopeeOrderValue = actualOrderValue;
                    }
                }
                if (escrowData?.voucher_from_seller) {
                    voucherFromSeller = Number(escrowData.voucher_from_seller) || 0;
                }

                // Get affiliate commission (AMS = Affiliate Marketing Solutions)
                if (escrowData?.ams_commission_fee) {
                    amsCommissionFee = Number(escrowData.ams_commission_fee) || 0;
                }

                // Get order prices and discounts
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

                // Determine if this is "leve mais pague menos" (small ~2% discount) or a promotional discount
                // Leve mais pague menos is typically 2% of the selling price
                const isLeveMaisPagueMenos = sellerDiscount > 0 &&
                    orderSellingPrice > 0 &&
                    (sellerDiscount / orderSellingPrice) <= 0.05; // Up to 5% is considered leve mais pague menos

                // Add automatic tags based on escrow data
                if (voucherFromSeller > 0) {
                    engineResult.tags.push('cupom loja');
                }
                if (amsCommissionFee > 0) {
                    engineResult.tags.push('comissão afiliado');
                }
                // Only add tag for real "leve mais pague menos" discounts (~2%)
                // High seller_discount values are just inflated original prices, not real costs
                if (isLeveMaisPagueMenos) {
                    engineResult.tags.push('leve mais pague menos');
                }

                // Note: voucher and ams_commission are passed separately to the fee calculation
                console.log(`[Preview] Order ${payment.marketplaceOrderId}: productCount=${productCount}, orderSellingPrice=${orderSellingPrice}, orderDiscountedPrice=${orderDiscountedPrice}, sellerDiscount=${sellerDiscount}, escrowAmount=${escrowAmount}`);
            }

            // Calculate expected fees if order is linked
            let valorEsperado: number | undefined;
            let feesBreakdown: any;

            if (linkData && linkData.tiny_orders) {
                try {
                    // Use order date from Tiny (data_criacao) to determine fee period
                    const orderDateStr = (linkData as any).tiny_orders.data_criacao || payment.paymentDate;
                    // Add T12:00:00 to avoid timezone issues (midnight UTC becomes previous day in BRT)
                    const normalizedDateStr = orderDateStr && !orderDateStr.includes('T')
                        ? `${orderDateStr.split(' ')[0]}T12:00:00`
                        : orderDateStr;
                    const orderDate = normalizedDateStr ? new Date(normalizedDateStr) : new Date();

                    // For Shopee, use order_discounted_price as the base for fee calculation
                    // order_discounted_price = order_selling_price - seller_discount
                    // This is what Shopee actually uses to calculate commission and service fees
                    // For other marketplaces, use Tiny value
                    let orderValue: number;
                    // Determine if seller_discount is "leve mais pague menos" (small ~2% discount)
                    const isLeveMaisPagueMenos = sellerDiscount > 0 &&
                        orderSellingPrice > 0 &&
                        (sellerDiscount / orderSellingPrice) <= 0.05;

                    if (marketplace === 'shopee') {
                        // For Shopee, use the post-refund value if a refund occurred
                        // shopeeOrderValue is already adjusted after refund detection above
                        // Only fall back to orderSellingPrice/orderDiscountedPrice if no refund
                        if (refundAmount > 0 && shopeeOrderValue !== null && shopeeOrderValue > 0) {
                            // Refund occurred - use the post-refund value
                            orderValue = shopeeOrderValue;
                        } else if (isLeveMaisPagueMenos && orderDiscountedPrice > 0) {
                            // Small discount like "leve mais pague menos" - use discounted price
                            orderValue = orderDiscountedPrice;
                        } else if (orderSellingPrice > 0) {
                            // Large promotional discount or no discount - use selling price
                            orderValue = orderSellingPrice;
                        } else if (shopeeOrderValue !== null && shopeeOrderValue > 0) {
                            // Fallback: use calculated value from items
                            orderValue = shopeeOrderValue;
                        } else {
                            // Last resort: use Tiny value minus freight
                            orderValue = Math.max(0, Number((linkData as any).tiny_orders.valor || (linkData as any).tiny_orders.valor_total_pedido || 0) - Number((linkData as any).tiny_orders.valor_frete || 0));
                        }
                        console.log(`[Preview] Order ${payment.marketplaceOrderId}: Fee calculation base value = R$${orderValue.toFixed(2)} (refund: ${refundAmount > 0 ? 'yes' : 'no'})`);
                    } else {
                        orderValue = Math.max(0, Number((linkData as any).tiny_orders.valor || (linkData as any).tiny_orders.valor_total_pedido || 0) - Number((linkData as any).tiny_orders.valor_frete || 0));
                    }

                    const feeCalc = await calculateMarketplaceFees({
                        marketplace: marketplace as 'shopee' | 'mercado_livre' | 'magalu',
                        orderDate: orderDate,
                        orderValue: orderValue,
                        productCount: productCount,
                        isKit: false, // Would need marketplace_kit_components check
                        usesFreeShipping: undefined, // Use global config
                        isCampaignOrder: false,
                        sellerVoucher: marketplace === 'shopee' ? voucherFromSeller : undefined,
                        amsCommissionFee: marketplace === 'shopee' ? amsCommissionFee : undefined,
                        // Note: seller_discount is NOT passed here because it's already reflected in order_selling_price
                    });

                    console.log(`[Preview] Order ${payment.marketplaceOrderId} fee calculation result:`, {
                        grossValue: feeCalc.grossValue,
                        commissionFee: feeCalc.commissionFee,
                        campaignFee: feeCalc.campaignFee,
                        fixedCost: feeCalc.fixedCost,
                        sellerVoucher: feeCalc.sellerVoucher,
                        amsCommissionFee: feeCalc.amsCommissionFee,
                        totalFees: feeCalc.totalFees,
                        netValue: feeCalc.netValue,
                        inputOrderValue: orderValue,
                    });

                    valorEsperado = feeCalc.netValue;

                    // Build extended fees breakdown with all data for transparency
                    feesBreakdown = {
                        ...feeCalc,
                        // Additional context for UI
                        productCount,
                        // Shopee escrow data from API
                        shopeeData: marketplace === 'shopee' ? {
                            orderSellingPrice,
                            orderDiscountedPrice, // Base value for fee calculation
                            sellerDiscount,
                            escrowAmount,
                            voucherFromSeller,
                            voucherFromShopee,
                            amsCommissionFee,
                            // Refund information
                            refundAmount,
                            originalProductCount,
                            originalOrderValue,
                            // Flag to indicate if this is "leve mais pague menos" vs promotional discount
                            isLeveMaisPagueMenos: sellerDiscount > 0 && orderSellingPrice > 0 && (sellerDiscount / orderSellingPrice) <= 0.05,
                            // Calculate the difference between our calculation and Shopee's escrow
                            escrowDifference: escrowAmount > 0 ? feeCalc.netValue - escrowAmount : 0,
                        } : undefined,
                    };
                } catch (error) {
                    console.error('[Preview API] Fee calculation error:', error);
                }
            }

            previewPayments.push({
                ...payment,
                tags: engineResult.tags,
                isAdjustment: engineResult.tags.some(t => ['ajuste', 'compensacao', 'correcao'].includes(t)),
                isRefund: engineResult.tags.some(t => ['reembolso', 'devolucao', 'estorno', 'chargeback'].includes(t)),
                isFreightAdjustment: isFreightAdjustment,
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
