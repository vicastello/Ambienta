import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://znoiauhdrujwkfryhwiz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODEyNywiZXhwIjoyMDc4OTc0MTI3fQ.J1GFCdU1Fb9Jc5NlQSHkI7vsvXPWbE3l6h-17KLPsZQ"
);

async function checkTodayFrete() {
  const today = '2025-11-21';
  
  // Buscar pedidos de hoje com detalhes
  const { data: orders, error } = await supabase
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, valor, valor_frete, canal, cliente_nome, data_criacao')
    .gte('data_criacao', today)
    .lt('data_criacao', '2025-11-22')
    .order('valor_frete', { ascending: false });

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log(`\n📦 PEDIDOS DE ${today}:\n`);
  console.log(`Total de pedidos: ${orders?.length || 0}\n`);

  if (orders && orders.length > 0) {
    console.log('📊 RESUMO DE FRETE:');
    
    const withFrete = orders.filter(o => o.valor_frete && o.valor_frete > 0);
    const totalFrete = withFrete.reduce((sum, o) => sum + Number(o.valor_frete || 0), 0);
    const avgFrete = withFrete.length > 0 ? totalFrete / withFrete.length : 0;
    
    console.log(`   Com frete: ${withFrete.length}`);
    console.log(`   Sem frete: ${orders.length - withFrete.length}`);
    console.log(`   Total frete: R$ ${totalFrete.toFixed(2)}`);
    console.log(`   Média frete: R$ ${avgFrete.toFixed(2)}`);
    
    console.log('\n📋 DETALHES DOS PEDIDOS COM FRETE:\n');
    withFrete.forEach(order => {
      console.log(`   Pedido ${order.numero_pedido || order.tiny_id}:`);
      console.log(`      Frete: R$ ${Number(order.valor_frete).toFixed(2)}`);
      console.log(`      Valor: R$ ${Number(order.valor).toFixed(2)}`);
      console.log(`      Canal: ${order.canal || 'N/A'}`);
      console.log(`      Cliente: ${order.cliente_nome || 'N/A'}`);
      console.log('');
    });

    console.log('\n📋 AMOSTRA DE PEDIDOS SEM FRETE (primeiros 5):\n');
    const noFrete = orders.filter(o => !o.valor_frete || o.valor_frete === 0).slice(0, 5);
    noFrete.forEach(order => {
      console.log(`   Pedido ${order.numero_pedido || order.tiny_id}:`);
      console.log(`      Valor: R$ ${Number(order.valor).toFixed(2)}`);
      console.log(`      Canal: ${order.canal || 'N/A'}`);
      console.log(`      Cliente: ${order.cliente_nome || 'N/A'}`);
      console.log('');
    });
  } else {
    console.log('Nenhum pedido encontrado para hoje.');
  }
}

checkTodayFrete();
