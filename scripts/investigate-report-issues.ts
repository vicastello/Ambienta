import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

// Force load .env.local first
config({ path: resolve(process.cwd(), '.env.local') });

// Create supabase client inline
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

async function investigate() {
  console.log('=== INVESTIGANDO PROBLEMAS DO RELATÓRIO ===\n');

  // 1. Pedidos de marketplace não vinculados
  console.log('1. PEDIDOS DE MARKETPLACE NÃO VINCULADOS\n');

  const { data: magaluOrders } = await supabaseAdmin
    .from('magalu_orders')
    .select('order_id, created_at')
    .order('created_at', { ascending: false });

  const { data: shopeeOrders } = await supabaseAdmin
    .from('shopee_orders')
    .select('order_sn, create_time')
    .order('create_time', { ascending: false });

  const { data: mlOrders } = await supabaseAdmin
    .from('mercado_livre_orders')
    .select('order_id, date_created')
    .order('date_created', { ascending: false });

  const totalMarketplaceOrders = (magaluOrders?.length || 0) + (shopeeOrders?.length || 0) + (mlOrders?.length || 0);
  console.log(`Total de pedidos nos marketplaces:`);
  console.log(`  - Magalu: ${magaluOrders?.length || 0}`);
  console.log(`  - Shopee: ${shopeeOrders?.length || 0}`);
  console.log(`  - Mercado Livre: ${mlOrders?.length || 0}`);
  console.log(`  TOTAL: ${totalMarketplaceOrders}\n`);

  // Verificar vínculos
  const { data: links } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('marketplace_type, marketplace_order_id, tiny_order_id');

  console.log(`Total de vínculos: ${links?.length || 0}\n`);

  const magaluLinks = links?.filter(l => l.marketplace_type === 'magalu') || [];
  const shopeeLinks = links?.filter(l => l.marketplace_type === 'shopee') || [];
  const mlLinks = links?.filter(l => l.marketplace_type === 'mercado_livre') || [];

  console.log('Vínculos por marketplace:');
  console.log(`  - Magalu: ${magaluLinks.length} de ${magaluOrders?.length || 0} (${((magaluLinks.length / (magaluOrders?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`  - Shopee: ${shopeeLinks.length} de ${shopeeOrders?.length || 0} (${((shopeeLinks.length / (shopeeOrders?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`  - Mercado Livre: ${mlLinks.length} de ${mlOrders?.length || 0} (${((mlLinks.length / (mlOrders?.length || 1)) * 100).toFixed(1)}%)`);

  const unlinked = totalMarketplaceOrders - (links?.length || 0);
  console.log(`\nPedidos não vinculados: ${unlinked}\n`);

  // Amostras de pedidos não vinculados
  const linkedMagaluIds = new Set(magaluLinks.map(l => l.marketplace_order_id));
  const unlinkedMagalu = magaluOrders?.filter(o => !linkedMagaluIds.has(o.order_id)).slice(0, 5) || [];

  const linkedShopeeIds = new Set(shopeeLinks.map(l => l.marketplace_order_id));
  const unlinkedShopee = shopeeOrders?.filter(o => !linkedShopeeIds.has(o.order_sn)).slice(0, 5) || [];

  const linkedMlIds = new Set(mlLinks.map(l => l.marketplace_order_id));
  const unlinkedMl = mlOrders?.filter(o => !linkedMlIds.has(o.order_id.toString())).slice(0, 5) || [];

  if (unlinkedMagalu.length > 0) {
    console.log('Exemplos de pedidos Magalu não vinculados:');
    unlinkedMagalu.forEach(o => console.log(`  - ${o.order_id} (${o.created_at})`));
    console.log();
  }

  if (unlinkedShopee.length > 0) {
    console.log('Exemplos de pedidos Shopee não vinculados:');
    unlinkedShopee.forEach(o => {
      let date = 'sem data';
      try {
        if (o.create_time && !isNaN(o.create_time)) {
          date = new Date(o.create_time * 1000).toISOString();
        }
      } catch (e) {
        date = `timestamp inválido: ${o.create_time}`;
      }
      console.log(`  - ${o.order_sn} (${date})`);
    });
    console.log();
  }

  if (unlinkedMl.length > 0) {
    console.log('Exemplos de pedidos Mercado Livre não vinculados:');
    unlinkedMl.forEach(o => console.log(`  - ${o.order_id} (${o.date_created})`));
    console.log();
  }

  // 2. Pedidos sem itens
  console.log('\n2. PEDIDOS DO TINY SEM ITENS\n');

  const { data: tinyOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, tiny_id, data_criacao');

  console.log(`Total de pedidos no Tiny: ${tinyOrders?.length || 0}`);

  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido');

  const orderIdsWithItems = new Set(items?.map(i => i.id_pedido) || []);
  const ordersWithoutItems = tinyOrders?.filter(o => !orderIdsWithItems.has(o.id)) || [];

  console.log(`Pedidos sem itens: ${ordersWithoutItems.length}\n`);

  if (ordersWithoutItems.length > 0) {
    console.log('Pedidos sem itens cadastrados:');
    ordersWithoutItems.slice(0, 10).forEach(o => {
      console.log(`  - ID: ${o.id}, Número: ${o.numero_pedido}, Tiny ID: ${o.tiny_id}, Data: ${o.data_criacao}`);
    });
  }

  // Verificar se esses pedidos estão vinculados a marketplaces
  console.log('\nVerificando se pedidos sem itens têm vínculos com marketplace:');
  for (const order of ordersWithoutItems.slice(0, 5)) {
    const { data: link } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace_type, marketplace_order_id')
      .eq('tiny_order_id', order.id)
      .single();

    if (link) {
      console.log(`  - Pedido ${order.numero_pedido}: vinculado a ${link.marketplace_type} (${link.marketplace_order_id})`);

      // Verificar se o pedido do marketplace tem itens
      if (link.marketplace_type === 'magalu') {
        const { data: magaluItems } = await supabaseAdmin
          .from('magalu_order_items')
          .select('id')
          .eq('order_id', link.marketplace_order_id);
        console.log(`    -> ${magaluItems?.length || 0} itens no Magalu`);
      } else if (link.marketplace_type === 'shopee') {
        const { data: shopeeItems } = await supabaseAdmin
          .from('shopee_order_items')
          .select('id')
          .eq('order_sn', link.marketplace_order_id);
        console.log(`    -> ${shopeeItems?.length || 0} itens no Shopee`);
      } else if (link.marketplace_type === 'mercado_livre') {
        const { data: mlItems } = await supabaseAdmin
          .from('mercado_livre_order_items')
          .select('id')
          .eq('order_id', parseInt(link.marketplace_order_id));
        console.log(`    -> ${mlItems?.length || 0} itens no Mercado Livre`);
      }
    } else {
      console.log(`  - Pedido ${order.numero_pedido}: SEM vínculo`);
    }
  }
}

investigate().catch(console.error);
