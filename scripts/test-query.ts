import { supabaseAdmin } from '../lib/supabaseAdmin';

async function testQuery() {
  // Buscar pedidos
  const { data: allOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', '2024-11-01');

  const orderIds = allOrders?.map(o => o.id) || [];
  console.log(`Total de IDs: ${orderIds.length}`);
  console.log(`ID mínimo: ${Math.min(...orderIds)}`);
  console.log(`ID máximo: ${Math.max(...orderIds)}\n`);

  // Testar query com .in()
  console.log('Testando query com .in()...');
  const { data: items1, error: error1 } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orderIds);

  console.log(`Resultado: ${items1?.length || 0} itens`);
  if (error1) console.log(`Erro: ${error1.message}`);

  // Contar distintos
  const unique = new Set(items1?.map(i => i.id_pedido) || []);
  console.log(`Pedidos únicos: ${unique.size}\n`);

  // Testar query alternativa com filter
  console.log('Testando query com filter gte/lte...');
  const minId = Math.min(...orderIds);
  const maxId = Math.max(...orderIds);
  
  const { data: items2 } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .gte('id_pedido', minId)
    .lte('id_pedido', maxId);

  const unique2 = new Set(items2?.map(i => i.id_pedido) || []);
  console.log(`Resultado: ${items2?.length || 0} itens`);
  console.log(`Pedidos únicos: ${unique2.size}\n`);

  // Verificar se 253123 está em algum
  console.log(`ID 253123 presente em .in(): ${unique.has(253123)}`);
  console.log(`ID 253123 presente em .gte/.lte(): ${unique2.has(253123)}`);
}

testQuery();
