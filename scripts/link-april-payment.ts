import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function linkPayment() {
    const orderId = '250422V25FEPW7';
    const tinyId = 918486339; // From sync result

    console.log(`Linking payment ${orderId} to tiny_id ${tinyId}...`);

    const { data, error } = await supabase
        .from('marketplace_payments')
        .update({
            tiny_order_id: tinyId,
            matched_at: new Date().toISOString(),
            match_confidence: 'exact'
        })
        .eq('marketplace_order_id', orderId)
        .select();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('✅ Linked successfully!');
        console.log('Payment:', data);
    }

    // Also mark the tiny_order as paid
    const { error: updateError } = await supabase
        .from('tiny_orders')
        .update({
            payment_received: true,
            payment_received_at: new Date().toISOString()
        })
        .eq('tiny_id', tinyId);

    if (updateError) {
        console.error('Error updating tiny_order:', updateError);
    } else {
        console.log('✅ Tiny order marked as paid!');
    }
}

linkPayment().catch(console.error);
