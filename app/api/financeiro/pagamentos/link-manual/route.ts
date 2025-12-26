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

        // 0. Always fetch and upsert order to ensure full data (fixes "incomplete data" issues)
        console.log('[ManualLink] Fetching full order details from Tiny API...');

        let internalOrderId: number;

        try {
            // Fetch order details from Tiny API v3
            const { getAccessTokenFromDbOrRefresh } = await import('@/lib/tinyAuth');
            const { obterPedidoDetalhado } = await import('@/lib/tinyApi');

            const accessToken = await getAccessTokenFromDbOrRefresh();
            const pedido = await obterPedidoDetalhado(accessToken, tinyOrderId, 'manual-link');

            console.log('[ManualLink] Fetched order from Tiny:', { id: pedido.id, numeroPedido: pedido.numeroPedido });

            // Upsert order record with all available details
            const { data: upsertedOrder, error: upsertError } = await supabaseAdmin
                .from('tiny_orders')
                .upsert({
                    tiny_id: pedido.id,
                    numero_pedido: pedido.numeroPedido || 0,
                    situacao: pedido.situacao || 0,
                    data_criacao: pedido.dataCriacao ? pedido.dataCriacao.split('T')[0] : new Date().toISOString().split('T')[0],
                    valor_frete: typeof pedido.valorFrete === 'string' ? parseFloat(pedido.valorFrete) : (pedido.valorFrete || null),
                    valor: typeof pedido.valorTotalPedido === 'string' ? parseFloat(pedido.valorTotalPedido) : (pedido.valorTotalPedido || null),
                    canal: marketplace,
                    // Full data fields
                    cliente_nome: pedido.cliente?.nome || null,
                    cidade: pedido.enderecoEntrega?.cidade || null,
                    uf: pedido.enderecoEntrega?.uf || null,
                    raw: pedido as any, // Save full payload
                    is_enriched: true, // Mark as enriched since we fetched full details
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'tiny_id'
                })
                .select('id')
                .single();

            if (upsertError) {
                console.error('[ManualLink] Error saving order:', upsertError);
                return NextResponse.json(
                    { error: 'Erro ao salvar pedido do Tiny no banco: ' + upsertError.message },
                    { status: 500 }
                );
            }

            if (!upsertedOrder) {
                throw new Error('Falha ao recuperar ID do pedido após salvar');
            }

            internalOrderId = upsertedOrder.id;
            console.log('[ManualLink] Order saved/updated in DB with internal ID:', internalOrderId);

        } catch (fetchError: any) {
            console.error('[ManualLink] Error fetching/saving order from Tiny:', fetchError);
            return NextResponse.json(
                { error: 'Erro ao processar pedido do Tiny: ' + (fetchError?.message || 'Unknown error') },
                { status: 500 }
            );
        }

        // 1.5. Sync order items (products) from Tiny API - REQUIRED before linking
        let itemsSaved: number | null = null;
        try {
            const { getAccessTokenFromDbOrRefresh } = await import('@/lib/tinyAuth');
            const { salvarItensPedido } = await import('@/lib/pedidoItensHelper');

            const accessToken = await getAccessTokenFromDbOrRefresh();
            console.log('[ManualLink] Syncing order items from Tiny...');

            itemsSaved = await salvarItensPedido(accessToken, tinyOrderId, internalOrderId, {
                context: 'manual-link',
            });

            console.log('[ManualLink] Order items synced:', itemsSaved, 'items saved');

            if (itemsSaved === null) {
                return NextResponse.json(
                    { error: 'Erro ao sincronizar itens do pedido. O vínculo não foi criado.' },
                    { status: 500 }
                );
            }
        } catch (itemsError: any) {
            console.error('[ManualLink] Error syncing order items:', itemsError?.message || itemsError);
            return NextResponse.json(
                { error: 'Erro ao sincronizar dados do pedido: ' + (itemsError?.message || 'Erro desconhecido') },
                { status: 500 }
            );
        }

        console.log('[ManualLink] All order data synced successfully. Creating link...');

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
