import { supabaseAdmin } from '../lib/supabaseAdmin';

async function verificarStatus() {
  console.log('Consultando base de dados (contagem real)...\n');
  
  // Buscar TODOS os pedidos sem limite de 1000
  let allOrders: { id: number }[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: orders, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id')
      .gte('data_criacao', '2025-11-01')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Erro:', error);
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
  
  if (allOrders.length === 0) {
    console.log('❌ Nenhum pedido encontrado');
    return;
  }
  
  const ids = allOrders.map(x => x.id);
  
  // Buscar TODOS os itens sem limite
  const minId = Math.min(...ids);
  const maxId = Math.max(...ids);
  
  let allItems: { id_pedido: number }[] = [];
  page = 0;
  hasMore = true;

  while (hasMore) {
    const { data: items, error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .gte('id_pedido', minId)
      .lte('id_pedido', maxId)
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
  
  // Filtrar apenas os IDs que realmente pertencem aos pedidos
  const orderIdsSet = new Set(ids);
  const items = allItems.filter(item => orderIdsSet.has(item.id_pedido));
  
  const withItems = new Set(items.map(x => x.id_pedido));
  
  console.log('═════════════════════════════════════════════════');
  console.log('VERIFICAÇÃO FINAL - Pedidos desde 01/11/2024');
  console.log('═════════════════════════════════════════════════\n');
  console.log('📦 Total de pedidos:', ids.length);
  console.log('✅ Com produtos:', withItems.size, '(' + ((withItems.size/ids.length)*100).toFixed(1) + '%)');
  console.log('⏳ Sem produtos:', ids.length - withItems.size);
  console.log('');
  
  if (ids.length === withItems.size) {
    console.log('🎉 PERFEITO! Todos os pedidos estão com produtos!\n');
  } else {
    console.log('⚠️ Ainda faltam', ids.length - withItems.size, 'pedidos\n');
  }
  console.log('═════════════════════════════════════════════════');
}

verificarStatus().catch(console.error);
