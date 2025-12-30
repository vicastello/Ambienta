import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function linkPayment() {
    const orderId = '250405E509KAT0';
    const tinyOrderId = 448483; // From sync result

    console.log('Checking tiny_orders for ID', tinyOrderId);

    // Check if order exists in tiny_orders
    const { data: tinyOrder } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido, cliente_nome, numero_pedido_ecommerce')
        .eq('id', tinyOrderId)
        .single();

    console.log('Tiny Order:', tinyOrder);

    if (tinyOrder) {
        // Update marketplace_payments to link
        const { data, error } = await supabase
            .from('marketplace_payments')
            .update({
                tiny_order_id: tinyOrderId,
                matched_at: new Date().toISOString(),
                match_confidence: 'exact'
            })
            .eq('marketplace_order_id', orderId)
            .select();

        if (error) console.error('Error updating:', error);
        else console.log('Linked successfully:', data);

        // Also update tiny_orders payment status
        await supabase
            .from('tiny_orders')
            .update({
                payment_received: true,
                payment_received_at: new Date().toISOString()
            })
            .eq('id', tinyOrderId);

        console.log('Updated tiny_order payment status');
    } else {
        console.log('Order not found in tiny_orders. Need to check by other field.');

        // Try by tiny_id (external ID from Tiny API)
        const { data: byTinyId } = await supabase
            .from('tiny_orders')
            .select('id, tiny_id, numero_pedido_ecommerce')
            .or(`tiny_id.eq.${tinyOrderId},numero_pedido_ecommerce.eq.${orderId}`)
            .limit(5);

        console.log('Search results:', byTinyId);
    }
}

linkPayment();
