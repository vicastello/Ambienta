#!/usr/bin/env tsx
/**
 * Encontra um pedido específico sem itens
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function findOrderWithoutItems() {
  console.log('Buscando pedidos sem itens...');

  const pageSize = 1000;

  // Buscar todos os pedidos (paginado)
  let allOrders: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao, raw, raw_payload')
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

  console.log(`Total de pedidos: ${allOrders.length}`);

  // Buscar todos os itens dos pedidos (paginado em batches de 1000 pedidos x 1000 itens)
  const orderIds = allOrders.map((o) => o.id);
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

  console.log(`Pedidos sem itens: ${ordersWithoutItems.length}`);

  if (ordersWithoutItems.length === 0) {
    console.log('✅ Todos os pedidos têm itens!');
    return;
  }

  // Pegar os primeiros 10
  const sample = ordersWithoutItems.slice(0, 10);

  console.log();
  console.log('Exemplos de pedidos sem itens:');
  sample.forEach((order, idx) => {
    console.log();
    console.log(`${idx + 1}. ID: ${order.id} | Tiny ID: ${order.tiny_id} | Número: ${order.numero_pedido}`);
    console.log(`   Data: ${order.data_criacao}`);

    // Verificar se tem itens no raw
    const raw = order.raw || order.raw_payload;
    if (raw) {
      const itensRaw = Array.isArray(raw.itens)
        ? raw.itens
        : Array.isArray(raw.pedido?.itens)
          ? raw.pedido.itens
          : Array.isArray(raw.pedido?.itensPedido)
            ? raw.pedido.itensPedido
            : [];

      console.log(`   Itens no raw: ${itensRaw.length}`);

      if (itensRaw.length > 0) {
        console.log(`   ATENÇÃO: Tem ${itensRaw.length} itens no raw mas não estão na tabela!`);
      }
    } else {
      console.log(`   Sem raw payload`);
    }
  });
}

findOrderWithoutItems();
