import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';

const MAX_REQUESTS_PER_MINUTE = 60; // Reduzido de 100 para 60
const BATCH_SIZE = 30; // Reduzido de 50 para 30
const DELAY_BETWEEN_BATCHES_MS = 45000; // Aumentado para 45s = ~40 req/min max
const MAX_RUNTIME_HOURS = 12; // Aumentado para 12 horas
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

async function getAllOrders(): Promise<{ id: number; tiny_id: number }[]> {
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

  return allOrders;
}

async function syncBatchWithRetry(
  accessToken: string,
  tinyIds: number[],
  batchNum: number,
  totalBatches: number,
  stats: SyncStats
): Promise<{ failedIds: number[] }> {
  const MAX_RETRIES = 10;
  let attempt = 0;
  let failedIds: number[] = [];

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      if (attempt > 1) {
        const waitTime = Math.min(120000, 15000 * attempt);
        console.log(`  🔄 Tentativa ${attempt}/${MAX_RETRIES} após ${waitTime/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const result = await sincronizarItensPorPedidos(accessToken, tinyIds, { 
        force: true, // FORCE = true para reprocessar mesmo se já existe
        delayMs: 1200, // Aumentado de 800 para 1200ms = ~50 req/min
        retries: 12 // Aumentado para 12 tentativas
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
      console.log(`  ⚠️ Erro no lote ${batchNum} - tentativa ${attempt}:`, error?.message || 'unknown');
      
      if (attempt >= MAX_RETRIES) {
        console.log(`  ❌ Lote ${batchNum} falhou completamente após ${MAX_RETRIES} tentativas`);
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

function printProgress(stats: SyncStats, total: number) {
  const elapsed = Date.now() - stats.startTime;
  const remaining = MAX_RUNTIME_MS - elapsed;
  const progressPct = ((stats.totalProcessed / total) * 100).toFixed(1);
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 PROGRESSO ATUAL');
  console.log('═'.repeat(60));
  console.log(`⏱️  Tempo decorrido: ${formatDuration(elapsed)}`);
  console.log(`⏳ Tempo restante: ${formatDuration(Math.max(0, remaining))}`);
  console.log(`📦 Processados: ${stats.totalProcessed}/${total} (${progressPct}%)`);
  console.log(`✅ Sucessos: ${stats.totalSuccess}`);
  console.log(`❌ Falhas: ${stats.totalFailed}`);
  console.log(`📊 Itens inseridos: ${stats.totalItems}`);
  console.log(`⚠️  Erros 429: ${stats.errors429}`);
  console.log(`🔄 Retries bem-sucedidos: ${stats.retriesSuccess}`);
  console.log('═'.repeat(60) + '\n');
}

async function syncAllOrders() {
  console.log('🌙 SINCRONIZAÇÃO COMPLETA - 12 HORAS (FORÇA TODOS - MODO LENTO)');
  console.log('═'.repeat(60));
  console.log(`⏰ Início: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`⏱️  Duração máxima: ${MAX_RUNTIME_HOURS} horas`);
  console.log(`🚦 Rate limit: ${MAX_REQUESTS_PER_MINUTE} req/min (CONSERVADOR)`);
  console.log(`📦 Tamanho do lote: ${BATCH_SIZE} pedidos`);
  console.log(`⏳ Delay entre lotes: ${DELAY_BETWEEN_BATCHES_MS/1000}s`);
  console.log(`⏱️  Delay entre requisições: 1200ms`);
  console.log(`🔥 FORCE MODE: Reprocessa TODOS os pedidos`);
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

  // 1. Buscar TODOS os pedidos
  console.log('🔍 Buscando TODOS os pedidos desde 01/11/2025...\n');
  let allOrders = await getAllOrders();
  
  console.log(`📦 Total de pedidos a processar: ${allOrders.length}\n`);
  
  if (allOrders.length === 0) {
    console.log('❌ Nenhum pedido encontrado');
    return;
  }

  // 2. Obter token
  let accessToken = await getAccessTokenFromDbOrRefresh();
  let lastTokenRefresh = Date.now();

  // 3. Processar em lotes
  const totalBatches = Math.ceil(allOrders.length / BATCH_SIZE);
  let batchNum = 0;
  let allFailedIds: number[] = [];

  for (let i = 0; i < allOrders.length && (Date.now() - stats.startTime) < MAX_RUNTIME_MS; i += BATCH_SIZE) {
    batchNum++;
    const batch = allOrders.slice(i, i + BATCH_SIZE);
    const tinyIds = batch.map(o => o.tiny_id);

    const elapsed = Date.now() - stats.startTime;
    const timeLeft = MAX_RUNTIME_MS - elapsed;
    
    console.log(`\n[Lote ${batchNum}/${totalBatches}] ${batch.length} pedidos`);
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
      console.log(`  ⚠️ ${failedIds.length} pedidos adicionados para retry posterior`);
    }

    stats.totalProcessed += batch.length;

    // Mostrar progresso a cada 5 lotes
    if (batchNum % 5 === 0) {
      printProgress(stats, allOrders.length);
    }

    // Delay entre lotes
    if (i + BATCH_SIZE < allOrders.length && (Date.now() - stats.startTime) < MAX_RUNTIME_MS) {
      console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES_MS/1000}s antes do próximo lote...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  // 4. Reprocessar pedidos que falharam
  if (allFailedIds.length > 0 && (Date.now() - stats.startTime) < MAX_RUNTIME_MS) {
    console.log('\n' + '═'.repeat(60));
    console.log(`🔄 REPROCESSANDO ${allFailedIds.length} PEDIDOS QUE FALHARAM`);
    console.log('═'.repeat(60) + '\n');

    const failedBatches = Math.ceil(allFailedIds.length / BATCH_SIZE);
    
    for (let i = 0; i < allFailedIds.length && (Date.now() - stats.startTime) < MAX_RUNTIME_MS; i += BATCH_SIZE) {
      const retryBatch = allFailedIds.slice(i, i + BATCH_SIZE);
      const retryBatchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      console.log(`\n[Retry ${retryBatchNum}/${failedBatches}] ${retryBatch.length} pedidos falhados`);
      
      if (Date.now() - lastTokenRefresh > 50 * 60 * 1000) {
        console.log('🔑 Renovando token de acesso...');
        accessToken = await getAccessTokenFromDbOrRefresh();
        lastTokenRefresh = Date.now();
      }

      await syncBatchWithRetry(accessToken, retryBatch, retryBatchNum, failedBatches, stats);

      if (i + BATCH_SIZE < allFailedIds.length) {
        console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES_MS/1000}s antes do próximo retry...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }
  }

  // 5. Relatório final
  const totalRuntime = Date.now() - stats.startTime;

  console.log('\n' + '═'.repeat(60));
  console.log('🏁 RELATÓRIO FINAL - SINCRONIZAÇÃO CONCLUÍDA');
  console.log('═'.repeat(60));
  console.log(`⏰ Início: ${new Date(stats.startTime).toLocaleString('pt-BR')}`);
  console.log(`⏰ Fim: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`⏱️  Duração total: ${formatDuration(totalRuntime)}`);
  console.log('');
  console.log(`📦 Total processado: ${stats.totalProcessed}`);
  console.log(`✅ Sucessos: ${stats.totalSuccess}`);
  console.log(`❌ Falhas: ${stats.totalFailed}`);
  console.log(`📊 Total de itens inseridos: ${stats.totalItems}`);
  console.log(`⚠️  Total de erros 429: ${stats.errors429}`);
  console.log(`🔄 Retries bem-sucedidos: ${stats.retriesSuccess}`);
  console.log('═'.repeat(60));
}

process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrompido pelo usuário (CTRL+C)');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⚠️  Processo terminado');
  process.exit(0);
});

syncAllOrders().catch((error) => {
  console.error('\n❌ ERRO FATAL:', error);
  process.exit(1);
});
