// Script to check order details including voucher fields
const { createClient } = require('@supabase/supabase-js');

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.vercel');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line: string) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        envVars[match[1].trim()] = value;
    }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const orderSn = '250119TRFA9K1J';

    console.log('='.repeat(60));
    console.log(`Verificando dados de escrow para: ${orderSn}`);
    console.log('='.repeat(60));

    // Buscar pedido com campos de voucher
    const { data: order, error } = await supabase
        .from('shopee_orders')
        .select('*')
        .eq('order_sn', orderSn)
        .single();

    if (error) {
        console.log('❌ Erro:', error.message);
        return;
    }

    console.log('\n📦 DADOS DO PEDIDO:');
    console.log('  Order SN:', order.order_sn);
    console.log('  Total Amount:', order.total_amount);
    console.log('  Status:', order.order_status);

    console.log('\n💰 DADOS DE ESCROW:');
    console.log('  Voucher do Vendedor:', order.voucher_from_seller ?? 'não disponível');
    console.log('  Voucher da Shopee:', order.voucher_from_shopee ?? 'não disponível');
    console.log('  AMS Commission Fee:', order.ams_commission_fee ?? 'não disponível');
    console.log('  Commission Fee:', order.commission_fee ?? 'não disponível');
    console.log('  Service Fee:', order.service_fee ?? 'não disponível');
    console.log('  Seller Voucher Codes:', order.seller_voucher_code ?? []);
    console.log('  Escrow Amount:', order.escrow_amount ?? 'não disponível');
    console.log('  Escrow Fetched At:', order.escrow_fetched_at ?? 'não buscado ainda');

    // Buscar itens
    const { data: items } = await supabase
        .from('shopee_order_items')
        .select('*')
        .eq('order_sn', orderSn);

    if (items && items.length > 0) {
        console.log('\n📋 ITENS DO PEDIDO:');
        items.forEach((item: any, i: number) => {
            console.log(`  Item ${i + 1}: ${item.item_name}`);
            console.log(`    Preço Original: R$ ${item.original_price}`);
            console.log(`    Preço com Desconto: R$ ${item.discounted_price}`);
            console.log(`    Quantidade: ${item.quantity}`);
        });
    }

    // Calcular diferença
    if (order.voucher_from_seller !== null) {
        console.log('\n🔍 ANÁLISE:');
        const itemValue = items?.reduce((sum: number, item: any) => sum + (item.discounted_price * item.quantity), 0) || 0;
        console.log(`  Valor dos Itens (discounted_price): R$ ${itemValue.toFixed(2)}`);
        console.log(`  Valor que você perde (voucher_from_seller): R$ ${order.voucher_from_seller ?? 0}`);
        console.log(`  Valor base para taxas: R$ ${(itemValue - (order.voucher_from_seller ?? 0)).toFixed(2)}`);
    }

    // Check Link
    const { data: link } = await supabase
        .from('marketplace_order_links')
        .select('*')
        .eq('marketplace_order_id', orderSn)
        .eq('marketplace', 'shopee')
        .maybeSingle();

    console.log('\n🔗 LINK STATUS:');
    if (link) {
        console.log('  ✅ Link encontrado:', link);
    } else {
        console.log('  ❌ Link NÃO encontrado na tabela marketplace_order_links');
    }

    console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
