import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkOrder() {
    const orderId = '250422V25FEPW7';

    console.log(`Checking order ${orderId}...`);

    // Check marketplace_payments
    const { data: payments } = await supabase
        .from('marketplace_payments')
        .select('*')
        .ilike('marketplace_order_id', `%${orderId}%`);

    console.log(`\nIn marketplace_payments: ${payments?.length || 0} entries`);
    payments?.forEach(p => {
        console.log(`  - ID: ${p.marketplace_order_id}`);
        console.log(`    Net: ${p.net_amount}`);
        console.log(`    Date: ${p.payment_date}`);
        console.log(`    Linked tiny_order_id: ${p.tiny_order_id}`);
    });

    // Check tiny_orders
    const { data: orders } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido_ecommerce, data_criacao, payment_received')
        .ilike('numero_pedido_ecommerce', `%${orderId}%`);

    console.log(`\nIn tiny_orders: ${orders?.length || 0} entries`);
    orders?.forEach(o => {
        console.log(`  - ID: ${o.id}, tiny_id: ${o.tiny_id}`);
        console.log(`    Ecommerce #: ${o.numero_pedido_ecommerce}`);
        console.log(`    Date: ${o.data_criacao}`);
        console.log(`    Payment received: ${o.payment_received}`);
    });

    // If not in both, check marketplace_order_links
    const { data: links } = await supabase
        .from('marketplace_order_links')
        .select('*')
        .ilike('marketplace_order_id', `%${orderId}%`);

    console.log(`\nIn marketplace_order_links: ${links?.length || 0} entries`);
}

checkOrder().catch(console.error);
