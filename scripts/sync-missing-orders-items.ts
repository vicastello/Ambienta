#!/usr/bin/env tsx
/**
 * Sincroniza itens dos pedidos que ainda não têm itens desde 01/11/2025
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

async function syncMissingOrdersItems() {
  console.log('='.repeat(80));
  console.log('SINCRONIZAÇÃO DE ITENS - PEDIDOS FALTANTES');
  console.log('='.repeat(80));
  console.log();

  // Buscar TODOS os pedidos desde 01/11/2025
  console.log('1️⃣  Buscando pedidos desde 01/11/2025...');

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

  // Verificar quais já têm itens
  console.log('2️⃣  Identificando pedidos sem itens...');

  const orderIds = allOrders.map(o => o.id);
  let itemsByOrder = new Set<number>();
  const batchSize = 1000;

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);

    data?.forEach(item => itemsByOrder.add(item.id_pedido));
  }

  const ordersWithoutItems = allOrders.filter(o => !itemsByOrder.has(o.id));

  console.log(`   Pedidos com itens: ${itemsByOrder.size}`);
  console.log(`   Pedidos SEM itens: ${ordersWithoutItems.length}`);
  console.log();

  if (ordersWithoutItems.length === 0) {
    console.log('✅ Todos os pedidos já têm itens!');
    return;
  }

  // Sincronizar
  console.log(`3️⃣  Sincronizando ${ordersWithoutItems.length} pedidos...`);
  console.log();

  const accessToken = await getAccessTokenFromDbOrRefresh();
  const tinyIds = ordersWithoutItems.map(o => o.tiny_id).filter(Boolean) as number[];

  // Processar em lotes de 100
  const processBatchSize = 100;
  let totalSucesso = 0;
  let totalFalhas = 0;
  let totalItens = 0;

  for (let i = 0; i < tinyIds.length; i += processBatchSize) {
    const batch = tinyIds.slice(i, i + processBatchSize);
    const batchNum = Math.floor(i / processBatchSize) + 1;
    const totalBatches = Math.ceil(tinyIds.length / processBatchSize);

    console.log(`   Lote ${batchNum}/${totalBatches} (${batch.length} pedidos)...`);

    const result = await sincronizarItensPorPedidos(accessToken, batch, {
      delayMs: 2000, // 2 segundos entre requisições
      retries: 2,
      force: false,
    });

    totalSucesso += result.sucesso;
    totalFalhas += result.falhas;
    totalItens += result.totalItens;

    console.log(`   ✓ ${result.sucesso} sucesso | ✗ ${result.falhas} falhas | ${result.totalItens} itens`);

    // Delay entre lotes
    if (i + processBatchSize < tinyIds.length) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('RESULTADO FINAL');
  console.log('='.repeat(80));
  console.log();
  console.log(`✓ Sincronizações bem-sucedidas: ${totalSucesso}`);
  console.log(`✗ Falhas: ${totalFalhas}`);
  console.log(`📦 Total de itens sincronizados: ${totalItens}`);
  console.log();

  // Executar fix de SKUs após sincronização
  if (totalItens > 0) {
    console.log('4️⃣  Atualizando SKUs dos itens recém-sincronizados...');
    console.log();

    const { execSync } = require('child_process');
    execSync('npx tsx scripts/fix-missing-codigo-produto.ts', { stdio: 'inherit' });
  }
}

syncMissingOrdersItems()
  .then(() => {
    console.log('='.repeat(80));
    console.log('✅ Sincronização concluída!');
    console.log('='.repeat(80));
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });
