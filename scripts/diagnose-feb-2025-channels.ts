/**
 * Additional diagnostic for Feb 2025 orders
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    // Check distinct canais for Feb 2025
    console.log('📋 Canais distintos em tiny_orders (Fev 2025):');
    const { data: orders } = await supabase
        .from('tiny_orders')
        .select('canal')
        .gte('data_criacao', '2025-02-01')
        .lt('data_criacao', '2025-03-01')
        .limit(5000);

    if (orders) {
        const canais = [...new Set(orders.map(o => o.canal))].sort();
        console.log(canais);

        // Count per canal
        const counts: Record<string, number> = {};
        orders.forEach(o => {
            counts[o.canal] = (counts[o.canal] || 0) + 1;
        });
        console.log('\nContagem por canal:');
        Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([canal, count]) => {
            console.log(`  ${canal}: ${count}`);
        });
    }

    // Check earliest shopee order
    console.log('\n📅 Primeiro e último pedido Shopee na tabela shopee_orders:');
    const { data: first } = await supabase
        .from('shopee_orders')
        .select('order_sn, create_time')
        .order('create_time', { ascending: true })
        .limit(1)
        .single();

    const { data: last } = await supabase
        .from('shopee_orders')
        .select('order_sn, create_time')
        .order('create_time', { ascending: false })
        .limit(1)
        .single();

    console.log(`  Primeiro: ${first?.create_time} (${first?.order_sn})`);
    console.log(`  Último: ${last?.create_time} (${last?.order_sn})`);

    // Check if there are ANY tiny orders with numero_pedido_ecommerce that might match
    console.log('\n🔍 Tiny orders Fev 2025 com numero_pedido_ecommerce (não nulo):');
    const { data: withEcommerce } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido, canal, numero_pedido_ecommerce')
        .gte('data_criacao', '2025-02-01')
        .lt('data_criacao', '2025-03-01')
        .not('numero_pedido_ecommerce', 'is', null)
        .limit(10);

    console.log(`  Total com ecommerce ID: ${withEcommerce?.length || 0}`);
    if (withEcommerce) {
        withEcommerce.slice(0, 5).forEach(o => {
            console.log(`    #${o.numero_pedido} (${o.canal}): ${o.numero_pedido_ecommerce}`);
        });
    }

    // Check total tiny orders for Feb 2025
    console.log('\n📊 Total de tiny_orders Fev 2025:');
    const { count } = await supabase
        .from('tiny_orders')
        .select('id', { count: 'exact' })
        .gte('data_criacao', '2025-02-01')
        .lt('data_criacao', '2025-03-01');

    console.log(`  Total: ${count || 0}`);

    // Check if any orders have "Shopee" anywhere in canal
    console.log('\n🔍 Buscando "Shopee" em qualquer variação no canal:');
    const { data: shopeeVariants } = await supabase
        .from('tiny_orders')
        .select('canal')
        .gte('data_criacao', '2025-02-01')
        .lt('data_criacao', '2025-03-01')
        .or('canal.ilike.%shopee%,canal.ilike.%shop%');

    if (shopeeVariants && shopeeVariants.length > 0) {
        const variants = [...new Set(shopeeVariants.map(o => o.canal))];
        console.log(`  Encontrados canais: ${variants.join(', ')}`);
    } else {
        console.log('  Nenhum canal com "shopee" encontrado');
    }
}

check().catch(console.error);
