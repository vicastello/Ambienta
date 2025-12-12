#!/usr/bin/env tsx
/**
 * Verifica o resultado da sincronização
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function verifySyncResult() {
  console.log('='.repeat(80));
  console.log('VERIFICAÇÃO DO RESULTADO DA SINCRONIZAÇÃO');
  console.log('='.repeat(80));
  console.log();

  // Buscar TODOS os pedidos desde 01/11/2025
  let allOrders: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao')
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

  console.log(`Total de pedidos desde 01/11/2025: ${allOrders.length}`);
  console.log();

  // Buscar TODOS os itens desses pedidos
  const orderIds = allOrders.map(o => o.id);
  let allItems: any[] = [];

  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido, codigo_produto')
      .in('id_pedido', batch);

    if (data) {
      allItems = allItems.concat(data);
    }
  }

  const idsWithItems = new Set(allItems.map(i => i.id_pedido));
  const pedidosComItens = allOrders.filter(o => idsWithItems.has(o.id));
  const pedidosSemItens = allOrders.filter(o => !idsWithItems.has(o.id));

  console.log('RESULTADO:');
  console.log('-'.repeat(80));
  console.log(`Pedidos COM itens: ${pedidosComItens.length} (${(pedidosComItens.length / allOrders.length * 100).toFixed(1)}%)`);
  console.log(`Pedidos SEM itens: ${pedidosSemItens.length} (${(pedidosSemItens.length / allOrders.length * 100).toFixed(1)}%)`);
  console.log();
  console.log(`Total de itens: ${allItems.length}`);

  const itensComSku = allItems.filter(i => i.codigo_produto);
  const itensSemSku = allItems.filter(i => !i.codigo_produto);

  console.log(`Itens COM SKU: ${itensComSku.length} (${(itensComSku.length / allItems.length * 100).toFixed(2)}%)`);
  console.log(`Itens SEM SKU: ${itensSemSku.length} (${(itensSemSku.length / allItems.length * 100).toFixed(2)}%)`);
  console.log();

  if (pedidosSemItens.length > 0) {
    console.log('PEDIDOS SEM ITENS (primeiros 20):');
    console.log('-'.repeat(80));
    pedidosSemItens.slice(0, 20).forEach((p, idx) => {
      console.log(`${idx + 1}. Pedido ${p.numero_pedido} | ID Tiny: ${p.tiny_id} | Data: ${p.data_criacao}`);
    });
    console.log();

    console.log(`⚠️  Ainda há ${pedidosSemItens.length} pedidos sem itens.`);
  } else {
    console.log('✅ TODOS OS PEDIDOS TÊM ITENS!');
  }
}

verifySyncResult();
