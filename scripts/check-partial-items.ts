#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkPedidosWithPartialItems() {
  console.log('🔍 Verificando pedidos que podem ter itens parciais...\n');

  // Buscar pedidos sem itens desde 01/11
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, situacao')
    .gte('data_criacao', '2024-11-01');

  if (!orders) return;

  // Buscar quais têm itens
  const allIds = orders.map(o => o.id);
  const { data: itemsData } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido, codigo_produto, nome_produto')
    .in('id_pedido', allIds);

  const withItems = new Set(itemsData?.map(i => i.id_pedido) || []);
  const missing = orders.filter(o => !withItems.has(o.id));

  console.log(`📊 Total: ${orders.length}`);
  console.log(`   Com itens: ${withItems.size}`);
  console.log(`   Sem itens: ${missing.length}\n`);

  // Verificar alguns pedidos que DEVERIAM ter itens
  const exemploIds = [935744711, 935741376, 935739823];
  console.log(`🔍 Verificando exemplos específicos (tiny_id):\n`);

  for (const tinyId of exemploIds) {
    const order = orders.find(o => o.tiny_id === tinyId);
    if (!order) {
      console.log(`   ${tinyId}: ❌ Pedido não encontrado na base`);
      continue;
    }

    const items = itemsData?.filter(i => i.id_pedido === order.id) || [];
    
    console.log(`   tiny_id: ${tinyId} (id: ${order.id})`);
    console.log(`   Itens na base: ${items.length}`);
    
    if (items.length > 0) {
      console.log(`   ⚠️  TEM ITENS! Exemplos:`);
      items.slice(0, 3).forEach(item => {
        console.log(`      - ${item.codigo_produto}: ${item.nome_produto}`);
      });
    } else {
      console.log(`   ❌ Sem itens na base`);
    }
    console.log();
  }

  // Verificar se há pedidos com itens vazios/null
  console.log(`\n🔍 Verificando itens com dados vazios ou nulos:\n`);
  
  const { data: emptyItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido, codigo_produto, nome_produto, quantidade')
    .in('id_pedido', allIds)
    .or('nome_produto.eq.Sem descrição,codigo_produto.is.null,quantidade.eq.0');

  if (emptyItems && emptyItems.length > 0) {
    console.log(`   ⚠️  Encontrados ${emptyItems.length} itens com dados vazios`);
    console.log(`   Primeiros 5 exemplos:`);
    emptyItems.slice(0, 5).forEach(item => {
      console.log(`      - ID Pedido: ${item.id_pedido}`);
      console.log(`        Código: ${item.codigo_produto || 'NULL'}`);
      console.log(`        Nome: ${item.nome_produto}`);
      console.log(`        Qtd: ${item.quantidade}`);
      console.log();
    });
  } else {
    console.log(`   ✅ Nenhum item com dados vazios encontrado`);
  }
}

checkPedidosWithPartialItems().catch(console.error);
