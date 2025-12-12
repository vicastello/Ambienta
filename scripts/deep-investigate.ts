import { supabaseAdmin } from '../lib/supabaseAdmin';

async function deepInvestigate() {
  console.log('🔬 Investigação Profunda do Banco\n');

  // 1. Contar pedidos desde 01/11
  const { data: allOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id')
    .gte('data_criacao', '2024-11-01');

  console.log(`1️⃣ Pedidos desde 01/11: ${allOrders?.length || 0}\n`);

  if (!allOrders) return;

  // 2. Contar TODOS os itens (sem filtro)
  const { count: totalItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*', { count: 'exact', head: true });

  console.log(`2️⃣ Total de itens no banco (todos): ${totalItems}\n`);

  // 3. Contar itens APENAS dos pedidos de 01/11
  const orderIds = allOrders.map(o => o.id);
  
  // Fazer em lotes para evitar limite de query
  let totalItemsFiltered = 0;
  const BATCH = 1000;
  
  for (let i = 0; i < orderIds.length; i += BATCH) {
    const batch = orderIds.slice(i, i + BATCH);
    const { count } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('*', { count: 'exact', head: true })
      .in('id_pedido', batch);
    
    totalItemsFiltered += count || 0;
  }

  console.log(`3️⃣ Itens dos pedidos de 01/11: ${totalItemsFiltered}\n`);

  // 4. Verificar pedidos DISTINTOS com itens
  const { data: allItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orderIds);

  const uniqueOrders = new Set(allItems?.map(i => i.id_pedido) || []);

  console.log(`4️⃣ Pedidos ÚNICOS com itens (dos 1000): ${uniqueOrders.size}\n`);

  // 5. Testar o pedido 943557941 especificamente
  const testOrder = allOrders.find(o => o.tiny_id === 943557941);
  if (testOrder) {
    const { data: testItems } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('*')
      .eq('id_pedido', testOrder.id);
    
    console.log(`5️⃣ Pedido teste 943557941 (id ${testOrder.id}):`);
    console.log(`   Itens: ${testItems?.length || 0}`);
    console.log(`   Presente no Set: ${uniqueOrders.has(testOrder.id)}\n`);
  }

  // 6. Listar alguns pedidos SEM itens
  const withoutItems = allOrders.filter(o => !uniqueOrders.has(o.id));
  console.log(`6️⃣ Pedidos SEM itens: ${withoutItems.length}`);
  console.log(`   Primeiros 10 tiny_ids:`);
  withoutItems.slice(0, 10).forEach(o => console.log(`   - ${o.tiny_id}`));
}

deepInvestigate();
