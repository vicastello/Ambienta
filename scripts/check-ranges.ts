import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRanges() {
    console.log('Checking pedido number ranges still missing ecommerce ID...\n');

    const { data: orders } = await supabase
        .from('tiny_orders')
        .select('numero_pedido, data_criacao, tiny_id')
        .is('numero_pedido_ecommerce', null)
        .order('numero_pedido', { ascending: true })
        .limit(50);

    console.log('Sample orders missing ecommerce ID:');
    orders?.forEach(o => {
        console.log(`  Pedido #${o.numero_pedido} (tiny_id: ${o.tiny_id}) - ${o.data_criacao}`);
    });

    // Get min/max numero_pedido
    const { data: minMax } = await supabase
        .from('tiny_orders')
        .select('numero_pedido')
        .is('numero_pedido_ecommerce', null);

    if (minMax && minMax.length > 0) {
        const nums = minMax.map(o => o.numero_pedido).filter(n => n);
        console.log(`\nMin pedido: ${Math.min(...nums)}`);
        console.log(`Max pedido: ${Math.max(...nums)}`);
    }
}

checkRanges().catch(console.error);
