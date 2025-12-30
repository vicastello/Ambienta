import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnoseEcommerceIds() {
    console.log('Diagnosing numero_pedido_ecommerce field in tiny_orders...\n');

    // Count orders by ecommerce ID status
    const { count: totalCount } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true });

    const { count: withEcommerce } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .not('numero_pedido_ecommerce', 'is', null);

    const { count: withoutEcommerce } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .is('numero_pedido_ecommerce', null);

    console.log(`Total orders: ${totalCount}`);
    console.log(`With ecommerce ID: ${withEcommerce}`);
    console.log(`WITHOUT ecommerce ID: ${withoutEcommerce}`);

    // Check Shopee orders specifically
    const { count: shopeeTotal } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .ilike('canal', '%shopee%');

    const { count: shopeeWithout } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .ilike('canal', '%shopee%')
        .is('numero_pedido_ecommerce', null);

    console.log(`\nShopee orders: ${shopeeTotal}`);
    console.log(`Shopee WITHOUT ecommerce ID: ${shopeeWithout}`);

    // Check by month for January 2025
    const { count: janWithout } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .gte('data_criacao', '2025-01-01')
        .lt('data_criacao', '2025-02-01')
        .is('numero_pedido_ecommerce', null);

    console.log(`\nJanuary 2025 orders WITHOUT ecommerce ID: ${janWithout}`);

    // Show sample of orders missing ecommerce ID
    const { data: samples } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido, canal, data_criacao')
        .is('numero_pedido_ecommerce', null)
        .ilike('canal', '%shopee%')
        .limit(5);

    console.log('\nSample Shopee orders missing ecommerce ID:');
    samples?.forEach(s => {
        console.log(`  - #${s.numero_pedido} (tiny_id: ${s.tiny_id}) - ${s.data_criacao}`);
    });
}

diagnoseEcommerceIds().catch(console.error);
