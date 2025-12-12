#!/usr/bin/env tsx
/**
 * Monitora o progresso da sincronização
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function monitorSync() {
  console.log('Monitorando sincronização...');
  console.log();

  // Buscar todos os pedidos
  let allOrders: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido')
      .gte('data_criacao', '2025-11-01')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;
    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Buscar itens
  const orderIds = allOrders.map(o => o.id);
  let allItems: any[] = [];

  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);

    if (data) {
      allItems = allItems.concat(data);
    }
  }

  const idsWithItems = new Set(allItems.map(i => i.id_pedido));
  const pedidosComItens = allOrders.filter(o => idsWithItems.has(o.id)).length;
  const pedidosSemItens = allOrders.length - pedidosComItens;

  console.log('STATUS ATUAL:');
  console.log('-'.repeat(60));
  console.log(`Total de pedidos: ${allOrders.length}`);
  console.log(`Pedidos COM itens: ${pedidosComItens} (${(pedidosComItens / allOrders.length * 100).toFixed(1)}%)`);
  console.log(`Pedidos SEM itens: ${pedidosSemItens} (${(pedidosSemItens / allOrders.length * 100).toFixed(1)}%)`);
  console.log();

  // Contar total de itens e SKUs
  const { count: totalItens } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*', { count: 'exact', head: true });

  const { count: itensComSku } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*', { count: 'exact', head: true })
    .not('codigo_produto', 'is', null);

  console.log(`Total de itens: ${totalItens}`);
  console.log(`Itens com SKU: ${itensComSku} (${totalItens ? (itensComSku! / totalItens * 100).toFixed(2) : 0}%)`);
  console.log();

  if (pedidosSemItens > 0) {
    console.log(`Faltam ${pedidosSemItens} pedidos para sincronizar`);
    console.log(`Tempo estimado: ~${Math.ceil(pedidosSemItens * 2 / 60)} minutos`);
  } else {
    console.log('✅ TODOS os pedidos foram sincronizados!');
  }
}

monitorSync();
