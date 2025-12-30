import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMarchDetails() {
    console.log('Analyzing remaining 130 missing orders from March 2025...\n');

    // Get all missing orders from March
    const { data: orders } = await supabase
        .from('tiny_orders')
        .select('numero_pedido, data_criacao, tiny_id')
        .is('numero_pedido_ecommerce', null)
        .gte('data_criacao', '2025-03-01')
        .lt('data_criacao', '2025-04-01')
        .order('numero_pedido', { ascending: true });

    if (!orders || orders.length === 0) {
        console.log('No missing orders in March!');
        return;
    }

    console.log(`Total missing in March: ${orders.length}`);

    // Get min/max
    const nums = orders.map(o => o.numero_pedido).filter(n => n);
    const min = Math.min(...nums);
    const max = Math.max(...nums);

    console.log(`Range: #${min} to #${max}`);

    // Show distribution
    console.log('\nDistribution by range (blocks of 100):');
    const blocks: Record<string, number> = {};
    orders.forEach(o => {
        const block = Math.floor(o.numero_pedido / 100) * 100;
        const key = `${block}-${block + 99}`;
        blocks[key] = (blocks[key] || 0) + 1;
    });

    Object.entries(blocks)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .forEach(([range, count]) => {
            console.log(`  ${range}: ${count}`);
        });

    // Sample
    console.log('\nSample orders:');
    orders.slice(0, 5).forEach(o => {
        console.log(`  Pedido #${o.numero_pedido} (${o.data_criacao})`);
    });
}

checkMarchDetails().catch(console.error);
