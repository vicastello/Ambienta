import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Manual link endpoint
 * Links a payment to a Tiny order manually
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, marketplaceOrderId, marketplace, tinyOrderId } = body;

        if (!marketplaceOrderId || !marketplace || !tinyOrderId) {
            return NextResponse.json(
                { error: 'Parâmetros obrigatórios ausentes' },
                { status: 400 }
            );
        }

        console.log('[ManualLink] Linking:', { marketplaceOrderId, marketplace, tinyOrderId });

        // 1. Create or update marketplace_order_links
        const { error: linkError } = await supabaseAdmin
            .from('marketplace_order_links')
            .upsert({
                marketplace,
                marketplace_order_id: marketplaceOrderId,
                tiny_order_id: tinyOrderId,
                created_at: new Date().toISOString(),
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
