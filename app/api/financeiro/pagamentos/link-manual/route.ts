import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Manual link endpoint
 * Links a payment to a Tiny order manually
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, marketplaceOrderId, marketplace, tinyOrderId, orderDetails } = body;

        if (!marketplaceOrderId || !marketplace || !tinyOrderId) {
            return NextResponse.json(
                { error: 'Parâmetros obrigatórios ausentes' },
                { status: 400 }
            );
        }

        console.log('[ManualLink] Linking:', { marketplaceOrderId, marketplace, tinyOrderId });

        // 0. Check if order exists in tiny_orders, if not fetch and save it
        const { data: existingOrder } = await supabaseAdmin
            .from('tiny_orders')
            .select('id')
            .eq('tiny_id', tinyOrderId)
            .maybeSingle();

        if (!existingOrder) {
            console.log('[ManualLink] Order not in DB, fetching from Tiny API...');

            try {
                // Fetch order details from Tiny API v3
                const { getAccessTokenFromDbOrRefresh } = await import('@/lib/tinyAuth');
                const { obterPedidoDetalhado } = await import('@/lib/tinyApi');

                const accessToken = await getAccessTokenFromDbOrRefresh();
                const pedido = await obterPedidoDetalhado(accessToken, tinyOrderId, 'manual-link');

                console.log('[ManualLink] Fetched order from Tiny:', { id: pedido.id, numeroPedido: pedido.numeroPedido });

                // Insert minimal order record (tiny_id is the Tiny order ID, id is auto-generated)
                const { data: insertedOrder, error: insertError } = await supabaseAdmin
                    .from('tiny_orders')
                    .insert({
                        tiny_id: pedido.id,
                        numero_pedido: pedido.numeroPedido || 0,
                        situacao: pedido.situacao || 0,
                        data_criacao: pedido.dataCriacao ? pedido.dataCriacao.split('T')[0] : new Date().toISOString().split('T')[0],
                        valor_frete: typeof pedido.valorFrete === 'string' ? parseFloat(pedido.valorFrete) : (pedido.valorFrete || null),
                        valor: typeof pedido.valorTotalPedido === 'string' ? parseFloat(pedido.valorTotalPedido) : (pedido.valorTotalPedido || null),
                        canal: marketplace,
                    })
                    .select('id')
                    .single();

                if (insertError) {
                    console.error('[ManualLink] Error saving order:', insertError);
                    return NextResponse.json(
                        { error: 'Erro ao salvar pedido do Tiny no banco: ' + insertError.message },
                        { status: 500 }
                    );
                }

                console.log('[ManualLink] Order saved to DB with internal ID:', insertedOrder?.id);
            } catch (fetchError: any) {
                console.error('[ManualLink] Error fetching order from Tiny:', fetchError);
                return NextResponse.json(
                    { error: 'Erro ao buscar detalhes do pedido no Tiny: ' + (fetchError?.message || 'Unknown error') },
                    { status: 500 }
                );
            }
        }

        // Get the internal DB ID from tiny_id (the order may have existed before or was just inserted)
        const { data: orderRow, error: lookupError } = await supabaseAdmin
            .from('tiny_orders')
            .select('id')
            .eq('tiny_id', tinyOrderId)
            .single();

        if (lookupError || !orderRow) {
            console.error('[ManualLink] Could not find order in DB after insert:', lookupError);
            return NextResponse.json(
                { error: 'Pedido não encontrado no banco de dados após inserção' },
                { status: 500 }
            );
        }

        const internalOrderId = orderRow.id;
        console.log('[ManualLink] Using internal order ID for link:', internalOrderId);

        // 1.5. Sync order items (products) from Tiny API
        try {
            const { getAccessTokenFromDbOrRefresh } = await import('@/lib/tinyAuth');
            const { salvarItensPedido } = await import('@/lib/pedidoItensHelper');

            const accessToken = await getAccessTokenFromDbOrRefresh();
            console.log('[ManualLink] Syncing order items from Tiny...');

            const itemsSaved = await salvarItensPedido(accessToken, tinyOrderId, internalOrderId, {
                context: 'manual-link',
            });

            console.log('[ManualLink] Order items synced:', itemsSaved, 'items saved');
        } catch (itemsError: any) {
            // Log but don't fail the whole operation if items fail to sync
            console.warn('[ManualLink] Warning: Could not sync order items:', itemsError?.message || itemsError);
        }

        // 1. Create or update marketplace_order_links
        const { error: linkError } = await supabaseAdmin
            .from('marketplace_order_links')
            .upsert({
                marketplace,
                marketplace_order_id: marketplaceOrderId,
                tiny_order_id: internalOrderId,
            }, {
                onConflict: 'marketplace,marketplace_order_id',
            });

        if (linkError) {
            console.error('[ManualLink] Error creating link:', linkError);
            return NextResponse.json(
                { error: 'Erro ao criar vínculo: ' + linkError.message },
                { status: 500 }
            );
        }

        // 2. Update payment if it exists in marketplace_payments
        const { error: paymentUpdateError } = await supabaseAdmin
            .from('marketplace_payments')
            .update({
                tiny_order_id: tinyOrderId,
                matched_at: new Date().toISOString(),
                match_confidence: 'manual',
            })
            .eq('marketplace', marketplace)
            .eq('marketplace_order_id', marketplaceOrderId);

        if (paymentUpdateError) {
            console.warn('[ManualLink] Payment update warning:', paymentUpdateError);
        }

        // 3. Update session if provided
        if (sessionId) {
            // Fetch current session data
            const { data: session } = await supabaseAdmin
                .from('payment_import_sessions')
                .select('parsed_data')
                .eq('id', sessionId)
                .single();

            if (session?.parsed_data) {
                // Update the specific payment in parsed_data
                const updatedData = (session.parsed_data as any[]).map((p: any) => {
                    if (p.marketplaceOrderId === marketplaceOrderId) {
                        return {
                            ...p,
                            matchStatus: 'linked',
                            tinyOrderId,
                        };
                    }
                    return p;
                });

                await supabaseAdmin
                    .from('payment_import_sessions')
                    .update({ parsed_data: updatedData })
                    .eq('id', sessionId);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Vínculo criado com sucesso',
        });

    } catch (error) {
        console.error('[ManualLink] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
