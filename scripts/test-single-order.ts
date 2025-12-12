#!/usr/bin/env tsx
/**
 * Testa a busca de detalhes de um único pedido sem itens
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { obterPedidoDetalhado } from '../lib/tinyApi';

async function testSingleOrder() {
  // Pegar o primeiro pedido sem itens
  const { data: orderWithoutItems } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, raw, raw_payload')
    .gte('data_criacao', '2025-11-01')
    .limit(1);

  if (!orderWithoutItems || orderWithoutItems.length === 0) {
    console.log('Nenhum pedido encontrado');
    return;
  }

  // Verificar se tem itens
  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*')
    .eq('id_pedido', orderWithoutItems[0].id);

  if (items && items.length > 0) {
    console.log('Este pedido já tem itens, tentando outro...');

    // Buscar pedido sem itens
    const { data: allOrders } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido')
      .gte('data_criacao', '2025-11-01')
      .limit(100);

    const orderIds = allOrders?.map(o => o.id) || [];
    const { data: allItems } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', orderIds);

    const idsWithItems = new Set(allItems?.map(i => i.id_pedido) || []);
    const orderWithoutItems2 = allOrders?.find(o => !idsWithItems.has(o.id));

    if (!orderWithoutItems2) {
      console.log('Não encontrei pedido sem itens nos primeiros 100');
      return;
    }

    // Buscar detalhes completos
    const { data: fullOrder } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, raw, raw_payload')
      .eq('id', orderWithoutItems2.id)
      .single();

    console.log('='.repeat(80));
    console.log('TESTANDO PEDIDO SEM ITENS');
    console.log('='.repeat(80));
    console.log();
    console.log('ID Local:', fullOrder.id);
    console.log('ID Tiny:', fullOrder.tiny_id);
    console.log('Número:', fullOrder.numero_pedido);
    console.log();

    // Ver o que tem no raw
    const raw = fullOrder.raw || fullOrder.raw_payload;
    if (raw) {
      console.log('RAW PAYLOAD:');
      console.log(JSON.stringify(raw, null, 2).substring(0, 500));
      console.log();

      // Verificar se tem itens no raw
      const itensRaw = Array.isArray(raw.itens)
        ? raw.itens
        : Array.isArray(raw.pedido?.itens)
          ? raw.pedido.itens
          : Array.isArray(raw.pedido?.itensPedido)
            ? raw.pedido.itensPedido
            : [];

      console.log('Itens no raw payload:', itensRaw.length);
      if (itensRaw.length > 0) {
        console.log('Primeiro item:', JSON.stringify(itensRaw[0], null, 2).substring(0, 300));
      }
    }

    // Tentar buscar da API
    console.log();
    console.log('Tentando buscar detalhes da API...');
    const accessToken = await getAccessTokenFromDbOrRefresh();

    try {
      const pedidoDetalhado = await obterPedidoDetalhado(accessToken, fullOrder.tiny_id, 'test');
      console.log('Resposta da API:', JSON.stringify(pedidoDetalhado, null, 2).substring(0, 500));

      const itensApi = Array.isArray((pedidoDetalhado as any).itens)
        ? (pedidoDetalhado as any).itens
        : Array.isArray((pedidoDetalhado as any).pedido?.itens)
          ? (pedidoDetalhado as any).pedido.itens
          : Array.isArray((pedidoDetalhado as any).pedido?.itensPedido)
            ? (pedidoDetalhado as any).pedido.itensPedido
            : [];

      console.log('Itens encontrados na API:', itensApi.length);
    } catch (error: any) {
      console.error('Erro ao buscar da API:', error.message);
    }

    return;
  }

  console.log('Primeiro pedido já não tem itens, perfeito!');
  console.log('ID Local:', orderWithoutItems[0].id);
  console.log('ID Tiny:', orderWithoutItems[0].tiny_id);
  console.log('Número:', orderWithoutItems[0].numero_pedido);

  // Ver o raw payload
  const raw = orderWithoutItems[0].raw || orderWithoutItems[0].raw_payload;
  if (raw) {
    console.log();
    console.log('RAW PAYLOAD (primeiros 500 chars):');
    console.log(JSON.stringify(raw, null, 2).substring(0, 500));
  }
}

testSingleOrder();
