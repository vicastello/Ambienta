#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function analyzeMissing() {
  console.log('🔍 Analisando pedidos sem itens desde 01/11/2024...\n');

  // 1. Buscar IDs dos pedidos sem itens
  const { data: allOrders, error: ordersError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, situacao')
    .gte('data_criacao', '2024-11-01')
    .limit(2000);

  if (ordersError) {
    console.error('❌ Erro ao buscar pedidos:', ordersError);
    return;
  }
  
  if (!allOrders) {
    console.error('❌ Nenhum pedido encontrado');
    return;
  }

  // 2. Buscar quais têm itens (query separada, mais eficiente)
  const allIds = allOrders.map(o => o.id);
  const { data: itemsData } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', allIds);

  const withItems = new Set(itemsData?.map(i => i.id_pedido) || []);
  
  // 3. Filtrar pedidos sem itens
  const missing = allOrders.filter(o => !withItems.has(o.id));

  console.log(`📊 RESUMO GERAL:`);
  console.log(`   Total de pedidos: ${allOrders.length}`);
  console.log(`   Com itens: ${withItems.size} (${((withItems.size/allOrders.length)*100).toFixed(1)}%)`);
  console.log(`   Sem itens: ${missing.length} (${((missing.length/allOrders.length)*100).toFixed(1)}%)\n`);

  // 4. Análise dos pedidos sem itens
  const withoutTinyId = missing.filter(o => !o.tiny_id);
  const withTinyId = missing.filter(o => o.tiny_id);

  console.log(`🆔 ANÁLISE DE tiny_id:`);
  console.log(`   Sem tiny_id: ${withoutTinyId.length} (não podem ser sincronizados)`);
  console.log(`   Com tiny_id: ${withTinyId.length} (podem ser sincronizados)\n`);

  // 5. Agrupar por situação
  const bySituacao: Record<string, number> = {};
  missing.forEach(o => {
    const sit = o.situacao || 'null';
    bySituacao[sit] = (bySituacao[sit] || 0) + 1;
  });

  console.log(`📋 POR SITUAÇÃO (pedidos sem itens):`);
  Object.entries(bySituacao)
    .sort((a, b) => b[1] - a[1])
    .forEach(([sit, count]) => {
      const pct = ((count/missing.length)*100).toFixed(1);
      console.log(`   ${sit}: ${count} (${pct}%)`);
    });
  console.log();



  // 7. Amostras
  if (withoutTinyId.length > 0) {
    console.log(`⚠️  PEDIDOS SEM tiny_id (não sincronizáveis):`);
    console.log(`   Primeiros 10 exemplos:`);
    withoutTinyId.slice(0, 10).forEach(o => {
      console.log(`   - ID: ${o.id} | ${o.situacao}`);
    });
    console.log();
  }

  if (withTinyId.length > 0) {
    console.log(`✅ PEDIDOS COM tiny_id (sincronizáveis):`);
    console.log(`   Total: ${withTinyId.length}`);
    console.log(`   Primeiros 10 tiny_ids:`);
    withTinyId.slice(0, 10).forEach(o => {
      console.log(`   - tiny_id: ${o.tiny_id} | ${o.situacao}`);
    });
    console.log();
  }

  // 8. Recomendação
  console.log(`═════════════════════════════════════════════════`);
  console.log(`RECOMENDAÇÃO:`);
  console.log(`═════════════════════════════════════════════════`);
  
  if (withTinyId.length > 0) {
    console.log(`✅ Há ${withTinyId.length} pedidos que podem ser sincronizados`);
    console.log(`   Execute: npm run sync:tiny-items`);
    console.log(`   ou aguarde a sincronização automática via cron\n`);
  }
  
  if (withoutTinyId.length > 0) {
    console.log(`⚠️  ${withoutTinyId.length} pedidos não têm tiny_id`);
    console.log(`   Esses pedidos podem ser:`);
    console.log(`   - Pedidos ainda não importados do Tiny`);
    console.log(`   - Pedidos de integração que falharam`);
    console.log(`   - Pedidos cancelados antes de serem salvos\n`);
  }
  
  console.log(`═════════════════════════════════════════════════\n`);
}

analyzeMissing().catch(console.error);
