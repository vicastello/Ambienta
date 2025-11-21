/**
 * Script para rodar manualmente a sincronização de pedidos atualizados
 * (equivalente ao cron job que rodaria automaticamente no Vercel)
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getAccessTokenFromDbOrRefresh } from "../lib/tinyAuth";
import { listarPedidosTinyPorPeriodo, TinyApiError } from "../lib/tinyApi";
import { upsertOrdersPreservingEnriched } from "../lib/syncProcessor";
import { mapPedidoToOrderRow } from "../lib/tinyMapping";
import { sincronizarItensAutomaticamente, sincronizarItensPorPedidos } from "../lib/pedidoItensHelper";

async function syncPedidosAtualizados() {
  const startTime = Date.now();
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🔄 SINCRONIZAÇÃO MANUAL DE PEDIDOS ATUALIZADOS');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    
    // Buscar pedidos atualizados nas últimas N horas
    const hoursAgo = parseInt(process.env.SYNC_UPDATED_HOURS || "6", 10);
    const now = new Date();
    const lookbackDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    
    const dataAtualizacao = lookbackDate.toISOString().split('T')[0];
    
    let totalProcessados = 0;
    let totalAtualizados = 0;
    let totalErros = 0;
    const maxPages = 20;
    let offset = 0;
    const limit = 100;

    console.log(`📅 Período: ${dataAtualizacao} até hoje (últimas ${hoursAgo}h)`);
    console.log(`⏰ Iniciado em: ${now.toLocaleString('pt-BR')}\n`);

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
          console.log(`📄 Página ${page + 1}: Nenhum pedido encontrado`);
          break;
        }

        console.log(`📄 Página ${page + 1}: ${pedidos.length} pedidos`);

        // Mapear e fazer upsert preservando dados enriquecidos
        const rows = pedidos.map(mapPedidoToOrderRow);
        
        const { error: upsertError } = await upsertOrdersPreservingEnriched(rows);
        
        if (upsertError) {
          console.error(`❌ Erro ao fazer upsert:`, upsertError.message);
          totalErros += pedidos.length;
        } else {
          console.log(`✅ ${pedidos.length} pedidos atualizados`);
          totalAtualizados += pedidos.length;

          try {
            const itensResult = await sincronizarItensPorPedidos(
              accessToken,
              rows.map((row) => row.tiny_id as number)
            );

            if (itensResult.sucesso > 0) {
              console.log(
                `   ➜ Itens sincronizados: ${itensResult.totalItens} itens de ${itensResult.sucesso} pedidos`
              );
            }
          } catch (error: any) {
            console.error('   ⚠️  Erro ao sincronizar itens para estes pedidos:', error.message);
          }
        }

        totalProcessados += pedidos.length;
        offset += limit;

        // Delay para respeitar rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.error(`❌ Erro na página ${page + 1}:`, error.message);
        
        if (error instanceof TinyApiError && error.status === 429) {
          console.log("⏸️  Rate limit atingido, aguardando 5s...");
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        
        totalErros++;
        break;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Sincronizar itens dos pedidos atualizados
    console.log('\n📦 Sincronizando itens dos pedidos atualizados...');
    let itensResult = { processados: 0, sucesso: 0, totalItens: 0 };
    try {
      itensResult = await sincronizarItensAutomaticamente(accessToken, {
        limit: 50,
        maxRequests: 30,
        dataMinima: lookbackDate,
      });
      console.log(`✅ ${itensResult.totalItens} itens de ${itensResult.sucesso} pedidos`);
    } catch (error: any) {
      console.error('❌ Erro ao sincronizar itens:', error.message);
    }

    // Log do resultado
    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'info',
      message: 'Sincronização manual de pedidos atualizados concluída',
      meta: {
        totalProcessados,
        totalAtualizados,
        totalErros,
        hoursAgo,
        dataAtualizacao,
        durationSeconds: duration,
        itens: itensResult,
      },
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✅ SINCRONIZAÇÃO CONCLUÍDA');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📊 Processados: ${totalProcessados}`);
    console.log(`✅ Atualizados: ${totalAtualizados}`);
    console.log(`📦 Itens: ${itensResult.totalItens} de ${itensResult.sucesso} pedidos`);
    if (totalErros > 0) {
      console.log(`❌ Erros: ${totalErros}`);
    }
    console.log(`⏱️  Tempo: ${duration}s`);
    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(totalErros > 0 ? 1 : 0);

  } catch (error: any) {
    console.error("\n❌ ERRO FATAL:", error.message);
    console.error(error);
    
    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'error',
      message: 'Erro fatal na sincronização manual de pedidos atualizados',
      meta: { error: error?.message || String(error) },
    });

    process.exit(1);
  }
}

syncPedidosAtualizados();
