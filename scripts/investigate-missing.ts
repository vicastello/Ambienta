import { supabaseAdmin } from '../lib/supabaseAdmin';

async function investigateMissingOrders() {
  console.log('🔍 Investigando pedidos sem itens...\n');
  
  // Buscar pedidos sem itens
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, situacao, ecommerce')
    .gte('data_criacao', '2024-11-01');
  
  if (!orders) return;
  
  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orders.map(o => o.id));
  
  const withItems = new Set(items?.map(i => i.id_pedido) || []);
  const missing = orders.filter(o => !withItems.has(o.id));
  
  console.log(`📊 RESUMO:`);
  console.log(`   Total: ${orders.length}`);
  console.log(`   Com itens: ${withItems.size}`);
  console.log(`   Sem itens: ${missing.length}\n`);
  
  // Agrupar por situação
  const bySituacao = missing.reduce((acc, o) => {
    const sit = o.situacao || 'null';
    acc[sit] = (acc[sit] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`📋 Por situação:`);
  Object.entries(bySituacao)
    .sort((a, b) => b[1] - a[1])
    .forEach(([sit, count]) => {
      console.log(`   ${sit}: ${count}`);
    });
  console.log();
  
  // Agrupar por ecommerce
  const byEcommerce = missing.reduce((acc, o) => {
    const ecom = o.ecommerce || 'null';
    acc[ecom] = (acc[ecom] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`🛒 Por canal:`);
  Object.entries(byEcommerce)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ecom, count]) => {
      console.log(`   ${ecom}: ${count}`);
    });
  console.log();
  
  // Verificar se têm tiny_id
  const withoutTinyId = missing.filter(o => !o.tiny_id);
  console.log(`🆔 Sem tiny_id: ${withoutTinyId.length}`);
  
  if (withoutTinyId.length > 0) {
    console.log('\n⚠️ Pedidos sem tiny_id não podem ser sincronizados!');
    console.log(`   Primeiros 5 exemplos:`);
    withoutTinyId.slice(0, 5).forEach(o => {
      console.log(`   - ID ${o.id}: ${o.situacao} | ${o.ecommerce}`);
    });
  }
  
  // Amostras de pedidos que têm tiny_id mas sem itens
  const withTinyId = missing.filter(o => o.tiny_id);
  if (withTinyId.length > 0) {
    console.log(`\n📝 Pedidos COM tiny_id mas sem itens: ${withTinyId.length}`);
    console.log(`   Primeiros 10 exemplos (tiny_id):`);
    withTinyId.slice(0, 10).forEach(o => {
      console.log(`   - ${o.tiny_id} | ${o.situacao} | ${o.ecommerce}`);
    });
  }
}

investigateMissingOrders().catch(console.error);
