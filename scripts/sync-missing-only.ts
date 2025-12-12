import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';

const BATCH_SIZE = 30;
const DELAY_BETWEEN_BATCHES_MS = 45000; // 45s
const MAX_RUNTIME_HOURS = 12;
const MAX_RUNTIME_MS = MAX_RUNTIME_HOURS * 60 * 60 * 1000;

interface SyncStats {
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  totalItems: number;
  startTime: number;
  errors429: number;
  retriesSuccess: number;
}

async function getMissingOrders(): Promise<{ id: number; tiny_id: number }[]> {
  console.log('📊 Buscando todos os pedidos...');
  
  // 1. Buscar TODOS os pedidos desde 01/11
  let allOrders: { id: number; tiny_id: number }[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: orders, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id')
      .gte('data_criacao', '2025-11-01')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Erro ao buscar pedidos:', error);
      break;
    }

    if (!orders || orders.length === 0) {
      hasMore = false;
    } else {
      allOrders = allOrders.concat(orders);
      hasMore = orders.length === pageSize;
      page++;
    }
  }

  console.log(`✅ Total de pedidos encontrados: ${allOrders.length}`);

  // 2. Buscar TODOS os itens
  console.log('📊 Buscando todos os itens...');
  let allItems: { id_pedido: number }[] = [];
  page = 0;
  hasMore = true;

  while (hasMore) {
    const { data: items, error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Erro ao buscar itens:', error);
      break;
    }

    if (!items || items.length === 0) {
      hasMore = false;
    } else {
      allItems = allItems.concat(items);
      hasMore = items.length === pageSize;
      page++;
    }
  }

  console.log(`✅ Total de itens encontrados: ${allItems.length}`);

  // 3. Filtrar pedidos que NÃO têm itens
  const orderIdsSet = new Set(allOrders.map(o => o.id));
  const filteredItems = allItems.filter(item => orderIdsSet.has(item.id_pedido));
  const withItems = new Set(filteredItems.map(x => x.id_pedido));

  const missing = allOrders.filter(o => !withItems.has(o.id));

  console.log(`✅ Pedidos com produtos: ${withItems.size}`);
  console.log(`⏳ Pedidos SEM produtos: ${missing.length}`);

  return missing;
}

