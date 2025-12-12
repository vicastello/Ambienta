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

  // Sincronizar (apenas alguns para teste)
  const toSync = ordersWithoutItems.slice(0, 5); // Apenas os primeiros 5 para teste
  console.log(`2️⃣  Sincronizando ${toSync.length} pedidos (teste)...`);
  console.log();

  const accessToken = await getAccessTokenFromDbOrRefresh();

  let sucesso = 0;
  let falhas = 0;

  for (const order of toSync) {
    console.log(`   Pedido ${order.numero_pedido} (ID: ${order.tiny_id})...`);

    try {
      const numItens = await salvarItensPedido(
        accessToken,
        order.tiny_id,
        order.id,
        { context: 'force_sync_test' }
      );

      if (numItens !== null && numItens > 0) {
        console.log(`   ✓ ${numItens} itens salvos`);
        sucesso++;
      } else {
        console.log(`   ⚠️  0 itens retornados`);
        falhas++;
      }
    } catch (error: any) {
      console.log(`   ✗ Erro: ${error.message}`);
      falhas++;
    }

    // Delay entre pedidos
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 segundos
  }

  console.log();
  console.log('='.repeat(80));
  console.log('RESULTADO');
  console.log('='.repeat(80));
  console.log();
  console.log(`✓ Sucesso: ${sucesso}`);
  console.log(`✗ Falhas: ${falhas}`);
  console.log();
}

forceSyncWithApi();
