#!/usr/bin/env tsx
/**
 * Sincroniza itens de TODOS os pedidos que ainda não têm itens desde 01/11/2025
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

async function syncAllMissingItems() {
  console.log('='.repeat(80));
  console.log('SINCRONIZAÇÃO COMPLETA DE ITENS FALTANTES');
  console.log('='.repeat(80));
  console.log();

  // Buscar TODOS os pedidos desde 01/11/2025
  console.log('1️⃣  Buscando todos os pedidos...');

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
      console.error('Erro ao buscar pedidos:', error);
      return;
    }

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`   Total de pedidos: ${allOrders.length}`);
  console.log();

  // Verificar quais pedidos já têm itens
  console.log('2️⃣  Identificando pedidos sem itens...');

  const orderIds = allOrders.map(o => o.id);
  let allItems: any[] = [];
  const batchSize = 1000;

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);

    if (data) {
      allItems = allItems.concat(data);
    }
  }

  const ordersWithItems = new Set(allItems.map(i => i.id_pedido));
  const ordersWithoutItems = allOrders.filter(o => !ordersWithItems.has(o.id));

  console.log(`   Pedidos com itens: ${ordersWithItems.size}`);
  console.log(`   Pedidos sem itens: ${ordersWithoutItems.length}`);
  console.log();

  if (ordersWithoutItems.length === 0) {
    console.log('✅ Todos os pedidos já têm itens!');
    return;
  }

  // Sincronizar itens
  console.log(`3️⃣  Sincronizando ${ordersWithoutItems.length} pedidos...`);
  console.log('   (Processando com delay de 1.5s entre requisições)');
  console.log();

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    const tinyIds = ordersWithoutItems
      .map(o => o.tiny_id)
      .filter(Boolean) as number[];

    // Processar em lotes de 50
    const batchSize = 50;
    let totalProcessados = 0;
    let totalSucesso = 0;
    let totalFalhas = 0;
    let totalItens = 0;

    for (let i = 0; i < tinyIds.length; i += batchSize) {
      const batch = tinyIds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(tinyIds.length / batchSize);

      console.log(`   Lote ${batchNum}/${totalBatches} (${batch.length} pedidos)...`);

      const result = await sincronizarItensPorPedidos(accessToken, batch, {
        delayMs: 1500, // 1.5 segundos entre requests
        retries: 1,
        force: false,
        context: 'sync_all_missing',
      });

      totalProcessados += result.processados;
      totalSucesso += result.sucesso;
      totalFalhas += result.falhas;
      totalItens += result.totalItens;

      console.log(`   ✓ ${result.sucesso} sucesso, ✗ ${result.falhas} falhas, ${result.totalItens} itens`);

      // Delay entre lotes
      if (i + batchSize < tinyIds.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log();
    console.log('='.repeat(80));
    console.log('RESULTADO FINAL');
    console.log('='.repeat(80));
    console.log();
    console.log(`✓ Pedidos processados: ${totalProcessados}`);
    console.log(`✓ Sincronizações bem-sucedidas: ${totalSucesso}`);
    console.log(`✗ Falhas: ${totalFalhas}`);
    console.log(`📦 Total de itens sincronizados: ${totalItens}`);
    console.log();

    if (totalFalhas > 0) {
      console.log('⚠️  Alguns pedidos falharam. Execute novamente para reprocessar.');
    } else {
      console.log('✅ Todos os pedidos foram sincronizados com sucesso!');
    }

  } catch (error) {
    console.error('❌ Erro durante sincronização:', error);
    process.exit(1);
  }
}

syncAllMissingItems()
  .then(() => {
    console.log('='.repeat(80));
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
