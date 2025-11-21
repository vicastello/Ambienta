/**
 * Cron job para sincronizar apenas pedidos que foram atualizados no Tiny
 * 
 * Este endpoint busca pedidos modificados nas últimas horas usando o campo dataAtualizacao
 * da API Tiny, garantindo que mudanças de situação e outros campos sejam refletidas.
 * 
 * POST /api/admin/cron/sync-pedidos-updated
 * 
 * Configurar para rodar a cada 1-4 horas via Vercel Cron ou pg_cron
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccessTokenFromDbOrRefresh } from "@/lib/tinyAuth";
import { listarPedidosTinyPorPeriodo, TinyApiError } from "@/lib/tinyApi";
import { upsertOrdersPreservingEnriched } from "@/lib/syncProcessor";
import { mapPedidoToOrderRow } from "@/lib/tinyMapping";
import { sincronizarItensAutomaticamente, sincronizarItensPorPedidos } from "@/lib/pedidoItensHelper";

export const maxDuration = 300; // 5 minutos

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // TODO: Adicionar autenticação em produção
    // const authHeader = req.headers.get("authorization");
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    console.log("[Cron Pedidos Updated] Iniciando sincronização de pedidos atualizados...");

    const accessToken = await getAccessTokenFromDbOrRefresh();
    
    // Buscar pedidos atualizados nas últimas N horas
    const hoursAgo = parseInt(process.env.SYNC_UPDATED_HOURS || "6", 10);
    const now = new Date();
    const lookbackDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    
    // Usar dataAtualizacao para pegar pedidos modificados
    const dataAtualizacao = lookbackDate.toISOString().split('T')[0]; // yyyy-mm-dd
    
    let totalProcessados = 0;
    let totalAtualizados = 0;
    let totalErros = 0;
    const maxPages = 20; // Limite de segurança
    let offset = 0;
    const limit = 100;

    console.log(`[Cron Pedidos Updated] Buscando pedidos atualizados desde ${dataAtualizacao} (últimas ${hoursAgo}h)`);

    for (let page = 0; page < maxPages; page++) {
      try {
        // Usar endpoint com dataAtualizacao
        const response = await listarPedidosTinyPorPeriodo(accessToken, {
          dataInicial: dataAtualizacao,
          dataFinal: now.toISOString().split('T')[0],
          limit,
          offset,
          orderBy: 'desc',
        });

        const pedidos = response?.itens || [];
        
        if (pedidos.length === 0) {
          console.log(`[Cron Pedidos Updated] Nenhum pedido encontrado na página ${page + 1}`);
          break;
        }

        console.log(`[Cron Pedidos Updated] Página ${page + 1}: ${pedidos.length} pedidos`);

        // Mapear e fazer upsert preservando dados enriquecidos
        const rows = pedidos.map(mapPedidoToOrderRow);
        
        const { error: upsertError } = await upsertOrdersPreservingEnriched(rows);
        
        if (upsertError) {
          console.error(`[Cron Pedidos Updated] Erro ao fazer upsert:`, upsertError);
          totalErros += pedidos.length;
        } else {
          totalAtualizados += pedidos.length;

          try {
            const itensResult = await sincronizarItensPorPedidos(
              accessToken,
              rows.map((row) => row.tiny_id as number)
            );

            if (itensResult.sucesso > 0) {
              console.log(
                `[Cron Pedidos Updated] Itens sincronizados: ${itensResult.totalItens} itens de ${itensResult.sucesso} pedidos`
              );
            }
          } catch (error: any) {
            console.error('[Cron Pedidos Updated] Erro ao sincronizar itens para pedidos atualizados:', error);
          }
        }

        totalProcessados += pedidos.length;
        offset += limit;

        // Delay para respeitar rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.error(`[Cron Pedidos Updated] Erro na página ${page + 1}:`, error);
        
        if (error instanceof TinyApiError && error.status === 429) {
          console.log("[Cron Pedidos Updated] Rate limit atingido, aguardando...");
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        
        totalErros++;
        break;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Sincronizar itens dos pedidos atualizados
    let itensResult = { processados: 0, sucesso: 0, totalItens: 0 };
    try {
      console.log('[Cron Pedidos Updated] Sincronizando itens dos pedidos atualizados...');
      itensResult = await sincronizarItensAutomaticamente(accessToken, {
        limit: 50,
        maxRequests: 30,
        dataMinima: lookbackDate,
      });
      console.log(`[Cron Pedidos Updated] Itens: ${itensResult.totalItens} itens de ${itensResult.sucesso} pedidos`);
    } catch (error: any) {
      console.error('[Cron Pedidos Updated] Erro ao sincronizar itens:', error);
    }

    // Log do resultado
    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'info',
      message: 'Sincronização de pedidos atualizados concluída',
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

    console.log(`[Cron Pedidos Updated] Concluído: ${totalProcessados} processados, ${totalAtualizados} atualizados em ${duration}s`);

    return NextResponse.json({
      success: true,
      totalProcessados,
      totalAtualizados,
      totalErros,
      hoursAgo,
      dataAtualizacao,
      durationSeconds: duration,
    });

  } catch (error: any) {
    console.error("[Cron Pedidos Updated] Erro fatal:", error);
    
    await supabaseAdmin.from('sync_logs').insert({
      job_id: null,
      level: 'error',
      message: 'Erro fatal na sincronização de pedidos atualizados',
      meta: { error: error?.message || String(error) },
    });

    return NextResponse.json(
      { 
        error: "Erro ao sincronizar pedidos atualizados", 
        details: error?.message || String(error) 
      },
      { status: 500 }
    );
  }
}
