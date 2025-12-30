import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fillFromLinks() {
    console.log('Using marketplace_order_links to fill missing ecommerce IDs...\n');

    // The marketplace_order_links table has marketplace_order_id and is linked to tiny_orders via tiny_order_id
    // We can use this to backfill the numero_pedido_ecommerce field

    // First, let's see the structure
    const { data: sampleLinks } = await supabase
        .from('marketplace_order_links')
        .select('tiny_order_id, marketplace_order_id')
        .limit(5);

    console.log('Sample links:', sampleLinks);

    // Now update tiny_orders where numero_pedido_ecommerce is null
    // by joining with marketplace_order_links
    const { data: ordersToFix } = await supabase
        .from('tiny_orders')
        .select(`
            id,
            tiny_id,
            numero_pedido,
            numero_pedido_ecommerce,
            marketplace_order_links!inner (
                marketplace_order_id
            )
        `)
        .is('numero_pedido_ecommerce', null)
        .limit(500);

    console.log(`\nFound ${ordersToFix?.length || 0} orders to fix via links.`);

    let updated = 0;
    for (const order of (ordersToFix || [])) {
        const link = Array.isArray(order.marketplace_order_links)
            ? order.marketplace_order_links[0]
            : order.marketplace_order_links;

        if (link?.marketplace_order_id) {
            const { error } = await supabase
                .from('tiny_orders')
                .update({ numero_pedido_ecommerce: link.marketplace_order_id })
                .eq('id', order.id);

            if (!error) {
                updated++;
                if (updated <= 10) {
                    console.log(`✅ #${order.numero_pedido} -> ${link.marketplace_order_id}`);
                }
            }
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`\nRun again to process more batches.`);
}

fillFromLinks().catch(console.error);
