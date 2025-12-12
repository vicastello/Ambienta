#!/usr/bin/env tsx
/**
 * Força a sincronização dos pedidos sem itens buscando direto da API do Tiny
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { salvarItensPedido } from '../lib/pedidoItensHelper';

async function forceSyncWithApi() {
  console.log('='.repeat(80));
  console.log('FORÇANDO SINCRONIZAÇÃO COM API DO TINY');
  console.log('='.repeat(80));
  console.log();

  // Buscar pedidos sem itens
  console.log('1️⃣  Buscando pedidos sem itens...');

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

    if (error) {
      console.error('Erro:', error);
      return;
    }

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
  const ordersWithoutItems = allOrders.filter(o => !idsWithItems.has(o.id));

  console.log(`   Pedidos sem itens: ${ordersWithoutItems.length}`);
  console.log();

  if (ordersWithoutItems.length === 0) {
    console.log('✅ Todos os pedidos já têm itens!');
    return;
  }

  // Sincronizar TODOS os pedidos
  const toSync = ordersWithoutItems; // TODOS os pedidos sem itens
  console.log(`2️⃣  Sincronizando ${toSync.length} pedidos...`);
  console.log(`   (Estimativa: ~${Math.ceil(toSync.length * 0.6 / 60)} minutos)`);
  console.log();

  const accessToken = await getAccessTokenFromDbOrRefresh();

  let sucesso = 0;
  let vazios = 0;
  let falhas = 0;

  for (let i = 0; i < toSync.length; i++) {
    const order = toSync[i];
    console.log(`[${i + 1}/${toSync.length}] Pedido ${order.numero_pedido} (Tiny: ${order.tiny_id})`);

    try {
      const numItens = await salvarItensPedido(
        accessToken,
        order.tiny_id,
        order.id,
        { context: 'backfill_complete' }
      );

      if (numItens === null) {
        console.log(`   ✗ Falha ao buscar`);
        falhas++;
      } else if (numItens === 0) {
        console.log(`   ○ Vazio/cancelado`);
        vazios++;
      } else {
        console.log(`   ✓ ${numItens} itens`);
        sucesso++;
      }
    } catch (error: any) {
      console.log(`   ✗ Erro: ${error.message}`);
      falhas++;
    }

    // Delay entre pedidos (600ms)
    if (i < toSync.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    // Progresso a cada 50
    if ((i + 1) % 50 === 0) {
      console.log();
      console.log(`   📊 Progresso: ${sucesso} OK | ${vazios} vazios | ${falhas} falhas`);
      console.log();
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('RESULTADO FINAL');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total processado: ${toSync.length}`);
  console.log(`✓ Sucesso: ${sucesso} pedidos`);
  console.log(`○ Vazios: ${vazios} pedidos`);
  console.log(`✗ Falhas: ${falhas} pedidos`);
  console.log();

  if (sucesso > 0) {
    console.log(`🎉 ${sucesso} pedidos agora têm itens cadastrados!`);
  }
}

forceSyncWithApi();
