import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parsePaymentFile, type ParsedPayment } from '@/lib/paymentParsers';
import { applySmartTags, detectMultiEntry, convertDbRulesToTagRules } from '@/lib/smartTagger';
import { calculateMarketplaceFees } from '@/lib/marketplace-fees';

export const config = {
    api: {
        bodyParser: false,
    },
};

export type PreviewPayment = ParsedPayment & {
    tags: string[];
    isAdjustment: boolean;
    isRefund: boolean;
    matchStatus: 'linked' | 'unmatched' | 'multiple_entries';
    tinyOrderId?: number;
    tinyOrderInfo?: {
        id: number;
        numero_pedido: string;
        cliente_nome: string;
        valor_total_pedido: number;
        valor_esperado?: number;
        fees_breakdown?: any;
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

        // 2. Fetch auto-link rules from DB
        const { data: dbRules } = await supabaseAdmin
            .from('payment_auto_link_rules')
            .select('transaction_type_pattern, tags, priority')
            .eq('marketplace', marketplace)
            .order('priority', { ascending: false });

        const customRules = dbRules ? convertDbRulesToTagRules(dbRules) : [];

        // 3. Apply smart tagging and check for matches
        const previewPayments: PreviewPayment[] = [];

        for (const payment of parseResult.payments) {
            // Apply smart tags
            const tagResult = applySmartTags(
                payment.rawData?.toString() || '',
                undefined,
                customRules
            );

            // Check if order exists in marketplace_order_links
            const { data: linkData } = await supabaseAdmin
                .from('marketplace_order_links')
                .select(`
                    tiny_order_id,
                    product_count,
                    is_kit,
                    uses_free_shipping,
                    is_campaign_order,
                    tiny_orders!inner(
                        id,
                        numero_pedido,
                        cliente_nome,
                        valor_total_pedido,
                        valor,
                        valor_frete
                    )
                `)
                .eq('marketplace', marketplace)
                .eq('marketplace_order_id', payment.marketplaceOrderId)
                .maybeSingle();

            // Calculate expected fees if order is linked
            let valorEsperado: number | undefined;
            let feesBreakdown: any;

            if (linkData && linkData.tiny_orders) {
                try {
                    const feeCalc = await calculateMarketplaceFees({
                        marketplace: marketplace as 'shopee' | 'mercado_livre' | 'magalu',
                        orderDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
                        orderValue: Math.max(0, Number((linkData as any).tiny_orders.valor || (linkData as any).tiny_orders.valor_total_pedido || 0) - Number((linkData as any).tiny_orders.valor_frete || 0)),
                        productCount: (linkData as any).product_count || 1,
                        isKit: (linkData as any).is_kit || false,
                        usesFreeShipping: (linkData as any).uses_free_shipping || false,
                        isCampaignOrder: (linkData as any).is_campaign_order || false,
                    });

                    valorEsperado = feeCalc.netValue;
                    feesBreakdown = feeCalc;
                } catch (error) {
                    console.error('[Preview API] Fee calculation error:', error);
                }
            }

            previewPayments.push({
                ...payment,
                tags: tagResult.tags,
                isAdjustment: tagResult.isAdjustment,
                isRefund: tagResult.isRefund,
                matchStatus: linkData ? 'linked' : 'unmatched',
                tinyOrderId: linkData?.tiny_order_id,
                tinyOrderInfo: linkData && linkData.tiny_orders ? {
                    id: (linkData as any).tiny_orders.id || linkData.tiny_order_id,
                    numero_pedido: (linkData as any).tiny_orders.numero_pedido || '',
                    cliente_nome: (linkData as any).tiny_orders.cliente_nome || '',
                    valor_total_pedido: Number((linkData as any).tiny_orders.valor_total_pedido || (linkData as any).tiny_orders.valor || 0),
                    valor_esperado: valorEsperado,
                    fees_breakdown: feesBreakdown,
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
