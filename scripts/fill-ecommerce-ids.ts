import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fillEcommerceIds() {
    // Dynamic import after env is loaded
    const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');

    console.log('Fetching Shopee orders missing ecommerce ID...\n');

    // Get orders missing ecommerce ID
    const { data: orders } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido, data_criacao')
        .ilike('canal', '%shopee%')
        .is('numero_pedido_ecommerce', null)
        .order('data_criacao', { ascending: true })
        .limit(100); // Process in batches

    console.log(`Found ${orders?.length || 0} orders to process.\n`);

    if (!orders || orders.length === 0) {
        console.log('No orders to process!');
        return;
    }

    // Get Tiny token
    const token = await getAccessTokenFromDbOrRefresh();
    if (!token) {
        console.error('Failed to get Tiny token!');
        return;
    }

    let updated = 0;
    let failed = 0;

    for (const order of orders) {
        console.log(`[${order.numero_pedido}] tiny_id: ${order.tiny_id}...`);

        try {
            // Fetch order details from Tiny API
            const response = await fetch(`https://api.tiny.com.br/api/v3/pedidos/${order.tiny_id}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                if (response.status === 429) {
                    console.log('       ⚠️ Rate limited. Waiting 5s...');
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }
                console.log(`       ❌ API error: ${response.status}`);
                failed++;
                continue;
            }

            const data = await response.json();
            const pedido = data.pedido || data;

            // Extract ecommerce order ID
            const ecommerceId = pedido.ecommerce?.numeroPedidoEcommerce ||
                pedido.numeroPedidoEcommerce ||
                null;

            if (ecommerceId) {
                // Update the order
                const { error } = await supabase
                    .from('tiny_orders')
                    .update({ numero_pedido_ecommerce: ecommerceId })
                    .eq('id', order.id);

                if (error) {
                    console.log(`       ❌ DB error: ${error.message}`);
                    failed++;
                } else {
                    console.log(`       ✅ Updated: ${ecommerceId}`);
                    updated++;
                }
            } else {
                console.log(`       ⚠️ No ecommerce ID in Tiny`);
                failed++;
            }

            // Rate limit protection
            await new Promise(r => setTimeout(r, 200));

        } catch (e: any) {
            console.log(`       ❌ Error: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Failed/Skipped: ${failed}`);
    console.log(`\nRun again to process more batches.`);
}

fillEcommerceIds().catch(console.error);
