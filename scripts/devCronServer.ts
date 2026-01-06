/**
 * Servidor de desenvolvimento para rodar tarefas automáticas localmente
 * 
 * Este script simula TODOS os cron jobs (Supabase + endpoints HTTP) em ambiente de desenvolvimento.
 * Ele roda em background e executa periodicamente:
 * - Sincronização de pedidos Tiny (a cada 2 horas)
 * - Sincronização de itens (junto com pedidos)
 * - Sincronização de marketplaces: Shopee, Mercado Livre, Magalu
 * - Refresh de tokens (a cada 6 horas)
 * 
 * IMPORTANTE: Use este script quando precisar testar/rodar os jobs localmente.
 * 
 * Uso:
 *   npm run dev:cron    (separado)
 *   npm run dev:full    (junto com o dev server)
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getAccessTokenFromDbOrRefresh } from "../lib/tinyAuth";
import { listarPedidosTinyPorPeriodo, TinyApiError } from "../lib/tinyApi";
import { upsertOrdersPreservingEnriched } from "../lib/syncProcessor";
import { mapPedidoToOrderRow } from "../lib/tinyMapping";
import { sincronizarItensAutomaticamente } from "../lib/pedidoItensHelper";
import { runFreteEnrichment } from "../lib/freteEnricher";
import { normalizeMissingOrderChannels } from "../lib/channelNormalizer";
import { enrichCidadeUfMissing } from "../lib/cidadeUfEnricher";

// Configurações - Tiny
const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 horas
const TOKEN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
const SYNC_UPDATED_HOURS = 6; // Buscar pedidos das últimas 6 horas

// Configurações - Marketplaces
const SHOPEE_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos
const MELI_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const MAGALU_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const LOCAL_API_BASE = 'http://localhost:3000';

let isRunning = false;
let isMarketplaceSyncing: Record<string, boolean> = {};

async function syncPedidosAtualizados(): Promise<boolean> {
  if (isRunning) {
    console.log('⏸️  Sync já está rodando, pulando...');
    return false;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('\n┌─────────────────────────────────────────────────────┐');
    console.log('│ 🔄 SINCRONIZAÇÃO AUTOMÁTICA DE PEDIDOS             │');
    console.log('└─────────────────────────────────────────────────────┘');
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}\n`);

    const accessToken = await getAccessTokenFromDbOrRefresh();

    const now = new Date();
    const lookbackDate = new Date(now.getTime() - SYNC_UPDATED_HOURS * 60 * 60 * 1000);
    const dataAtualizacao = lookbackDate.toISOString().split('T')[0];

    let totalProcessados = 0;
    let totalAtualizados = 0;
    let totalErros = 0;
    const maxPages = 20;
    let offset = 0;
    const limit = 100;

    console.log(`📅 Período: ${dataAtualizacao} até hoje (últimas ${SYNC_UPDATED_HOURS}h)`);

    for (let page = 0; page < maxPages; page++) {
      try {
        const response = await listarPedidosTinyPorPeriodo(accessToken, {
          dataInicial: dataAtualizacao,
          dataFinal: now.toISOString().split('T')[0],
          limit,
          offset,
          orderBy: 'desc',
        }, 'cron_pedidos');

        const pedidos = response?.itens || [];

        if (pedidos.length === 0) {
          if (page === 0) {
            console.log('📄 Nenhum pedido atualizado encontrado');
          }
          break;
        }

        console.log(`📄 Página ${page + 1}: ${pedidos.length} pedidos`);

        const rows = pedidos.map(mapPedidoToOrderRow);
        const { error: upsertError } = await upsertOrdersPreservingEnriched(rows);

        if (upsertError) {
          console.error(`❌ Erro ao fazer upsert:`, upsertError.message);
          totalErros += pedidos.length;
        } else {
          totalAtualizados += pedidos.length;
        }

        totalProcessados += pedidos.length;
        offset += limit;

        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.error(`❌ Erro na página ${page + 1}:`, error.message);

        if (error instanceof TinyApiError && error.status === 429) {
          console.log("⏸️  Rate limit, aguardando 5s...");
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        totalErros++;
        break;
      }
    }

    // Sincronizar itens
    if (totalProcessados > 0) {
      console.log('\n📦 Sincronizando itens...');
      try {
        const itensResult = await sincronizarItensAutomaticamente(accessToken, {
          limit: 50,
          maxRequests: 30,
          dataMinima: lookbackDate,
        });

        if (itensResult.sucesso > 0) {
          console.log(`✅ ${itensResult.totalItens} itens de ${itensResult.sucesso} pedidos`);
        }
      } catch (error: any) {
        console.error('❌ Erro ao sincronizar itens:', error.message);
      }

      // Enriquecer frete
      console.log('\n🚚 Enriquecendo valor de frete...');
      try {
        const freteResult = await runFreteEnrichment(accessToken, {
          maxRequests: 30,
          batchSize: 1,
          batchDelayMs: 2000,
          dataMinima: lookbackDate,
        });
        console.log(`✅ ${freteResult.updated} pedidos com frete atualizado`);
      } catch (error: any) {
        console.error('❌ Erro ao enriquecer frete:', error.message);
      }

      // Normalizar canais
      console.log('\n📺 Normalizando canais...');
      try {
        const canalResult = await normalizeMissingOrderChannels();
        console.log(`✅ ${canalResult.updated} canais normalizados`);
      } catch (error: any) {
        console.error('❌ Erro ao normalizar canais:', error.message);
      }

      // Preencher cidade/UF ausentes
      console.log('\n🌎 Preenchendo cidade/UF...');
      try {
        const locResult = await enrichCidadeUfMissing();
        console.log(`✅ ${locResult.updated} pedidos com cidade/UF preenchidos`);
      } catch (error: any) {
        console.error('❌ Erro ao preencher cidade/UF:', error.message);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Log do resultado
    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'info',
      message: 'Sincronização automática (dev) concluída',
      meta: {
        totalProcessados,
        totalAtualizados,
        totalErros,
        hoursAgo: SYNC_UPDATED_HOURS,
        dataAtualizacao,
        durationSeconds: duration,
      },
    });

    console.log('\n┌─────────────────────────────────────────────────────┐');
    console.log('│ ✅ SINCRONIZAÇÃO CONCLUÍDA                          │');
    console.log('└─────────────────────────────────────────────────────┘');
    console.log(`📊 Processados: ${totalProcessados} | Atualizados: ${totalAtualizados}`);
    if (totalErros > 0) {
      console.log(`❌ Erros: ${totalErros}`);
    }
    console.log(`⏱️  Tempo: ${duration}s\n`);

    return true;

  } catch (error: any) {
    console.error("\n❌ ERRO:", error.message);

    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'error',
      message: 'Erro na sincronização automática (dev)',
      meta: { error: error?.message || String(error) },
    });

    return false;
  } finally {
    isRunning = false;
  }
}

async function refreshToken() {
  try {
    console.log('\n🔑 Atualizando token Tiny...');
    await getAccessTokenFromDbOrRefresh();
    console.log('✅ Token Tiny atualizado com sucesso\n');
  } catch (error: any) {
    console.error('❌ Erro ao atualizar token Tiny:', error.message);
  }
}

// =====================================================
// MARKETPLACE SYNCS - Chamam APIs locais via fetch
// =====================================================

async function syncMarketplace(
  name: string,
  endpoint: string,
  body: Record<string, unknown> = {}
): Promise<boolean> {
  if (isMarketplaceSyncing[name]) {
    console.log(`⏸️  ${name} sync já está rodando, pulando...`);
    return false;
  }

  isMarketplaceSyncing[name] = true;
  const startTime = Date.now();

  try {
    console.log(`\n📦 [${name}] Iniciando sincronização...`);

    const response = await fetch(`${LOCAL_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`❌ [${name}] Erro HTTP ${response.status}: ${errorText.slice(0, 200)}`);

      await supabaseAdmin.from('sync_logs').insert({
        job_id: null,
        level: 'error',
        message: `Sync ${name} falhou (dev)`,
        meta: { status: response.status, error: errorText.slice(0, 500), durationSeconds: duration },
      });

      return false;
    }

    const result = await response.json().catch(() => ({}));
    console.log(`✅ [${name}] Sincronização concluída em ${duration}s`);

    if (result.data) {
      const data = result.data;
      if (data.ordersInserted != null || data.ordersUpdated != null) {
        console.log(`   📊 Inseridos: ${data.ordersInserted ?? 0} | Atualizados: ${data.ordersUpdated ?? 0}`);
      }
    }

    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'info',
      message: `Sync ${name} concluído (dev)`,
      meta: { durationSeconds: duration, result: result?.data ?? null },
    });

    return true;
  } catch (error: any) {
    console.error(`❌ [${name}] Erro:`, error.message);

    // Se der ECONNREFUSED, o servidor Next.js não está rodando
    if (error.code === 'ECONNREFUSED') {
      console.log(`   ⚠️  Servidor Next.js não está rodando. Use 'npm run dev:full' para iniciar ambos.`);
    }

    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'error',
      message: `Sync ${name} falhou (dev)`,
      meta: { error: error.message },
    });

    return false;
  } finally {
    isMarketplaceSyncing[name] = false;
  }
}

async function syncShopee() {
  return syncMarketplace('Shopee', '/api/marketplaces/shopee/sync', { periodDays: 3 });
}

async function syncMercadoLivre() {
  return syncMarketplace('Mercado Livre', '/api/marketplaces/mercado-livre/sync', { periodDays: 3 });
}

async function syncMagalu() {
  return syncMarketplace('Magalu', '/api/marketplaces/magalu/sync', { periodDays: 3 });
}

async function syncAllMarketplaces() {
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│ 🛒 SINCRONIZAÇÃO DE MARKETPLACES                    │');
  console.log('└─────────────────────────────────────────────────────┘');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}\n`);

  // Executar em sequência para evitar sobrecarga
  await syncShopee();
  await syncMercadoLivre();
  await syncMagalu();

  console.log('\n✅ Sincronização de marketplaces concluída\n');
}

function formatNextRun(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

async function main() {
  console.log('\n╔═════════════════════════════════════════════════════════════════╗');
  console.log('║  🤖 SERVIDOR DE DESENVOLVIMENTO - SINCRONIZAÇÃO LOCAL         ║');
  console.log('║  ⚠️  Jobs rodando localmente (modo dev)                      ║');
  console.log('╚═════════════════════════════════════════════════════════════════╝\n');

  console.log('📝 Configuração:');
  console.log('  【Tiny ERP】');
  console.log(`    • Pedidos: a cada ${SYNC_INTERVAL_MS / 60000} min`);
  console.log(`    • Token refresh: a cada ${TOKEN_REFRESH_INTERVAL_MS / 60000} min`);
  console.log(`    • Lookback: últimas ${SYNC_UPDATED_HOURS} horas`);
  console.log('  【Marketplaces】');
  console.log(`    • Shopee: a cada ${SHOPEE_SYNC_INTERVAL_MS / 60000} min`);
  console.log(`    • Mercado Livre: a cada ${MELI_SYNC_INTERVAL_MS / 60000} min`);
  console.log(`    • Magalu: a cada ${MAGALU_SYNC_INTERVAL_MS / 60000} min`);
  console.log('\n💡 Pressione Ctrl+C para parar');
  console.log('─────────────────────────────────────────────────────────────────\n');

  // Aguardar um pouco para o Next.js iniciar (quando rodando com dev:full)
  console.log('⏳ Aguardando 5 segundos para o Next.js iniciar...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Executar imediatamente na primeira vez
  console.log('🚀 Executando primeira sincronização completa...\n');

  // Primeiro Tiny
  await syncPedidosAtualizados();

  // Depois marketplaces
  await syncAllMarketplaces();

  // Agendar sincronizações periódicas - Tiny
  const syncInterval = setInterval(async () => {
    await syncPedidosAtualizados();
  }, SYNC_INTERVAL_MS);

  // Agendar refresh de token
  const tokenInterval = setInterval(async () => {
    await refreshToken();
  }, TOKEN_REFRESH_INTERVAL_MS);

  // Agendar syncs de marketplaces
  const shopeeInterval = setInterval(async () => {
    await syncShopee();
  }, SHOPEE_SYNC_INTERVAL_MS);

  const meliInterval = setInterval(async () => {
    await syncMercadoLivre();
  }, MELI_SYNC_INTERVAL_MS);

  const magaluInterval = setInterval(async () => {
    await syncMagalu();
  }, MAGALU_SYNC_INTERVAL_MS);

  // Status a cada 30 minutos
  const statusInterval = setInterval(() => {
    console.log(`\n⏰ ${new Date().toLocaleTimeString('pt-BR')} - Sistema ativo`);
    console.log(`   Próximas syncs: Shopee em ${formatNextRun(SHOPEE_SYNC_INTERVAL_MS)}, Tiny em ${formatNextRun(SYNC_INTERVAL_MS)}`);
  }, 30 * 60 * 1000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Parando servidor...');
    clearInterval(syncInterval);
    clearInterval(tokenInterval);
    clearInterval(shopeeInterval);
    clearInterval(meliInterval);
    clearInterval(magaluInterval);
    clearInterval(statusInterval);
    console.log('✅ Servidor parado com sucesso\n');
    process.exit(0);
  });

  // Manter processo ativo
  process.on('uncaughtException', (error) => {
    console.error('\n❌ Erro não capturado:', error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('\n❌ Promise rejeitada:', reason);
  });
}

main().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
