import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const orderId = params.id;
        const body = await request.json();
        const { fee_overrides, valor_esperado, diferenca } = body;

        // Update tiny_orders with manual overrides and recalculated values
        const { error } = await supabase
            .from('tiny_orders')
            .update({
                fee_overrides,
                valor_esperado_liquido: valor_esperado,
                diferenca_valor: diferenca,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[FeesOverrideAPI] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
