/**
 * Script to diagnose why Feb 2025 Shopee orders are not linking
 * in the payment import preview.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Sample order IDs from the Excel file (Feb 2025)
const sampleOrderIds = [
    '250223UBNS6YDX',
    '250222U29RJHSY',
    '25022433RKFABD',
    '250216BT1K7E92',
    '25022432UMFY3R',
    '250223UBWH3TJW',
    '250130SSGS0X8G',
    '250128MW1FGRM7',
    '250126FVH7HKJX',
    '250129Q2XQV0N7',
];

async function diagnose() {
    console.log('🔍 DIAGNÓSTICO: Pedidos Shopee Fev/2025\n');
    console.log('='.repeat(60));

    // 1. Check shopee_orders table
    console.log('\n📦 1. Verificando tabela shopee_orders (Fev 2025)...\n');

    const { data: shopeeOrdersCount, error: shopeeCountError } = await supabase
        .from('shopee_orders')
        .select('order_sn', { count: 'exact' })
        .gte('create_time', '2025-02-01')
        .lt('create_time', '2025-03-01');

    if (shopeeCountError) {
        console.error('❌ Erro ao contar shopee_orders:', shopeeCountError);
    } else {
        console.log(`   Total de pedidos Shopee em Fev/2025: ${shopeeOrdersCount?.length || 0}`);
    }

    // 2. Check if sample orders exist in shopee_orders
    console.log('\n📦 2. Verificando IDs do arquivo na tabela shopee_orders...\n');

    for (const orderId of sampleOrderIds.slice(0, 5)) {
        const { data, error } = await supabase
            .from('shopee_orders')
            .select('order_sn, create_time, order_status')
            .eq('order_sn', orderId)
            .maybeSingle();

        if (error) {
            console.log(`   ❌ ${orderId}: Erro - ${error.message}`);
        } else if (data) {
            console.log(`   ✅ ${orderId}: Encontrado (${data.order_status}, ${data.create_time})`);
        } else {
            console.log(`   ❌ ${orderId}: NÃO ENCONTRADO em shopee_orders`);
        }
    }

    // 3. Check marketplace_order_links
    console.log('\n🔗 3. Verificando tabela marketplace_order_links (Shopee)...\n');

    const { data: linksCount } = await supabase
        .from('marketplace_order_links')
        .select('id', { count: 'exact' })
        .eq('marketplace', 'shopee');

    console.log(`   Total de links Shopee: ${linksCount?.length || 0}`);

    // Check links for Feb 2025
    const { data: linksWithDetails } = await supabase
        .from('marketplace_order_links')
        .select(`
            id,
            marketplace_order_id,
            tiny_order_id,
            linked_at,
            tiny_orders!inner(data_criacao)
        `)
        .eq('marketplace', 'shopee')
        .gte('tiny_orders.data_criacao', '2025-02-01')
        .lt('tiny_orders.data_criacao', '2025-03-01');

    console.log(`   Links Shopee para pedidos de Fev/2025: ${linksWithDetails?.length || 0}`);

    // 4. Check if sample IDs exist in links
    console.log('\n🔗 4. Verificando IDs do arquivo em marketplace_order_links...\n');

    for (const orderId of sampleOrderIds.slice(0, 5)) {
        const { data, error } = await supabase
            .from('marketplace_order_links')
            .select('id, tiny_order_id, linked_at')
            .eq('marketplace', 'shopee')
            .eq('marketplace_order_id', orderId)
            .maybeSingle();

        if (error) {
            console.log(`   ❌ ${orderId}: Erro - ${error.message}`);
        } else if (data) {
            console.log(`   ✅ ${orderId}: Vinculado (tiny_order_id=${data.tiny_order_id})`);
        } else {
            console.log(`   ❌ ${orderId}: SEM VÍNCULO em marketplace_order_links`);
        }
    }

    // 5. Check tiny_orders for Shopee Feb 2025
    console.log('\n📋 5. Verificando tiny_orders (Shopee, Fev 2025)...\n');

    const { data: tinyOrders } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido, canal, numero_pedido_ecommerce, data_criacao')
        .gte('data_criacao', '2025-02-01')
        .lt('data_criacao', '2025-03-01')
        .ilike('canal', '%shopee%')
        .limit(10);

    console.log(`   Pedidos Tiny (canal Shopee) em Fev/2025:`);
    if (tinyOrders && tinyOrders.length > 0) {
        for (const order of tinyOrders.slice(0, 5)) {
            console.log(`   - #${order.numero_pedido}: ecommerce_id=${order.numero_pedido_ecommerce || 'NULL'}`);
        }
        console.log(`   ... e mais ${Math.max(0, tinyOrders.length - 5)} pedidos`);
    } else {
        console.log(`   ❌ Nenhum pedido Tiny encontrado para canal Shopee em Fev/2025`);
    }

    // 6. Check sync cursor
    console.log('\n⏰ 6. Verificando cursor de sync Shopee...\n');

    const { data: cursor } = await supabase
        .from('shopee_sync_cursor')
        .select('*')
        .eq('id', 1)
        .single();

    if (cursor) {
        console.log(`   Último sync: ${cursor.last_sync_at || 'nunca'}`);
        console.log(`   Total synced: ${cursor.total_orders_synced}`);
        console.log(`   Status: ${cursor.sync_status}`);
        console.log(`   Last order update: ${cursor.last_order_update_time || 'N/A'}`);
    }

    // 7. Summary and Diagnosis
    console.log('\n' + '='.repeat(60));
    console.log('📊 DIAGNÓSTICO FINAL\n');

    const shopeeExists = (shopeeOrdersCount?.length || 0) > 0;
    const linksExist = (linksWithDetails?.length || 0) > 0;
    const tinyHasShopeeOrders = (tinyOrders?.length || 0) > 0;

    if (!shopeeExists) {
        console.log('❌ PROBLEMA: Não há pedidos Shopee de Fev/2025 na tabela shopee_orders.');
        console.log('   CAUSA: Os pedidos não foram sincronizados da API Shopee.');
        console.log('   SOLUÇÃO: Rodar sync manual dos pedidos de Fev/2025.');
    } else if (!tinyHasShopeeOrders) {
        console.log('❌ PROBLEMA: Não há pedidos Tiny (canal Shopee) de Fev/2025.');
        console.log('   CAUSA: Os pedidos não foram sincronizados do Tiny ou o canal está errado.');
    } else if (!linksExist) {
        console.log('⚠️  PROBLEMA: Pedidos existem mas não estão vinculados.');
        console.log('   CAUSA: O auto-link não rodou ou falhou para esses pedidos.');
        console.log('   SOLUÇÃO: Rodar auto-link manualmente com daysBack maior.');
    } else {
        console.log('✅ Tudo parece estar em ordem. Verifique a lógica de preview.');
    }

    console.log('\n');
}

diagnose().catch(console.error);
