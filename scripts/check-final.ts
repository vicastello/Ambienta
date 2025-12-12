import { supabaseAdmin } from '../lib/supabaseAdmin';

(async () => {
  const { data: orders } = await supabaseAdmin.from('tiny_orders').select('id').gte('data_criacao', '2024-11-01');
  const ids = orders?.map(x => x.id) || [];
  const { data: items } = await supabaseAdmin.from('tiny_pedido_itens').select('id_pedido').in('id_pedido', ids);
  const withItems = new Set(items?.map(x => x.id_pedido) || []);
  
  console.log('\n═════════════════════════════════════════════════');
  console.log('VERIFICAÇÃO FINAL - Pedidos desde 01/11/2024');
  console.log('═════════════════════════════════════════════════\n');
  console.log('📦 Total de pedidos:', ids.length);
  console.log('✅ Com produtos:', withItems.size, '(' + ((withItems.size/ids.length)*100).toFixed(1) + '%)');
  console.log('⏳ Sem produtos:', ids.length - withItems.size);
  console.log('');
  
  if (ids.length === withItems.size) {
    console.log('🎉 PERFEITO! Todos os pedidos estão com produtos!');
  } else {
    console.log('⚠️ Ainda faltam', ids.length - withItems.size, 'pedidos');
  }
  console.log('\n═════════════════════════════════════════════════');
})();
