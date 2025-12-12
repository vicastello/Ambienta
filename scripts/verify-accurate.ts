import { supabaseAdmin } from '../lib/supabaseAdmin';

async function verifyAccurate() {
  console.log('🔍 Verificação Precisa\n');

  // Método 1: Count direto
  const { count: totalOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_criacao', '2024-11-01');

  // Método 2: Buscar distinct id_pedido de itens
  const { data: distinctItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido');

  const uniquePedidosComItens = new Set(distinctItems?.map(i => i.id_pedido) || []);

  console.log(`Método 1 - Total de pedidos: ${totalOrders}`);
  console.log(`Método 2 - Pedidos únicos com itens: ${uniquePedidosComItens.size}`);
  console.log(`Sem itens: ${(totalOrders || 0) - uniquePedidosComItens.size}\n`);

  // Verificar se há problema com data
  const { data: allOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', '2024-11-01');

  const ordersWithItems = (allOrders || []).filter(o => uniquePedidosComItens.has(o.id));
  
  console.log(`Verificação cruzada:`);
  console.log(`  Pedidos desde 01/11: ${allOrders?.length || 0}`);
  console.log(`  Desses, com itens: ${ordersWithItems.length}`);
  console.log(`  Percentual: ${((ordersWithItems.length / (allOrders?.length || 1)) * 100).toFixed(1)}%`);
}

verifyAccurate();
