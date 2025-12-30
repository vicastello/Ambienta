import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixOrder() {
    const orderId = '250422V25FEPW7';
    const tinyId = 918486339;

    console.log(`Fixing numero_pedido_ecommerce for order ${orderId}...`);

    const { data, error } = await supabase
        .from('tiny_orders')
        .update({
            numero_pedido_ecommerce: orderId
        })
        .eq('tiny_id', tinyId)
        .select('id, tiny_id, numero_pedido_ecommerce');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('✅ Fixed!', data);
    }
}

fixOrder();
