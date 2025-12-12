import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkCorrect() {
  // 1. Buscar TODOS pedidos desde 01/11/2025
  let allOrders: { id: number }[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  console.log('Buscando pedidos desde 01/11/2025...');
  
  while (hasMore) {
    const { data: orders, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id')
      .gte('data_criacao', '2025-11-01')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !orders || orders.length === 0) {
      hasMore = false;
    } else {
      allOrders = allOrders.concat(orders);
      hasMore = orders.length === pageSize;
      page++;
    }
  }

  console.log(`Total de pedidos desde 01/11/2025: ${allOrders.length}`);

  // 2. Buscar TODOS itens
  let allItems: { id_pedido: number }[] = [];
  page = 0;
  hasMore = true;

  console.log('Buscando todos os itens...');
  
  while (hasMore) {
    const { data: items, error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !items || items.length === 0) {
      hasMore = false;
    } else {
      allItems = allItems.concat(items);
      hasMore = items.length === pageSize;
      page++;
    }
  }

  console.log(`Total de itens no banco: ${allItems.length}`);

  // 3. Filtrar itens que pertencem aos pedidos de 2025
  const orderIdsSet = new Set(allOrders.map(o => o.id));
  const filteredItems = allItems.filter(item => orderIdsSet.has(item.id_pedido));
  const withItems = new Set(filteredItems.map(x => x.id_pedido));

  console.log('\n═══════════════════════════════════════');
  console.log('RESULTADO CORRETO:');
  console.log('═══════════════════════════════════════');
  console.log(`Total de pedidos desde 01/11/2025: ${allOrders.length}`);
  console.log(`Pedidos com produtos: ${withItems.size} (${((withItems.size/allOrders.length)*100).toFixed(1)}%)`);
  console.log(`Pedidos SEM produtos: ${allOrders.length - withItems.size}`);
  console.log('═══════════════════════════════════════');
}

checkCorrect().catch(console.error);