async function syncBatchWithRetry(
  accessToken: string,
  tinyIds: number[],
  batchNum: number,
  totalBatches: number,
  stats: SyncStats
): Promise<{ failedIds: number[] }> {
  const MAX_RETRIES = 15; // Aumentado para 15
  let attempt = 0;
  let failedIds: number[] = [];

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      if (attempt > 1) {
        const waitTime = Math.min(180000, 20000 * attempt); // Max 3min
        console.log(`  🔄 Tentativa ${attempt}/${MAX_RETRIES} após ${waitTime/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const result = await sincronizarItensPorPedidos(accessToken, tinyIds, { 
        force: true,
        delayMs: 1500, // 1.5s entre requisições
        retries: 15
      });

      stats.totalSuccess += result.sucesso;
      stats.totalItems += result.totalItens;

      console.log(`  ✅ Sucessos: ${result.sucesso}/${tinyIds.length}`);
      console.log(`  ❌ Falhas: ${result.falhas}`);
      console.log(`  📦 Itens: ${result.totalItens}`);

      if (result.falhas === 0) {
        if (attempt > 1) stats.retriesSuccess++;
        return { failedIds: [] };
      }

      stats.errors429++;
      stats.totalFailed += result.falhas;

      if (attempt < MAX_RETRIES) {
        console.log(`  ⚠️ ${result.falhas} pedidos falharam, retentando...`);
      } else {
        console.log(`  ❌ ${result.falhas} pedidos falharam após ${MAX_RETRIES} tentativas`);
        failedIds = tinyIds;
      }

    } catch (error: any) {
      stats.errors429++;
      console.log(`  ⚠️ Erro no lote ${batchNum}:`, error?.message || 'unknown');
      
      if (attempt >= MAX_RETRIES) {
        stats.totalFailed += tinyIds.length;
        failedIds = tinyIds;
        break;
      }
    }
  }

  return { failedIds };
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

async function syncMissingOnly() {
  console.log('🎯 SINCRONIZAÇÃO APENAS DOS PEDIDOS SEM PRODUTOS');
  console.log('═'.repeat(60));
  console.log(`⏰ Início: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`⏱️  Duração máxima: ${MAX_RUNTIME_HOURS} horas`);
  console.log(`📦 Tamanho do lote: ${BATCH_SIZE} pedidos`);
  console.log(`⏳ Delay entre lotes: ${DELAY_BETWEEN_BATCHES_MS/1000}s`);
  console.log(`⏱️  Delay entre requisições: 1500ms`);
  console.log('═'.repeat(60) + '\n');

  const stats: SyncStats = {
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalItems: 0,
    startTime: Date.now(),
    errors429: 0,
    retriesSuccess: 0
  };

  // 1. Buscar pedidos faltantes
  let missing = await getMissingOrders();
  
  if (missing.length === 0) {
    console.log('✅ Todos os pedidos já têm produtos!');
    return;
  }

  console.log(`\n🚀 Sincronizando ${missing.length} pedidos faltantes...\n`);

  // 2. Obter token
  let accessToken = await getAccessTokenFromDbOrRefresh();
  let lastTokenRefresh = Date.now();

  // 3. Processar em lotes
  const totalBatches = Math.ceil(missing.length / BATCH_SIZE);
  let batchNum = 0;
  let allFailedIds: number[] = [];

  for (let i = 0; i < missing.length && (Date.now() - stats.startTime) < MAX_RUNTIME_MS; i += BATCH_SIZE) {
    batchNum++;
    const batch = missing.slice(i, i + BATCH_SIZE);
    const tinyIds = batch.map(o => o.tiny_id);

    const elapsed = Date.now() - stats.startTime;
    const timeLeft = MAX_RUNTIME_MS - elapsed;
    const progressPct = ((i / missing.length) * 100).toFixed(1);
    
    console.log(`\n[Lote ${batchNum}/${totalBatches}] ${batch.length} pedidos (${progressPct}% completo)`);
    console.log(`⏱️  ${formatDuration(elapsed)} / ${formatDuration(timeLeft)} restante`);

    // Renovar token a cada 50 minutos
    if (Date.now() - lastTokenRefresh > 50 * 60 * 1000) {
      console.log('🔑 Renovando token de acesso...');
      accessToken = await getAccessTokenFromDbOrRefresh();
      lastTokenRefresh = Date.now();
    }

    const { failedIds } = await syncBatchWithRetry(accessToken, tinyIds, batchNum, totalBatches, stats);
    
    if (failedIds.length > 0) {
      allFailedIds.push(...failedIds);
    }

    stats.totalProcessed += batch.length;

    // Recarregar lista a cada 20 lotes
    if (batchNum % 20 === 0) {
      console.log('\n🔄 Recarregando lista de pedidos faltantes...');
      missing = await getMissingOrders();
      console.log(`📦 Ainda faltam: ${missing.length}\n`);
    }

    // Delay entre lotes
    if (i + BATCH_SIZE < missing.length) {
      console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES_MS/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  // 4. Relatório final
  const totalRuntime = Date.now() - stats.startTime;
  const finalMissing = await getMissingOrders();

  console.log('\n' + '═'.repeat(60));
  console.log('🏁 RELATÓRIO FINAL');
  console.log('═'.repeat(60));
  console.log(`⏰ Duração: ${formatDuration(totalRuntime)}`);
  console.log(`📦 Processados: ${stats.totalProcessed}`);
  console.log(`✅ Sucessos: ${stats.totalSuccess}`);
  console.log(`❌ Falhas: ${stats.totalFailed}`);
  console.log(`📊 Itens inseridos: ${stats.totalItems}`);
  console.log(`⚠️  Erros 429: ${stats.errors429}`);
  console.log(`🔄 Retries: ${stats.retriesSuccess}`);
  console.log(`\n📦 Ainda faltam: ${finalMissing.length} pedidos`);
  console.log('═'.repeat(60));
}

process.on('SIGINT', () => {
  console.log('\n⚠️  Interrompido');
  process.exit(0);
});

syncMissingOnly().catch(console.error);
