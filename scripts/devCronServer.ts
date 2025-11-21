/**
 * Servidor de desenvolvimento para rodar tarefas automáticas localmente
 * 
 * Este script simula os cron jobs do Vercel em ambiente de desenvolvimento.
 * Ele roda em background e executa periodicamente:
 * - Sincronização de pedidos atualizados (a cada 2 horas)
 * - Sincronização de itens (junto com pedidos)
 * - Refresh de token (a cada 6 horas)
 * 
 * Uso:
 *   npm run dev:cron
 *   ou
 *   npx tsx scripts/devCronServer.ts
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getAccessTokenFromDbOrRefresh } from "../lib/tinyAuth";
import { listarPedidosTinyPorPeriodo, TinyApiError } from "../lib/tinyApi";
import { upsertOrdersPreservingEnriched } from "../lib/syncProcessor";
import { mapPedidoToOrderRow } from "../lib/tinyMapping";
import { sincronizarItensAutomaticamente } from "../lib/pedidoItensHelper";
import { runFreteEnrichment } from "../lib/freteEnricher";
import { normalizeMissingOrderChannels } from "../lib/channelNormalizer";

// Configurações
const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 horas
const TOKEN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
const SYNC_UPDATED_HOURS = 6; // Buscar pedidos das últimas 6 horas

let isRunning = false;

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
        });

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
    console.log('\n🔑 Atualizando token...');
    await getAccessTokenFromDbOrRefresh();
    console.log('✅ Token atualizado com sucesso\n');
  } catch (error: any) {
    console.error('❌ Erro ao atualizar token:', error.message);
  }
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
  console.log('\n╔═════════════════════════════════════════════════════╗');
  console.log('║  🤖 SERVIDOR DE DESENVOLVIMENTO - TAREFAS AUTOMÁTICAS ║');
  console.log('╚═════════════════════════════════════════════════════╝\n');
  console.log('📝 Configuração:');
  console.log(`  • Sincronização de pedidos: a cada ${SYNC_INTERVAL_MS / 60000} minutos`);
  console.log(`  • Refresh de token: a cada ${TOKEN_REFRESH_INTERVAL_MS / 60000} minutos`);
  console.log(`  • Lookback: últimas ${SYNC_UPDATED_HOURS} horas`);
  console.log('\n💡 Pressione Ctrl+C para parar\n');
  console.log('─────────────────────────────────────────────────────\n');

  // Executar imediatamente na primeira vez
  console.log('🚀 Executando primeira sincronização...');
  await syncPedidosAtualizados();

  // Agendar sincronizações periódicas
  const syncInterval = setInterval(async () => {
    await syncPedidosAtualizados();
  }, SYNC_INTERVAL_MS);

  // Agendar refresh de token
  const tokenInterval = setInterval(async () => {
    await refreshToken();
  }, TOKEN_REFRESH_INTERVAL_MS);

  // Status a cada 30 minutos
  const statusInterval = setInterval(() => {
    const nextSync = formatNextRun(SYNC_INTERVAL_MS);
    console.log(`\n⏰ ${new Date().toLocaleTimeString('pt-BR')} - Sistema ativo (próxima sync em ${nextSync})`);
  }, 30 * 60 * 1000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Parando servidor...');
    clearInterval(syncInterval);
    clearInterval(tokenInterval);
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
