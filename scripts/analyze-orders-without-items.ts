#!/usr/bin/env tsx
/**
 * Analisa pedidos sem itens para entender por que não têm
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function analyzeOrdersWithoutItems() {
  console.log('Analisando pedidos sem itens...');

  // Buscar todos os pedidos (paginado)
  let allOrders: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao, situacao, raw, raw_payload')
      .gte('data_criacao', '2025-11-01')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Erro:', error);
      return;
    }

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Buscar itens (paginado em batches de 1000 pedidos x 1000 itens)
  const orderIds = allOrders.map(o => o.id);
  let allItems: any[] = [];

  for (let i = 0; i < orderIds.length; i += pageSize) {
    const batch = orderIds.slice(i, i + pageSize);
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id_pedido')
        .in('id_pedido', batch)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Erro ao buscar itens:', error);
        return;
      }

      if (!data || data.length === 0) break;
      allItems = allItems.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }

  const idsWithItems = new Set(allItems.map(i => i.id_pedido));
  const ordersWithoutItems = allOrders.filter(o => !idsWithItems.has(o.id));

  console.log(`Total de pedidos: ${allOrders.length}`);
  console.log(`Pedidos sem itens: ${ordersWithoutItems.length}`);
  console.log();

  // Agrupar por situação
  const bySituacao = new Map<string, number>();
  ordersWithoutItems.forEach(order => {
    const situacao = order.situacao || 'NULL';
    bySituacao.set(situacao, (bySituacao.get(situacao) || 0) + 1);
  });

  console.log('DISTRIBUIÇÃO POR SITUAÇÃO:');
  console.log('-'.repeat(80));
  Array.from(bySituacao.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([situacao, count]) => {
      console.log(`${situacao}: ${count} pedidos (${((count / ordersWithoutItems.length) * 100).toFixed(1)}%)`);
    });

  console.log();


  // Mostrar exemplos de cada situação principal
  console.log('EXEMPLOS POR SITUAÇÃO:');
  console.log('-'.repeat(80));

  Array.from(bySituacao.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([situacao, count]) => {
      console.log();
      console.log(`${situacao} (${count} pedidos):`);

      const exemplos = ordersWithoutItems
        .filter(o => (o.situacao || 'NULL') === situacao)
        .slice(0, 3);

      exemplos.forEach((order, idx) => {
        console.log(`  ${idx + 1}. Nº ${order.numero_pedido} | ID: ${order.tiny_id}`);
      });
    });

  console.log();
  console.log('='.repeat(80));
  console.log('CONCLUSÃO:');
  console.log('='.repeat(80));
  console.log();
  console.log('Os pedidos sem itens estão distribuídos pelas situações acima.');
  console.log('Provavelmente são pedidos cancelados, vazios, ou em processo de criação.');
}

analyzeOrdersWithoutItems();
