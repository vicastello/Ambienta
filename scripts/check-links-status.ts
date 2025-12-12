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
  console.log('=== STATUS DOS VÍNCULOS ===\n');

  // Contar vínculos
  const { count: totalLinks } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('*', { count: 'exact', head: true });

  console.log(`Total de vínculos na tabela: ${totalLinks}\n`);

  // Por marketplace
  const { data: linksByMarket } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('marketplace')
    .order('marketplace');

  const counts = linksByMarket?.reduce((acc, link) => {
    acc[link.marketplace] = (acc[link.marketplace] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  console.log('Vínculos por marketplace:');
  console.log(`  - Magalu: ${counts['magalu'] || 0}`);
  console.log(`  - Shopee: ${counts['shopee'] || 0}`);
  console.log(`  - Mercado Livre: ${counts['mercado_livre'] || 0}\n`);

  // Verificar pedidos não vinculados
  console.log('=== PEDIDOS SEM VÍNCULOS ===\n');

  // Shopee
  const { data: shopeeOrders } = await supabaseAdmin
    .from('shopee_orders')
    .select('order_sn')
    .order('order_sn')
    .limit(5);

  for (const order of shopeeOrders || []) {
    const { data: link } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('id')
      .eq('marketplace', 'shopee')
      .eq('marketplace_order_id', order.order_sn)
      .maybeSingle();

    console.log(`Shopee ${order.order_sn}: ${link ? 'VINCULADO' : 'NÃO VINCULADO'}`);
  }

  console.log('\n=== STATUS DOS ITENS ===\n');

  const { data: tinyOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido')
    .gte('data_criacao', '2025-11-01')
    .limit(10);

  console.log(`Primeiros 10 pedidos desde 01/11/2025:`);
  for (const order of tinyOrders || []) {
    const { data: items } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id')
      .eq('id_pedido', order.id);

    const { data: link } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace, marketplace_order_id')
      .eq('tiny_order_id', order.id)
      .maybeSingle();

    const linkStr = link ? `${link.marketplace}:${link.marketplace_order_id}` : 'SEM VÍNCULO';
    console.log(`  Pedido #${order.numero_pedido}: ${items?.length || 0} itens | ${linkStr}`);
  }
}

check().catch(console.error);
