import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';

const MAX_REQUESTS_PER_MINUTE = 100;
const BATCH_SIZE = 50; // Reduzido para evitar timeout
const DELAY_BETWEEN_BATCHES_MS = 35000; // 35s entre lotes = ~85 req/min max
const MAX_RUNTIME_HOURS = 6;
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
  // Buscar TODOS os pedidos (sem limite de 1000)
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

  if (!allOrders.length) return [];

  console.log(`📦 Total de pedidos encontrados: ${allOrders.length}`);

  // Buscar TODOS os itens da tabela (sem filtro de range)
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

  const orderIdsSet = new Set(allOrders.map(o => o.id));
  const filteredItems = allItems.filter(item => orderIdsSet.has(item.id_pedido));
  const withItems = new Set(filteredItems.map(x => x.id_pedido));

  const missing = allOrders.filter(o => !withItems.has(o.id));
  console.log(`✅ Com produtos: ${withItems.size}`);
  console.log(`⏳ Sem produtos: ${missing.length}`);

  return missing;
}

async function syncBatchWithRetry(
  accessToken: string,
  tinyIds: number[],
  batchNum: number,
  totalBatches: number,
  stats: SyncStats
): Promise<{ failedIds: number[] }> {
  const MAX_RETRIES = 10; // Aumentado de 5 para 10
  let attempt = 0;
  let failedIds: number[] = [];

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      if (attempt > 1) {
        const waitTime = Math.min(120000, 15000 * attempt); // Max 120s, aumentado
        console.log(`  🔄 Tentativa ${attempt}/${MAX_RETRIES} após ${waitTime/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const result = await sincronizarItensPorPedidos(accessToken, tinyIds, { 
        force: true,
        delayMs: 800, // Mais conservador: ~75 req/min
        retries: 10 // Aumentado de 8 para 10
      });

      stats.totalSuccess += result.sucesso;
      stats.totalItems += result.totalItens;

      console.log(`  ✅ Sucessos: ${result.sucesso}/${tinyIds.length}`);
      console.log(`  ❌ Falhas: ${result.falhas}`);
      console.log(`  📦 Itens: ${result.totalItens}`);

      // Se todos deram sucesso, retornar
      if (result.falhas === 0) {
        if (attempt > 1) stats.retriesSuccess++;
        return { failedIds: [] };
      }

      // Se ainda há falhas e não é a última tentativa, continuar
      stats.errors429++;
      stats.totalFailed += result.falhas;

      if (attempt < MAX_RETRIES) {
        console.log(`  ⚠️ ${result.falhas} pedidos falharam, retentando...`);
      } else {
        console.log(`  ❌ ${result.falhas} pedidos falharam após ${MAX_RETRIES} tentativas`);
        // Adicionar os IDs que falharam para retry posterior
        failedIds = tinyIds; // Retornar todos para retry em outro momento
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

function printProgress(stats: SyncStats, missing: number, total: number) {
  const elapsed = Date.now() - stats.startTime;
  const remaining = MAX_RUNTIME_MS - elapsed;
  const progressPct = ((stats.totalProcessed / missing) * 100).toFixed(1);
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 PROGRESSO ATUAL');
  console.log('═'.repeat(60));
  console.log(`⏱️  Tempo decorrido: ${formatDuration(elapsed)}`);
  console.log(`⏳ Tempo restante: ${formatDuration(Math.max(0, remaining))}`);
  console.log(`📦 Processados: ${stats.totalProcessed}/${missing} (${progressPct}%)`);
  console.log(`✅ Sucessos: ${stats.totalSuccess}`);
  console.log(`❌ Falhas: ${stats.totalFailed}`);
  console.log(`📊 Itens inseridos: ${stats.totalItems}`);
  console.log(`⚠️  Erros 429: ${stats.errors429}`);
  console.log(`🔄 Retries bem-sucedidos: ${stats.retriesSuccess}`);
  console.log('═'.repeat(60) + '\n');
}

async function syncOvernight() {
  console.log('🌙 SINCRONIZAÇÃO NOTURNA - 6 HORAS');
  console.log('═'.repeat(60));
  console.log(`⏰ Início: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`⏱️  Duração máxima: ${MAX_RUNTIME_HOURS} horas`);
  console.log(`🚦 Rate limit: ${MAX_REQUESTS_PER_MINUTE} req/min`);
  console.log(`📦 Tamanho do lote: ${BATCH_SIZE} pedidos`);
  console.log(`⏳ Delay entre lotes: ${DELAY_BETWEEN_BATCHES_MS/1000}s`);
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
  console.log('🔍 Buscando TODOS os pedidos sem produtos desde 01/11/2025...\n');
  let missing = await getMissingOrders();
  
  console.log(`\n📦 Total de pedidos faltantes: ${missing.length}\n`);
  
  if (missing.length === 0) {
    console.log('✅ Todos os pedidos já têm produtos!');
    return;
  }

  // 2. Obter token
  let accessToken = await getAccessTokenFromDbOrRefresh();
  let lastTokenRefresh = Date.now();

  // 3. Processar em lotes
  const totalBatches = Math.ceil(missing.length / BATCH_SIZE);
  let batchNum = 0;
  let allFailedIds: number[] = []; // Acumular IDs que falharam

  while (missing.length > 0 && (Date.now() - stats.startTime) < MAX_RUNTIME_MS) {
    batchNum++;
    const batch = missing.slice(0, BATCH_SIZE);
    const tinyIds = batch.map(o => o.tiny_id);

    const elapsed = Date.now() - stats.startTime;
    const timeLeft = MAX_RUNTIME_MS - elapsed;
    
    console.log(`\n[Lote ${batchNum}] ${batch.length} pedidos (${missing.length} restantes)`);
    console.log(`⏱️  ${formatDuration(elapsed)} / ${formatDuration(timeLeft)} restante`);

    // Renovar token a cada 50 minutos
    if (Date.now() - lastTokenRefresh > 50 * 60 * 1000) {
      console.log('🔑 Renovando token de acesso...');
      accessToken = await getAccessTokenFromDbOrRefresh();
      lastTokenRefresh = Date.now();
    }

    const { failedIds } = await syncBatchWithRetry(accessToken, tinyIds, batchNum, totalBatches, stats);
    
    // Acumular IDs que falharam para retry posterior
    if (failedIds.length > 0) {
      allFailedIds.push(...failedIds);
      console.log(`  ⚠️ ${failedIds.length} pedidos adicionados para retry posterior`);
    }

    stats.totalProcessed += batch.length;

    // Mostrar progresso a cada 5 lotes (reduzido de 10)
    if (batchNum % 5 === 0) {
      printProgress(stats, missing.length + stats.totalProcessed, missing.length + stats.totalProcessed);
    }

    // Recarregar lista de faltantes a cada 15 lotes (reduzido de 20)
    if (batchNum % 15 === 0) {
      console.log('🔄 Recarregando lista de pedidos faltantes...');
      missing = await getMissingOrders();
      console.log(`📦 Ainda faltam: ${missing.length}\n`);
      
      if (missing.length === 0) {
        console.log('✅ Todos os pedidos foram sincronizados!');
        break;
      }
    } else {
      missing = missing.slice(BATCH_SIZE);
    }

    // Delay entre lotes para respeitar rate limit
    if (missing.length > 0 && (Date.now() - stats.startTime) < MAX_RUNTIME_MS) {
      console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES_MS/1000}s antes do próximo lote...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  // 3.5. Processar pedidos que falharam anteriormente
  if (allFailedIds.length > 0 && (Date.now() - stats.startTime) < MAX_RUNTIME_MS) {
    console.log('\n' + '═'.repeat(60));
    console.log(`🔄 REPROCESSANDO ${allFailedIds.length} PEDIDOS QUE FALHARAM`);
    console.log('═'.repeat(60) + '\n');

    const failedBatches = Math.ceil(allFailedIds.length / BATCH_SIZE);
    
    for (let i = 0; i < allFailedIds.length && (Date.now() - stats.startTime) < MAX_RUNTIME_MS; i += BATCH_SIZE) {
      const retryBatch = allFailedIds.slice(i, i + BATCH_SIZE);
      const retryBatchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      console.log(`\n[Retry ${retryBatchNum}/${failedBatches}] ${retryBatch.length} pedidos falhados`);
      
      // Renovar token se necessário
      if (Date.now() - lastTokenRefresh > 50 * 60 * 1000) {
        console.log('🔑 Renovando token de acesso...');
        accessToken = await getAccessTokenFromDbOrRefresh();
        lastTokenRefresh = Date.now();
      }

      const { failedIds: stillFailed } = await syncBatchWithRetry(
        accessToken, 
        retryBatch, 
        retryBatchNum, 
        failedBatches, 
        stats
      );

      if (stillFailed.length > 0) {
        console.log(`  ⚠️ ${stillFailed.length} pedidos ainda falharam após retry`);
      }

      // Delay maior entre retries
      if (i + BATCH_SIZE < allFailedIds.length) {
        console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES_MS/1000}s antes do próximo retry...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }
  }

  // 4. Relatório final
  const finalMissing = await getMissingOrders();
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
  console.log('');
  console.log(`📦 Pedidos ainda faltantes: ${finalMissing.length}`);
  console.log('═'.repeat(60));

  if (finalMissing.length > 0) {
    console.log(`\n⚠️  Ainda há ${finalMissing.length} pedidos sem produtos.`);
    console.log('💡 Execute novamente para continuar a sincronização.');
  } else {
    console.log('\n🎉 TODOS OS PEDIDOS DESDE 01/11/2025 AGORA TÊM PRODUTOS!');
  }
}

// Tratamento de sinais para encerramento gracioso
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrompido pelo usuário (CTRL+C)');
  console.log('💾 Salvando progresso...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⚠️  Processo terminado');
  console.log('💾 Salvando progresso...');
  process.exit(0);
});

syncOvernight().catch((error) => {
  console.error('\n❌ ERRO FATAL:', error);
  process.exit(1);
});
