import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Carregar variáveis de ambiente
const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('🔍 Iniciando verificação de backfill (2025)...\n');

    // 1. Total Tiny Orders
    const { count: totalTiny, error: errTiny } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .gte('data_criacao', '2025-01-01');

    if (errTiny) console.error('Erro Tiny:', errTiny);
    console.log(`📦 Tiny Orders (2025): ${totalTiny}`);

    // 2. Por Canal
    const { data: byChannel, error: errChannel } = await supabase
        .rpc('count_orders_by_channel_2025');
    // Se não tiver RPC, fazer query normal agrupada é chato via client, 
    // mas posso contar filters.
    // Vou fazer contagens individuais para os principais.

    const channels = ['Shopee', 'Magalu', 'Mercado Livre', 'Olist'];
    for (const canal of channels) {
        const { count } = await supabase
            .from('tiny_orders')
            .select('*', { count: 'exact', head: true })
            .gte('data_criacao', '2025-01-01')
            .ilike('canal', `%${canal}%`);
        console.log(`   🔸 ${canal}: ${count}`);
    }

    // 3. Marketplaces
    const { count: totalShopee } = await supabase.from('shopee_orders').select('*', { count: 'exact', head: true }).gte('create_time', '2025-01-01');
    const { count: totalMagalu } = await supabase.from('magalu_orders').select('*', { count: 'exact', head: true }).gte('date_created', '2025-01-01');
    const { count: totalMeli } = await supabase.from('mercadolivre_orders').select('*', { count: 'exact', head: true }).gte('date_created', '2025-01-01');

    console.log(`\n🛒 Marketplaces DB:`);
    console.log(`   🟠 Shopee: ${totalShopee}`);
    console.log(`   🔵 Magalu: ${totalMagalu}`);
    console.log(`   🟡 Mercado Livre: ${totalMeli}`);

    // 4. Links
    const { count: totalLinks } = await supabase
        .from('marketplace_order_links')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', '2025-01-01');

    console.log(`\n🔗 Links Tiny ↔ Marketplace: ${totalLinks}`);

    // 5. Check Consistency (Simplificado)
    // Quantos pedidos Shopee do Tiny não têm link?
    // Precisaria de join, difícil via cliente simples sem RPC.
    // Vou apenas comparar números totais.

    console.log('\n📊 Análise de Cobertura:');
    const shopeeTiny = (await supabase.from('tiny_orders').select('*', { count: 'exact', head: true }).gte('data_criacao', '2025-01-01').eq('canal', 'Shopee')).count || 0;

    const coverageShopee = shopeeTiny > 0 ? (totalShopee || 0) / shopeeTiny * 100 : 0;
    console.log(`   Shopee: ${shopeeTiny} pedidos Tiny vs ${totalShopee} pedidos Mkt (${coverageShopee.toFixed(1)}%)`);

}

verify().catch(console.error);
