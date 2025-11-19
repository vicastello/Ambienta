import { NextRequest, NextResponse } from 'next/server';
import { listarPedidosTinyPorPeriodo } from '@/lib/tinyApi';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';

/**
 * GET /api/tiny/sync/cron
 * 
 * Cron job que roda a cada 30 minutos para sincronizar pedidos dos últimos 90 dias
 * Atualiza valorFrete e situacao dos pedidos sempre para garantir dados recentes
 */
export async function GET(req: NextRequest) {
  // Vercel envia header 'authorization' com bearer token para endpoints cron
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[cron-sync] Iniciando sincronização automática...');

    // Get token
    let accessToken = process.env.TINY_ACCESS_TOKEN || null;
    if (!accessToken) {
      try {
        accessToken = await getAccessTokenFromDbOrRefresh();
      } catch {
        accessToken = null;
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Token não disponível' },
        { status: 401 }
      );
    }

    // Calculate date range: last 90 days
    const hoje = new Date();
    const dataFinal = hoje.toISOString().slice(0, 10);
    const dataInicial = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    console.log(`[cron-sync] Sincronizando pedidos de ${dataInicial} a ${dataFinal}`);

    let offset = 0;
    let totalProcessed = 0;
    let totalSaved = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const page = await listarPedidosTinyPorPeriodo(accessToken, {
          dataInicial,
          dataFinal,
          limit: 100,
          offset,
          orderBy: 'desc',
        });

        const items = page.itens ?? [];
        if (!items.length) {
          hasMore = false;
          break;
        }

        // Save orders with valorFrete and situacao from list endpoint
        for (const item of items) {
          try {
            const tinyId = (item as any).id;
            const dataCriacao = (item as any).dataCriacao;
            const situacao = (item as any).situacao;

            if (!tinyId || !dataCriacao) continue;

            // Fetch existing order to merge data
            const { data: existing } = await supabaseAdmin
              .from('tiny_orders')
              .select('raw')
              .eq('tiny_id', tinyId)
              .single();

            // Merge: preserve enriched fields but update status and frete from API
            const existingRaw = existing?.raw ?? {};
            const newRaw = item as any;
            const mergedRaw = {
              ...newRaw,
              // Only preserve enriched fields that came from detailed API if they don't exist in new data
              ...(existingRaw.valorTotalPedido !== undefined && !newRaw.valorTotalPedido && { valorTotalPedido: existingRaw.valorTotalPedido }),
              ...(existingRaw.valorTotalProdutos !== undefined && !newRaw.valorTotalProdutos && { valorTotalProdutos: existingRaw.valorTotalProdutos }),
            };

            const { error: upsertErr } = await supabaseAdmin
              .from('tiny_orders')
              .upsert(
                {
                  tiny_id: tinyId,
                  data_criacao: dataCriacao,
                  situacao,
                  raw: mergedRaw,
                },
                { onConflict: 'tiny_id' }
              );

            if (!upsertErr) {
              totalSaved++;
            }
          } catch (err) {
            console.warn('[cron-sync] Erro ao processar item:', err);
          }
        }

        totalProcessed += items.length;
        offset += 100;

        if (items.length < 100) {
          hasMore = false;
        }

        // Respect API rate limit: 120 req/min = 2 req/sec = 500ms per request
        await new Promise((r) => setTimeout(r, 600));
      } catch (err) {
        console.error('[cron-sync] Erro ao buscar página:', err);
        hasMore = false;
      }
    }

    console.log(
      `[cron-sync] ✓ Sincronização concluída: ${totalSaved}/${totalProcessed} salvos`
    );

    return NextResponse.json({
      success: true,
      period: { dataInicial, dataFinal },
      totalProcessed,
      totalSaved,
    });
  } catch (err) {
    console.error('[cron-sync] Erro geral:', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Erro na sincronização',
      },
      { status: 500 }
    );
  }
}
