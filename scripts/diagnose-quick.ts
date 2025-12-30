/**
 * Quick diagnostic - simple queries only
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
    console.log('📊 Quick Diagnose - Channels Feb 2025\n');

    // 1. Total orders in Feb 2025
    const { count: total } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .gte('data_criacao', '2025-02-01')
        .lt('data_criacao', '2025-03-01');
    console.log(`Total tiny_orders Fev/2025: ${total}`);

    // 2. Sample 5 orders
    const { data: sample } = await supabase
        .from('tiny_orders')
        .select('numero_pedido, canal, numero_pedido_ecommerce')
        .gte('data_criacao', '2025-02-01')
        .lt('data_criacao', '2025-03-01')
        .limit(5);

    console.log('\nAmostra de 5 pedidos:');
    sample?.forEach(o => {
        console.log(`  #${o.numero_pedido}: canal="${o.canal}" ecommerce="${o.numero_pedido_ecommerce || 'null'}"`);
    });

    // 3. First/Last shopee_orders dates
    const { data: firstShopee } = await supabase
        .from('shopee_orders')
        .select('order_sn, create_time')
        .order('create_time', { ascending: true })
        .limit(1);

    const { data: lastShopee } = await supabase
        .from('shopee_orders')
        .select('order_sn, create_time')
        .order('create_time', { ascending: false })
        .limit(1);

    console.log(`\nRange de shopee_orders:`);
    console.log(`  Primeiro: ${firstShopee?.[0]?.create_time}`);
    console.log(`  Último: ${lastShopee?.[0]?.create_time}`);
}

check().catch(console.error);
