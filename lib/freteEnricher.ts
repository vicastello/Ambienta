/**
 * Background worker to enrich order data with frete information
 * This runs separately to avoid blocking main sync process
 */

import { supabaseAdmin } from './supabaseAdmin';
import { obterPedidoDetalhado } from './tinyApi';
import { getAccessTokenFromDbOrRefresh } from './tinyAuth';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichFreteInBackground(
  orderIds: number[] = [],
  maxToProcess: number = 100,
  delayMs: number = 200
): Promise<{ processed: number; updated: number; failed: number }> {
  let processed = 0;
  let updated = 0;
  let failed = 0;

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    
    // Get all order IDs if not provided
    let idsToProcess = orderIds;
    if (!idsToProcess.length) {
      const { data: orders, error } = await supabaseAdmin
        .from('tiny_orders')
        .select('tiny_id')
        .is('valorFrete', null) // Only get orders without frete data
        .limit(maxToProcess);

      if (error) throw error;
      idsToProcess = orders?.map((o: any) => o.tiny_id) || [];
    } else {
      idsToProcess = idsToProcess.slice(0, maxToProcess);
    }

    if (!idsToProcess.length) {
      console.log('[freteEnricher] Nenhum pedido para enriquecer com frete');
      return { processed, updated, failed };
    }

    console.log(`[freteEnricher] Iniciando enriquecimento de ${idsToProcess.length} pedidos com frete...`);

    for (const orderId of idsToProcess) {
      try {
        const detalhado = await obterPedidoDetalhado(accessToken, orderId);
        
        const { data: currentOrder, error: selectErr } = await supabaseAdmin
          .from('tiny_orders')
          .select('raw')
          .eq('tiny_id', orderId)
          .single();

        if (selectErr || !currentOrder?.raw) {
          failed++;
          continue;
        }

        const updatedRaw = {
          ...currentOrder.raw,
          valorFrete: detalhado.valorFrete || 0,
          valorTotalProdutos: detalhado.valorTotalProdutos,
          valorTotalPedido: detalhado.valorTotalPedido,
        };

        const { error: updateErr } = await supabaseAdmin
          .from('tiny_orders')
          .update({ raw: updatedRaw })
          .eq('tiny_id', orderId);

        if (updateErr) {
          failed++;
          console.warn(`[freteEnricher] Erro ao atualizar ${orderId}:`, updateErr);
        } else {
          updated++;
          console.log(`[freteEnricher] ✓ Pedido ${orderId}: frete=${detalhado.valorFrete || 0}`);
        }
      } catch (err) {
        failed++;
        console.warn(`[freteEnricher] Falha ao enriquecer pedido ${orderId}:`, (err as any)?.message || err);
      }

      processed++;
      // Delay between requests to avoid rate limiting
      if (processed < idsToProcess.length) {
        await sleep(delayMs);
      }
    }

    console.log(`[freteEnricher] Concluído: ${processed} processados, ${updated} atualizados, ${failed} falhados`);
  } catch (err) {
    console.error('[freteEnricher] Erro geral:', err);
  }

  return { processed, updated, failed };
}

export async function enrichFreteForPeriod(
  dataInicial: string, // yyyy-mm-dd
  dataFinal: string,   // yyyy-mm-dd
  maxToProcess: number = 100
): Promise<{ processed: number; updated: number; failed: number }> {
  let processed = 0;
  let updated = 0;
  let failed = 0;

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();

    // Get orders in period without frete data
    const { data: orders, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, data_criacao')
      .gte('data_criacao', `${dataInicial}T00:00:00`)
      .lte('data_criacao', `${dataFinal}T23:59:59`)
      .is('raw->>valorFrete', 'null')
      .limit(maxToProcess);

    if (error) throw error;

    if (!orders?.length) {
      console.log(`[freteEnricher] Nenhum pedido para enriquecer no período ${dataInicial} a ${dataFinal}`);
      return { processed, updated, failed };
    }

    console.log(`[freteEnricher] Enriquecendo ${orders.length} pedidos no período ${dataInicial} a ${dataFinal}...`);

    const orderIds = orders.map((o: any) => o.tiny_id);
    return await enrichFreteInBackground(orderIds, maxToProcess, 250);
  } catch (err) {
    console.error('[freteEnricher] Erro ao enriquecer período:', err);
    return { processed, updated, failed };
  }
}
