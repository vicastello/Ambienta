import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function check() {
  // Ver total de pedidos desde 01/11/2025
  const { data: orders, count: totalOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id', { count: 'exact' })
    .gte('data_criacao', '2025-11-01');

  console.log('Total de pedidos desde 01/11/2025:', totalOrders);

  // Ver quantos itens existem para esses pedidos
  const orderIds = orders?.map(o => o.id) || [];
  const minId = Math.min(...orderIds);
  const maxId = Math.max(...orderIds);

  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .gte('id_pedido', minId)
    .lte('id_pedido', maxId);

  const orderIdsSet = new Set(orderIds);
  const filteredItems = items?.filter(item => orderIdsSet.has(item.id_pedido)) || [];
  const uniquePedidosWithItems = new Set(filteredItems.map(i => i.id_pedido));

  console.log('Pedidos com itens:', uniquePedidosWithItems.size);
  console.log('Total de itens:', filteredItems.length);
  console.log('Percentual:', ((uniquePedidosWithItems.size / (totalOrders || 1)) * 100).toFixed(1) + '%');

  // Verificar alguns pedidos específicos que acabamos de sincronizar
  const { data: recentSynced } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, tiny_id')
    .gte('data_criacao', '2025-11-01')
    .is('data_pedido_itens_sincronizados', null)
    .limit(5);

  console.log('\nPrimeiros 5 pedidos sem timestamp de sync:');
  for (const order of recentSynced || []) {
    const { data: items } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id')
      .eq('id_pedido', order.id);
    console.log(`  - Pedido ${order.numero_pedido} (ID ${order.id}): ${items?.length || 0} itens`);
  }
}

check().catch(console.error);
