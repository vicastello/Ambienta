#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { obterPedidoDetalhado } from '../lib/tinyApi';

async function investigateRemainingDeep() {
  console.log('🔍 Investigação profunda dos pedidos sem itens...\n');

  const accessToken = await getAccessTokenFromDbOrRefresh();

  // Buscar pedidos sem itens
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, situacao')
    .gte('data_criacao', '2024-11-01');

  if (!orders) return;

  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orders.map(o => o.id));

  const withItems = new Set(items?.map(i => i.id_pedido) || []);
  const missing = orders.filter(o => !withItems.has(o.id) && o.tiny_id);

  console.log(`📊 Total: ${orders.length}, Com itens: ${withItems.size}, Sem itens: ${missing.length}\n`);

  // Testar os primeiros 10 diretamente na API
  console.log('🧪 Testando primeiros 10 pedidos diretamente na API Tiny:\n');

  for (let i = 0; i < Math.min(10, missing.length); i++) {
    const order = missing[i];
    console.log(`   ${i + 1}. tiny_id: ${order.tiny_id}`);

    try {
      const resultado = await obterPedidoDetalhado(accessToken, order.tiny_id!, 'deep_test');
      
      const itens = (resultado as any)?.itens || [];
      const itens2 = (resultado as any)?.pedido?.itens || [];
      
      if (Array.isArray(itens) && itens.length > 0) {
        console.log(`      ✅ TEM ${itens.length} item(ns) em resultado.itens`);
        console.log(`      Primeiro item: ${itens[0]?.produto?.descricao || itens[0]?.descricao || 'sem nome'}`);
      } else if (Array.isArray(itens2) && itens2.length > 0) {
        console.log(`      ✅ TEM ${itens2.length} item(ns) em pedido.itens`);
      } else {
        console.log(`      ❌ SEM ITENS na API`);
        console.log(`      Chaves: ${Object.keys(resultado || {}).join(', ')}`);
      }

      // Delay entre requests
      await new Promise(r => setTimeout(r, 1200));

    } catch (error: any) {
      console.log(`      ❌ ERRO: ${error.message || error}`);
    }
    console.log();
  }

  // Contar por situação
  const bySituacao: Record<string, number> = {};
  missing.forEach(o => {
    const sit = String(o.situacao || 'null');
    bySituacao[sit] = (bySituacao[sit] || 0) + 1;
  });

  console.log('\n📋 PEDIDOS SEM ITENS POR SITUAÇÃO:');
  Object.entries(bySituacao)
    .sort((a, b) => b[1] - a[1])
    .forEach(([sit, count]) => {
      console.log(`   Situação ${sit}: ${count} pedidos`);
    });
}

investigateRemainingDeep().catch(console.error);
