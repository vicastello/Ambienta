#!/usr/bin/env tsx
/**
 * Script para sincronizar itens dos pedidos do Tiny desde 01/11/2024
 * que ainda não têm itens cadastrados
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

async function syncTinyItemsSinceNov() {
  console.log('='.repeat(80));
  console.log('SINCRONIZAÇÃO DE ITENS DO TINY DESDE 01/11/2024');
  console.log('='.repeat(80));
  console.log();

  const startDate = '2024-11-01';

  // 1. Buscar todos os pedidos desde 01/11
  console.log(`1️⃣  Buscando pedidos desde ${startDate}...`);

  const { data: tinyOrders, error: ordersError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, data_criacao')
    .gte('data_criacao', startDate)
    .order('data_criacao', { ascending: true });

  if (ordersError) {
    console.error('   Erro ao buscar pedidos:', ordersError);
    process.exit(1);
  }

  if (!tinyOrders || tinyOrders.length === 0) {
    console.log('   Nenhum pedido encontrado desde essa data');
    return;
  }

  console.log(`   Encontrados ${tinyOrders.length} pedidos`);
  console.log();

  // 2. Verificar quais já têm itens
  console.log('2️⃣  Verificando pedidos sem itens...');

  const orderIds = tinyOrders.map(o => o.id);
  const { data: existingItems, error: itemsError } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orderIds);

  if (itemsError) {
    console.error('   Erro ao verificar itens:', itemsError);
    process.exit(1);
  }

  const ordersWithItems = new Set(existingItems?.map(i => i.id_pedido) || []);
  const ordersWithoutItems = tinyOrders.filter(o => !ordersWithItems.has(o.id));

  console.log(`   ${ordersWithItems.size} pedidos já têm itens`);
  console.log(`   ${ordersWithoutItems.length} pedidos precisam sincronizar itens`);
  console.log();

  if (ordersWithoutItems.length === 0) {
    console.log('✓ Todos os pedidos já têm itens sincronizados!');
    return;
  }

  // 3. Sincronizar itens
  console.log(`3️⃣  Sincronizando itens de ${ordersWithoutItems.length} pedidos...`);
  console.log('   (Isso pode levar alguns minutos devido ao rate limit da API do Tiny)');
  console.log();

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    const tinyIds = ordersWithoutItems.map(o => o.tiny_id).filter(Boolean) as number[];

    // Process in batches of 100 to avoid overwhelming the API
    const batchSize = 100;
    let totalProcessados = 0;
    let totalSucesso = 0;
    let totalFalhas = 0;
    let totalItens = 0;

    for (let i = 0; i < tinyIds.length; i += batchSize) {
      const batch = tinyIds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(tinyIds.length / batchSize);

      console.log(`   Processando lote ${batchNum}/${totalBatches} (${batch.length} pedidos)...`);

      const result = await sincronizarItensPorPedidos(accessToken, batch, {
        delayMs: 1000, // 1 second between requests to respect rate limits
        retries: 2,
        force: false,
        context: 'sync_items_since_nov',
      });

      totalProcessados += result.processados;
      totalSucesso += result.sucesso;
      totalFalhas += result.falhas;
      totalItens += result.totalItens;

      console.log(`   Lote ${batchNum}: ${result.sucesso} sucesso, ${result.falhas} falhas, ${result.totalItens} itens`);
      console.log();

      // Small delay between batches
      if (i + batchSize < tinyIds.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

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
      console.log('⚠️  Alguns pedidos falharam. Você pode executar o script novamente');
      console.log('   para tentar sincronizar os pedidos restantes.');
    }

  } catch (error) {
    console.error('❌ Erro durante sincronização:', error);
    process.exit(1);
  }
}

syncTinyItemsSinceNov()
  .then(() => {
    console.log('='.repeat(80));
    console.log('✅ Sincronização concluída!');
    console.log('='.repeat(80));
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
