import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Get marketplace payments by Tiny order ID
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get('orderId');

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID obrigatório' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('marketplace_payments')
            .select('*')
            .eq('tiny_order_id', parseInt(orderId))
            .order('payment_date', { ascending: true });

        if (error) {
            console.error('[PaymentsByOrder] Error:', error);
            return NextResponse.json({ error: 'Erro ao buscar pagamentos' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            payments: data || [],
        });
    } catch (error) {
        console.error('[PaymentsByOrder] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
