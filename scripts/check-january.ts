import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkJanuaryOrders() {
    console.log('Checking January 2025 orders in tiny_orders...\n');

    // Get all January 2025 orders from tiny_orders
    const { data: tinyOrders, count } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido, numero_pedido_ecommerce, data_criacao, canal, situacao, payment_received', { count: 'exact' })
        .gte('data_criacao', '2025-01-01')
        .lt('data_criacao', '2025-02-01')
        .neq('situacao', 2); // Exclude cancelled

    console.log(`Total January orders in tiny_orders: ${count}`);

    // Count by canal
    const canalCounts: Record<string, number> = {};
    tinyOrders?.forEach(o => {
        const canal = o.canal || 'Unknown';
        canalCounts[canal] = (canalCounts[canal] || 0) + 1;
    });

    console.log('\nBy channel:');
    Object.entries(canalCounts).sort((a, b) => b[1] - a[1]).forEach(([canal, count]) => {
        console.log(`  ${canal}: ${count}`);
    });

    // Count by payment status
    const paid = tinyOrders?.filter(o => o.payment_received === true).length || 0;
    const unpaid = tinyOrders?.filter(o => o.payment_received !== true).length || 0;

    console.log('\nPayment status:');
    console.log(`  Paid: ${paid}`);
    console.log(`  Unpaid/Pending: ${unpaid}`);

    // Check one specific Shopee order to verify it shows in search
    const shopeeOrders = tinyOrders?.filter(o => o.canal?.toLowerCase().includes('shopee'));
    console.log(`\nShopee orders in January: ${shopeeOrders?.length}`);

    if (shopeeOrders && shopeeOrders.length > 0) {
        console.log('Sample Shopee order:');
        const sample = shopeeOrders[0];
        console.log(`  numero_pedido_ecommerce: ${sample.numero_pedido_ecommerce}`);
        console.log(`  data_criacao: ${sample.data_criacao}`);
        console.log(`  payment_received: ${sample.payment_received}`);
    }
}

checkJanuaryOrders().catch(console.error);
