import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkId() {
  // Verificar ordem 253123
  const { data: order } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .eq('id', 253123)
    .single();

  console.log(`Pedido 253123:`);
  console.log(`  tiny_id: ${order?.tiny_id}`);
  console.log(`  data_criacao: ${order?.data_criacao}`);
  console.log(`  >= 2024-11-01: ${(order?.data_criacao || '') >= '2024-11-01'}\n`);

  // Verificar itens
  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*')
    .eq('id_pedido', 253123);

  console.log(`Itens do pedido 253123: ${items?.length || 0}`);
  if (items) {
    items.forEach(i => console.log(`  - ${i.nome_produto}`));
  }
  
  // Verificar range
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', '2024-11-01')
    .order('id');

  const ids = orders?.map(o => o.id) || [];
  console.log(`\nRange de IDs:`);
  console.log(`  Min: ${Math.min(...ids)}`);
  console.log(`  Max: ${Math.max(...ids)}`);
  console.log(`  253123 está no array: ${ids.includes(253123)}`);
}

checkId();
