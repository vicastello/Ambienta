import { supabaseAdmin } from '../lib/supabaseAdmin';

async function quickCheck() {
  // Query mais eficiente - usar LEFT JOIN
  const { data, error } = await supabaseAdmin.rpc('check_missing_items', {
    start_date: '2024-11-01'
  });
  
  if (error) {
    console.log('Função RPC não existe, usando método alternativo...\n');
    
    // Método alternativo: contar diretamente
    const { count: totalOrders } = await supabaseAdmin
      .from('tiny_orders')
      .select('id', { count: 'exact', head: true })
      .gte('data_criacao', '2024-11-01');
    
    const { count: totalWithItems } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido', { count: 'exact', head: true })
      .gte('id_pedido', 0); // Precisaríamos JOIN aqui
    
    console.log(`📦 Total de pedidos: ${totalOrders}`);
    console.log(`❓ Método simplificado não consegue contar com precisão`);
    console.log('\nPara análise detalhada, execute a query SQL diretamente no Supabase:\n');
    console.log(`SELECT 
  COUNT(DISTINCT o.id) as total_pedidos,
  COUNT(DISTINCT i.id_pedido) as com_itens,
  COUNT(DISTINCT o.id) - COUNT(DISTINCT i.id_pedido) as sem_itens
FROM tiny_orders o
LEFT JOIN tiny_pedido_itens i ON o.id = i.id_pedido
WHERE o.data_criacao >= '2024-11-01';`);
    
    return;
  }
  
  console.log(data);
}

quickCheck().catch(console.error);
