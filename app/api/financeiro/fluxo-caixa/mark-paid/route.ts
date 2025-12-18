// API route for marking orders as paid (for bank reconciliation)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { orderIds } = body;

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return NextResponse.json(
                { error: 'orderIds é obrigatório e deve ser um array não vazio' },
                { status: 400 }
            );
        }

        // Validate all IDs are numbers
        const validIds = orderIds.filter((id: any) => typeof id === 'number' && id > 0);
        if (validIds.length === 0) {
            return NextResponse.json(
                { error: 'Nenhum ID válido fornecido' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();

        // Update tiny_orders to mark as paid
        const { data, error } = await supabaseAdmin
            .from('tiny_orders')
            .update({
                payment_received: true,
                payment_received_at: now,
            })
            .in('id', validIds)
            .select('id');

        if (error) {
            console.error('[mark-paid] Supabase error:', error);
            return NextResponse.json(
                { error: 'Erro ao atualizar pedidos', details: error.message },
                { status: 500 }
            );
        }

        // Also update cash_flow_entries if they exist
        const tinyIds = await supabaseAdmin
            .from('tiny_orders')
            .select('tiny_id')
            .in('id', validIds);

        if (tinyIds.data && tinyIds.data.length > 0) {
            const sourceIds = tinyIds.data
                .map(r => r.tiny_id?.toString())
                .filter(Boolean);

            if (sourceIds.length > 0) {
                await (supabaseAdmin as any)
                    .from('cash_flow_entries')
                    .update({
                        status: 'confirmed',
                        paid_date: now.split('T')[0],
                        updated_at: now,
                    })
                    .eq('source', 'tiny_order')
                    .in('source_id', sourceIds);
            }
        }

        return NextResponse.json({
            success: true,
            updatedCount: data?.length || 0,
            orderIds: validIds,
        });
    } catch (error) {
        console.error('[mark-paid] Error:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
