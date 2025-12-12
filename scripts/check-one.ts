import { supabaseAdmin } from '../lib/supabaseAdmin';

async function check() {
  const { data: order } = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .eq('tiny_id', 943557941)
    .single();
    
  if (order) {
    const { data: items, count } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('*', {count: 'exact'})
      .eq('id_pedido', order.id);
      
    console.log(`Pedido 943557941 (id: ${order.id}): ${count} itens`);
    if (items) {
      items.forEach(i => console.log(`  - ${i.codigo_produto}: ${i.nome_produto}`));
    }
  }
}

check();
