import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMissingRange() {
    console.log('Checking lowest missing order numbers...\n');

    // Get first 20 missing orders
    const { data: orders } = await supabase
        .from('tiny_orders')
        .select('numero_pedido, data_criacao, tiny_id')
        .is('numero_pedido_ecommerce', null)
        .order('numero_pedido', { ascending: true })
        .limit(20);

    console.log('First 20 missing orders:');
    orders?.forEach(o => {
        console.log(`  #${o.numero_pedido} (${o.data_criacao})`);
    });
}

checkMissingRange().catch(console.error);
