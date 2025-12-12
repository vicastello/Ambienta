#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function analiseCompleta() {
  console.log('='.repeat(80));
  console.log('ANÁLISE COMPLETA - PEDIDOS DESDE 01/11/2025');
  console.log('='.repeat(80));
  console.log();

  // 1. TOTAL DE PEDIDOS
  console.log('1️⃣  PEDIDOS');
  console.log('-'.repeat(80));

  // Buscar TODOS os pedidos (sem limit)
  let allOrders: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao')
      .gte('data_criacao', '2025-11-01')
      .order('data_criacao', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Erro ao buscar pedidos:', error);
      return;
    }

    if (!data || data.length === 0) break;

    allOrders = allOrders.concat(data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const ordersError = null;

  if (ordersError) {
    console.error('Erro ao buscar pedidos:', ordersError);
    return;
  }

  console.log(`Total de pedidos desde 01/11/2025: ${allOrders?.length || 0}`);
  console.log();

  if (!allOrders || allOrders.length === 0) {
    console.log('❌ Nenhum pedido encontrado!');
    return;
  }

  // 2. VERIFICAR ITENS PARA CADA PEDIDO
  console.log('2️⃣  ITENS DOS PEDIDOS');
  console.log('-'.repeat(80));

  const orderIds = allOrders.map(o => o.id);

  // Buscar itens em lotes (in clause tem limite)
  let allItems: any[] = [];
  const batchSize = 1000;

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);

    const { data, error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id, id_pedido, id_produto_tiny, codigo_produto, nome_produto')
      .in('id_pedido', batch);

    if (error) {
      console.error(`Erro ao buscar itens do lote ${i / batchSize + 1}:`, error);
      continue;
    }

    if (data) {
      allItems = allItems.concat(data);
    }
  }

  // Agrupar itens por pedido
  const itemsByOrder = new Map<number, any[]>();
  allItems?.forEach(item => {
    const items = itemsByOrder.get(item.id_pedido) || [];
    items.push(item);
    itemsByOrder.set(item.id_pedido, items);
  });

  const ordersWithItems = new Set(itemsByOrder.keys());
  const ordersWithoutItems = allOrders.filter(o => !ordersWithItems.has(o.id));

  console.log(`Pedidos COM itens: ${ordersWithItems.size}`);
  console.log(`Pedidos SEM itens: ${ordersWithoutItems.length}`);
  console.log();

  // 3. ANÁLISE DE SKUs
  console.log('3️⃣  ANÁLISE DE SKUs');
  console.log('-'.repeat(80));

  const totalItems = allItems?.length || 0;
  const itemsWithSku = allItems?.filter(i => i.codigo_produto) || [];
  const itemsWithoutSku = allItems?.filter(i => !i.codigo_produto) || [];

  console.log(`Total de itens: ${totalItems}`);
  console.log(`Itens COM SKU: ${itemsWithSku.length}`);
  console.log(`Itens SEM SKU: ${itemsWithoutSku.length}`);

  const percentage = totalItems > 0
    ? ((itemsWithSku.length / totalItems) * 100).toFixed(2)
    : '0.00';

  console.log(`Percentual com SKU: ${percentage}%`);
  console.log();

  // 4. EXEMPLOS DE ITENS SEM SKU
  if (itemsWithoutSku.length > 0) {
    console.log('4️⃣  EXEMPLOS DE ITENS SEM SKU (primeiros 10)');
    console.log('-'.repeat(80));

    itemsWithoutSku.slice(0, 10).forEach((item, idx) => {
      console.log(`${idx + 1}. ID: ${item.id} | Produto ID: ${item.id_produto_tiny || 'NULL'}`);
      console.log(`   Nome: ${item.nome_produto}`);
      console.log();
    });
  }

  // 5. ESTATÍSTICAS DETALHADAS
  console.log('5️⃣  ESTATÍSTICAS DETALHADAS');
  console.log('-'.repeat(80));

  // Contar itens por pedido
  const itemCounts = new Map<number, number>();
  allItems?.forEach(item => {
    itemCounts.set(item.id_pedido, (itemCounts.get(item.id_pedido) || 0) + 1);
  });

  const pedidosCom1Item = Array.from(itemCounts.values()).filter(c => c === 1).length;
  const pedidosComMais1Item = Array.from(itemCounts.values()).filter(c => c > 1).length;

  console.log(`Pedidos com 1 item: ${pedidosCom1Item}`);
  console.log(`Pedidos com mais de 1 item: ${pedidosComMais1Item}`);
  console.log();

  // 6. RESUMO FINAL
  console.log('='.repeat(80));
  console.log('RESUMO FINAL');
  console.log('='.repeat(80));
  console.log();
  console.log(`✓ Total de pedidos: ${allOrders.length}`);
  console.log(`✓ Pedidos sincronizados (com itens): ${ordersWithItems.size} (${((ordersWithItems.size / allOrders.length) * 100).toFixed(1)}%)`);
  console.log(`✗ Pedidos não sincronizados (sem itens): ${ordersWithoutItems.length} (${((ordersWithoutItems.length / allOrders.length) * 100).toFixed(1)}%)`);
  console.log();
  console.log(`✓ Total de itens cadastrados: ${totalItems}`);
  console.log(`✓ Itens com SKU: ${itemsWithSku.length} (${percentage}%)`);
  console.log(`✗ Itens sem SKU: ${itemsWithoutSku.length} (${(100 - parseFloat(percentage)).toFixed(2)}%)`);
  console.log();

  // Resposta clara
  if (ordersWithItems.size === allOrders.length && itemsWithSku.length === totalItems) {
    console.log('✅ TODOS os pedidos possuem itens e TODOS os itens possuem SKU!');
  } else if (ordersWithItems.size === allOrders.length) {
    console.log('⚠️  TODOS os pedidos possuem itens, MAS nem todos os itens têm SKU.');
  } else if (itemsWithSku.length === totalItems && totalItems > 0) {
    console.log('⚠️  Alguns pedidos ainda NÃO têm itens, MAS todos os itens existentes têm SKU.');
  } else {
    console.log('❌ NEM TODOS os pedidos possuem itens E nem todos os itens têm SKU.');
  }
  console.log();
}

analiseCompleta();
