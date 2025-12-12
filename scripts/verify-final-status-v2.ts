import { supabaseAdmin } from '../lib/supabaseAdmin';

async function verificarStatus() {
  console.log('Consultando base de dados (contagem real e simples)...\n');
  
  // 1. Contar total de pedidos desde 01/11
  const { count: totalOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_criacao', '2025-11-01');

  if (!totalOrders || totalOrders === 0) {
    console.log('❌ Nenhum pedido encontrado');
    return;
  }

  // 2. Buscar TODOS os itens (sem filtro de pedido)
  let allItems: { id_pedido: number }[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: items, error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Erro ao buscar itens:', error);
      break;
    }

    if (!items || items.length === 0) {
      hasMore = false;
    } else {
      allItems = allItems.concat(items);
      hasMore = items.length === pageSize;
      page++;
    }
  }

  // 3. Buscar TODOS os pedidos desde 01/11 para filtrar
  let allOrders: { id: number }[] = [];
  page = 0;
  hasMore = true;

  while (hasMore) {
    const { data: orders, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id')
      .gte('data_criacao', '2025-11-01')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Erro ao buscar pedidos:', error);
      break;
    }

    if (!orders || orders.length === 0) {
      hasMore = false;
    } else {
      allOrders = allOrders.concat(orders);
      hasMore = orders.length === pageSize;
      page++;
    }
  }

  // 4. Filtrar itens que pertencem a pedidos desde 01/11
  const orderIdsSet = new Set(allOrders.map(o => o.id));
  const filteredItems = allItems.filter(item => orderIdsSet.has(item.id_pedido));
  const withItems = new Set(filteredItems.map(x => x.id_pedido));

  console.log('═════════════════════════════════════════════════');
  console.log('VERIFICAÇÃO FINAL - Pedidos desde 01/11/2025');
  console.log('═════════════════════════════════════════════════\n');
  console.log('📦 Total de pedidos:', totalOrders);
  console.log('✅ Com produtos:', withItems.size, '(' + ((withItems.size/totalOrders)*100).toFixed(1) + '%)');
  console.log('⏳ Sem produtos:', totalOrders - withItems.size);
  console.log('');
  
  if (totalOrders - withItems.size > 0) {
    console.log(`⚠️ Ainda faltam ${totalOrders - withItems.size} pedidos`);
  } else {
    console.log('✅ Todos os pedidos têm produtos!');
  }
  
  console.log('\n═════════════════════════════════════════════════');
}

verificarStatus().catch(console.error);
