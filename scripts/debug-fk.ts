import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugFK() {
    console.log('Debugging FK constraint...');

    // Check tiny_orders structure
    const { data: orders } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido_ecommerce')
        .eq('numero_pedido_ecommerce', '250405E509KAT0')
        .limit(1);

    console.log('Order by ecommerce number:', orders);

    // Check if there's an order with tiny_id = 448483
    const { data: byTinyId } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id')
        .eq('tiny_id', 448483)
        .limit(1);

    console.log('Order by tiny_id=448483:', byTinyId);

    // Check if there's an order with id = 448483
    const { data: byId } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id')
        .eq('id', 448483)
        .limit(1);

    console.log('Order by id=448483:', byId);

    // Show a sample of IDs to understand the range
    const { data: sample } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id')
        .order('id', { ascending: false })
        .limit(3);

    console.log('Sample of recent orders (id, tiny_id):', sample);
}

debugFK();
