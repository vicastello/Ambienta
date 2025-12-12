import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

async function check() {
  console.log('=== PEDIDOS SEM ITENS DESDE 01/11/2025 ===\n');

  // Buscar todos os pedidos desde 01/11/2025
  const { data: tinyOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, tiny_id, canal, data_criacao')
    .gte('data_criacao', '2025-11-01')
    .order('data_criacao', { ascending: false });

  console.log(`Total de pedidos desde 01/11/2025: ${tinyOrders?.length || 0}\n`);

  // Verificar quais não têm itens
  const ordersWithoutItems = [];

  for (const order of tinyOrders || []) {
    const { data: items } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id')
      .eq('id_pedido', order.id);

    if (!items || items.length === 0) {
      ordersWithoutItems.push(order);
    }
  }

  console.log(`Pedidos SEM itens: ${ordersWithoutItems.length}\n`);

  if (ordersWithoutItems.length > 0) {
    console.log('Detalhes dos pedidos sem itens:\n');

    for (const order of ordersWithoutItems.slice(0, 10)) {
      const { data: link } = await supabaseAdmin
        .from('marketplace_order_links')
        .select('marketplace, marketplace_order_id')
        .eq('tiny_order_id', order.id)
        .maybeSingle();

      const linkStr = link ? `${link.marketplace}:${link.marketplace_order_id}` : 'SEM VÍNCULO';

      console.log(`  Pedido #${order.numero_pedido} (ID: ${order.id})`);
      console.log(`    Tiny ID: ${order.tiny_id}`);
      console.log(`    Canal: ${order.canal}`);
      console.log(`    Data: ${order.data_criacao}`);
      console.log(`    Vínculo: ${linkStr}`);

      // Se tiver vínculo, verificar se o pedido do marketplace tem itens
      if (link) {
        if (link.marketplace === 'shopee') {
          const { data: shopeeItems } = await supabaseAdmin
            .from('shopee_order_items')
            .select('id')
            .eq('order_sn', link.marketplace_order_id);
          console.log(`    Itens no Shopee: ${shopeeItems?.length || 0}`);
        } else if (link.marketplace === 'magalu') {
          const { data: magaluItems } = await supabaseAdmin
            .from('magalu_order_items')
            .select('id')
            .eq('order_id', link.marketplace_order_id);
          console.log(`    Itens no Magalu: ${magaluItems?.length || 0}`);
        } else if (link.marketplace === 'mercado_livre') {
          const { data: mlItems } = await supabaseAdmin
            .from('mercado_livre_order_items')
            .select('id')
            .eq('order_id', parseInt(link.marketplace_order_id));
          console.log(`    Itens no Mercado Livre: ${mlItems?.length || 0}`);
        }
      }

      console.log();
    }

    if (ordersWithoutItems.length > 10) {
      console.log(`... e mais ${ordersWithoutItems.length - 10} pedidos sem itens\n`);
    }
  }

  console.log('\n=== RESUMO ===');
  console.log(`Total de pedidos: ${tinyOrders?.length || 0}`);
  console.log(`Pedidos COM itens: ${(tinyOrders?.length || 0) - ordersWithoutItems.length}`);
  console.log(`Pedidos SEM itens: ${ordersWithoutItems.length}`);
  console.log(`Percentual sem itens: ${((ordersWithoutItems.length / (tinyOrders?.length || 1)) * 100).toFixed(1)}%`);
}

check().catch(console.error);
