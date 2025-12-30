import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getShopeeEscrowDetailsForOrders } from '@/lib/shopeeClient';

/**
 * Popula os dados de voucher/escrow para pedidos Shopee existentes
 * POST /api/marketplaces/shopee/sync-escrow
 * 
 * Body opcional: { orderSnList: string[], periodDays: number }
 */
export async function POST(req: Request) {
    const startTime = Date.now();

    try {
        // Parse body
        let orderSnList: string[] | undefined;
        let periodDays = 30; // Default: últimos 30 dias
        let concurrency: number | undefined;
        let delayMs: number | undefined;

        try {
            const body = await req.json();
            orderSnList = body.orderSnList;
            if (body.periodDays && typeof body.periodDays === 'number') {
                periodDays = Math.min(body.periodDays, 180);
            }
            if (typeof body.concurrency === 'number') {
                concurrency = body.concurrency;
            }
            if (typeof body.delayMs === 'number') {
                delayMs = body.delayMs;
            }
        } catch {
            // Body vazio ou inválido, usar defaults
        }

        // Se não foi passada uma lista, buscar pedidos do período
        if (!orderSnList || orderSnList.length === 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - periodDays);

            const { data: orders, error } = await supabaseAdmin
                .from('shopee_orders')
                .select('order_sn')
                .gte('create_time', cutoffDate.toISOString())
                .is('escrow_fetched_at', null) // Apenas os que ainda não foram buscados
                .limit(100); // Processar em batches para evitar timeout

            if (error) {
                throw new Error(`Erro ao buscar pedidos: ${error.message}`);
            }

            orderSnList = orders?.map((o) => o.order_sn) || [];
        }

        console.log(`[Shopee Escrow Sync] Buscando escrow para ${orderSnList.length} pedidos`);

        if (orderSnList.length === 0) {
            return NextResponse.json({
                ok: true,
                data: {
                    message: 'Nenhum pedido pendente para buscar escrow',
                    ordersProcessed: 0,
                    durationMs: Date.now() - startTime,
                },
            });
        }

        const rawPayloadByOrderSn = new Map<string, any>();
        if (orderSnList.length > 0) {
            const { data: rawRows } = await supabaseAdmin
                .from('shopee_orders')
                .select('order_sn, raw_payload')
                .in('order_sn', orderSnList);

            rawRows?.forEach((row: any) => {
                rawPayloadByOrderSn.set(row.order_sn, row.raw_payload);
            });
        }

        const mergeEscrowDetail = (rawPayload: any, escrow: any) => {
            const base = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
                ? rawPayload
                : {};
            return {
                ...base,
                escrow_detail: escrow,
            };
        };

        // Buscar dados de escrow da API Shopee
        const escrowMap = await getShopeeEscrowDetailsForOrders(orderSnList, {
            concurrency,
            delayMs,
        });

        console.log(`[Shopee Escrow Sync] Recebido escrow para ${escrowMap.size} pedidos`);

        // Atualizar pedidos no banco
        let updated = 0;
        let withSellerVoucher = 0;
        let withAffiliateCommission = 0;
        let withSellerDiscount = 0;

        for (const [orderSn, escrow] of escrowMap) {
            const nextRawPayload = mergeEscrowDetail(rawPayloadByOrderSn.get(orderSn), escrow);
            const { error } = await (supabaseAdmin as any)
                .from('shopee_orders')
                .update({
                    voucher_from_seller: escrow.voucher_from_seller,
                    voucher_from_shopee: escrow.voucher_from_shopee,
                    seller_voucher_code: escrow.seller_voucher_code,
                    escrow_amount: escrow.escrow_amount,
                    ams_commission_fee: escrow.ams_commission_fee, // Affiliate commission
                    order_selling_price: escrow.order_selling_price, // Selling price after bulk discounts
                    // order_discounted_price: escrow.order_discounted_price, // TODO: Uncomment after running migration
                    seller_discount: escrow.seller_discount, // Seller-provided discount (e.g., 2%)
                    raw_payload: nextRawPayload,
                    escrow_fetched_at: new Date().toISOString(),
                })
                .eq('order_sn', orderSn);

            if (!error) {
                updated++;
                if (escrow.voucher_from_seller > 0) {
                    withSellerVoucher++;
                    console.log(`[Shopee Escrow Sync] ${orderSn}: voucher_from_seller = R$ ${escrow.voucher_from_seller}`);
                }
                if (escrow.ams_commission_fee > 0) {
                    withAffiliateCommission++;
                    console.log(`[Shopee Escrow Sync] ${orderSn}: ams_commission_fee = R$ ${escrow.ams_commission_fee}`);
                }
                if (escrow.seller_discount > 0) {
                    withSellerDiscount++;
                    console.log(`[Shopee Escrow Sync] ${orderSn}: seller_discount = R$ ${escrow.seller_discount}`);
                }
            } else {
                console.error(`[Shopee Escrow Sync] Erro ao atualizar ${orderSn}:`, error.message);
            }
        }

        console.log(`[Shopee Escrow Sync] Concluído: ${updated} atualizados, ${withSellerVoucher} com cupom do vendedor, ${withAffiliateCommission} com comissão de afiliado, ${withSellerDiscount} com desconto do vendedor`);

        return NextResponse.json({
            ok: true,
            data: {
                ordersRequested: orderSnList.length,
                escrowFetched: escrowMap.size,
                ordersUpdated: updated,
                ordersWithSellerVoucher: withSellerVoucher,
                concurrency: concurrency ?? null,
                delayMs: delayMs ?? null,
                durationMs: Date.now() - startTime,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error('[Shopee Escrow Sync] Erro:', message);

        return NextResponse.json(
            { ok: false, error: { message } },
            { status: 500 }
        );
    }
}

/**
 * GET - Status dos dados de escrow
 */
export async function GET() {
    try {
        // Contar pedidos com/sem dados de escrow
        const { count: totalOrders } = await supabaseAdmin
            .from('shopee_orders')
            .select('*', { count: 'exact', head: true });

        const { count: withEscrow } = await supabaseAdmin
            .from('shopee_orders')
            .select('*', { count: 'exact', head: true })
            .not('escrow_fetched_at', 'is', null);

        const { count: withSellerVoucher } = await (supabaseAdmin as any)
            .from('shopee_orders')
            .select('*', { count: 'exact', head: true })
            .gt('voucher_from_seller', 0);

        return NextResponse.json({
            ok: true,
            data: {
                totalOrders: totalOrders || 0,
                ordersWithEscrowData: withEscrow || 0,
                ordersPendingEscrow: (totalOrders || 0) - (withEscrow || 0),
                ordersWithSellerVoucher: withSellerVoucher || 0,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return NextResponse.json({ ok: false, error: { message } }, { status: 500 });
    }
}
