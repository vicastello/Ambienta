import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateMarketplaceFees } from '@/lib/marketplace-fees';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { limit = 100, offset = 0 } = await req.json();

        // 1. Fetch orders with necessary info
        const { data: orders, error: fetchError } = await supabaseAdmin
            .from('tiny_orders')
            .select(`
                id,
                canal,
                valor_total_pedido,
                valor,
                valor_frete,
                data_criacao,
                marketplace_order_links!left (
                    product_count,
                    is_kit,
                    uses_free_shipping,
                    is_campaign_order,
                    calculated_fees
                ),
                marketplace_payments!left (
                    net_amount
                )
            `)
            .order('data_criacao', { ascending: false })
            .range(offset, offset + limit - 1);

        if (fetchError) throw fetchError;

        if (!orders || orders.length === 0) {
            return NextResponse.json({ message: 'No more orders to process', processed: 0 });
        }

        let processed = 0;
        let errors = 0;

        // 2. Process each order
        for (const order of orders) {
            try {
                const canal = order.canal?.toLowerCase() || '';
                let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;

                if (canal.includes('shopee')) marketplace = 'shopee';
                else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
                else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

                if (!marketplace) continue;

                const linkData = order.marketplace_order_links?.[0] as any;
                const orderValue = Math.max(0, Number(order.valor || order.valor_total_pedido || 0) - Number(order.valor_frete || 0));

                if (orderValue <= 0) continue;

                // Calculate fees
                const feeCalc = await calculateMarketplaceFees({
                    marketplace,
                    orderValue,
                    productCount: linkData?.product_count || 1,
                    isKit: linkData?.is_kit || false,
                    usesFreeShipping: linkData?.uses_free_shipping || false,
                    isCampaignOrder: linkData?.is_campaign_order || false,
                    orderDate: new Date(order.data_criacao || new Date()),
                });

                // Calculate difference if payment exists
                const receivedValue = order.marketplace_payments?.net_amount
                    ? Number(order.marketplace_payments.net_amount)
                    : null;

                const difference = receivedValue !== null
                    ? receivedValue - feeCalc.netValue
                    : null;

                // Update order
                const { error: updateError } = await supabaseAdmin
                    .from('tiny_orders')
                    .update({
                        // @ts-ignore - fields exist but not in generated types yet
                        valor_esperado_liquido: feeCalc.netValue,
                        diferenca_valor: difference,
                        fees_breakdown: feeCalc
                    })
                    .eq('id', order.id);

                if (updateError) {
                    console.error(`Error updating order ${order.id}:`, updateError);
                    errors++;
                } else {
                    processed++;
                }

            } catch (err) {
                console.error(`Error processing order ${order.id}:`, err);
                errors++;
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            errors,
            nextOffset: offset + limit,
            hasMore: orders.length === limit
        });

    } catch (error: any) {
        console.error('Backfill error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
