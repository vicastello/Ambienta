import { NextRequest, NextResponse } from 'next/server';
import { listarPedidosTinyPorPeriodo } from '@/lib/tinyApi';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import crypto from 'crypto';

/**
 * GET /api/tiny/sync/cron-fast
 * 
 * Smart/Differential Polling - runs every 5 minutes
 * Syncs only last 7 days and detects changes via hash
 * 
 * Much faster than full cron, optimized for recent orders
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
    console.log('[cron-fast] Iniciando sincronização diferencial...');

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

    // Calculate date range: last 7 days (recent orders only)
    const hoje = new Date();
    const dataFinal = hoje.toISOString().slice(0, 10);
    const dataInicial = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    console.log(`[cron-fast] Sincronizando pedidos recentes de ${dataInicial} a ${dataFinal}`);

    let offset = 0;
    let totalProcessed = 0;
    let totalChanged = 0;
    let totalUntouched = 0;
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

        // Process each item with differential polling
        for (const item of items) {
          try {
            const tinyId = (item as any).id;
            const dataCriacao = (item as any).dataCriacao;
            const situacao = (item as any).situacao;

            if (!tinyId || !dataCriacao) continue;

            // Calculate hash of new data
            const newHash = crypto.createHash('md5')
              .update(JSON.stringify(item))
              .digest('hex');

            // Fetch existing order to compare hash
            const { data: existing } = await supabaseAdmin
              .from('tiny_orders')
              .select('data_hash, raw')
              .eq('tiny_id', tinyId)
              .single();

            // Check if data changed
            if (existing && existing.data_hash === newHash) {
              // No change - skip update
              totalUntouched++;
              continue;
            }

            // Data changed or is new - merge and update
            const existingRaw = existing?.raw ?? {};
            const newRaw = item as any;
            const mergedRaw = {
              ...newRaw,
              // Only preserve enriched fields if they don't exist in new data
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
                  data_hash: newHash,
                  last_sync_check: new Date().toISOString(),
                },
                { onConflict: 'tiny_id' }
              );

            if (!upsertErr) {
              totalChanged++;
              console.log(`[cron-fast] ✓ Pedido ${tinyId} atualizado`);
            }
          } catch (err) {
            console.warn('[cron-fast] Erro ao processar item:', err);
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
        console.error('[cron-fast] Erro ao buscar página:', err);
        hasMore = false;
      }
    }

    console.log(
      `[cron-fast] ✓ Sincronização concluída: ${totalChanged} mudanças detectadas, ${totalUntouched} sem mudanças`
    );

    return NextResponse.json({
      success: true,
      period: { dataInicial, dataFinal },
      totalProcessed,
      totalChanged,
      totalUntouched,
      efficiency: totalProcessed > 0 ? ((totalUntouched / totalProcessed) * 100).toFixed(1) + '%' : '0%',
    });
  } catch (err) {
    console.error('[cron-fast] Erro geral:', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Erro na sincronização',
      },
      { status: 500 }
    );
  }
}
