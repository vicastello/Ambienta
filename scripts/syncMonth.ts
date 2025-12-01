#!/usr/bin/env -S node
/*
 * scripts/syncMonth.ts
 * Small standalone runner to fetch orders from Tiny for a date range
 * and upsert them into `tiny_orders` using the project's service-role Supabase client.
 *
 * Usage:
 *   npm run sync:month -- --start=2025-11-01 --end=2025-11-30
 *
 * Required environment variables:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - TINY_CLIENT_ID
 *   - TINY_CLIENT_SECRET
 * (the script uses the same token refresh logic as the app)
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { listarPedidosTinyPorPeriodo, TinyApiError } from '../lib/tinyApi';
import { mapPedidoToOrderRow } from '../lib/tinyMapping';
import { runFreteEnrichment } from '../lib/freteEnricher';
import { normalizeMissingOrderChannels } from '../lib/channelNormalizer';
import { enrichOrdersBatch } from '../lib/orderEnricher';

const ENABLE_INLINE_ENRICHMENT = process.env.ENABLE_INLINE_FRETE_ENRICHMENT === 'true'; // Desabilitado por padrão
const PAGE_DELAY_MS = Number(process.env.TINY_SYNC_PAGE_DELAY_MS ?? '550');
const RATE_LIMIT_BACKOFF_MS = Number(process.env.TINY_RATE_LIMIT_BACKOFF_MS ?? '65000');

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  return process.argv[idx].split('=')[1];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichFreteForRange(start?: string, end?: string) {
  const maxPasses = Number(process.env.FRETE_ENRICH_MAX_PASSES ?? '5');
  for (let pass = 0; pass < maxPasses; pass++) {
    const result = await runFreteEnrichment({
      startDate: start,
      endDate: end,
      newestFirst: false,
    });
    console.log(`[syncMonth] frete pass ${pass + 1}:`, result);
    if (!result.requested || result.remaining === 0) break;
  }
}

async function normalizeChannelsLoop() {
  const maxPasses = Number(process.env.CHANNEL_NORMALIZE_MAX_PASSES ?? '5');
  const batchLimit = Number(process.env.CHANNEL_NORMALIZE_BATCH ?? '500');

  for (let pass = 0; pass < maxPasses; pass++) {
    const result = await normalizeMissingOrderChannels({ limit: batchLimit });
    console.log(`[syncMonth] channel pass ${pass + 1}:`, result);
    if (!result.requested || result.updated === 0) break;
  }
}

async function main() {
  const start = parseArg('start') ?? parseArg('dataInicial') ?? (() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10);
  })();

  const end = parseArg('end') ?? parseArg('dataFinal') ?? (() => new Date().toISOString().slice(0,10))();

  console.log('[syncMonth] Range:', start, '->', end);

  // Create a job row to track
  const jobRow = {
    status: 'running',
    params: { mode: 'range', dataInicial: start, dataFinal: end },
    total_requests: 0,
    total_orders: 0,
  } as any;

  const { data: jobData, error: jobError } = await supabaseAdmin
    .from('sync_jobs')
    .insert(jobRow)
    .select('*')
    .maybeSingle();

  const jobId = (jobData as any)?.id ?? null;
  if (jobError) {
    console.error('[syncMonth] erro ao criar job:', jobError.message || jobError);
  }

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();

    const limit = 100;
    let offset = 0;
    let totalFetched = 0;
    let round = 0;
    let requestsMade = 0;

    while (true) {
      console.log(`[syncMonth] requesting page ${round + 1} (offset=${offset})`);
      let res;
      try {
        res = await listarPedidosTinyPorPeriodo(accessToken, {
          dataInicial: start,
          dataFinal: end,
          limit,
          offset,
        });
      } catch (err) {
        if (err instanceof TinyApiError && err.status === 429) {
          console.warn(
            `[syncMonth] Tiny rate limit reached on page ${round + 1}; waiting ${RATE_LIMIT_BACKOFF_MS}ms before retrying`
          );
          await sleep(RATE_LIMIT_BACKOFF_MS);
          continue;
        }
        throw err;
      }
      round++;

      const itens = (res as any).itens ?? [];
      if (!itens.length) {
        console.log('[syncMonth] no more items, finishing');
        break;
      }

      // Enriquecer pedidos com detalhes inline se habilitado
      if (ENABLE_INLINE_ENRICHMENT) {
        try {
          const freteMap = await enrichOrdersBatch(accessToken, itens, {
            batchSize: 5,
            delayMs: 500,
            skipIfHasFrete: true,
          });
          
          // Aplicar frete aos itens (tanto no item quanto no raw que será salvo)
          let enriched = 0;
          itens.forEach((item: any) => {
            if (item.id && freteMap.has(item.id)) {
              const freteValue = freteMap.get(item.id);
              item.valorFrete = freteValue;
              // Também adicionar no raw para preservar
              if (!item.raw) item.raw = {};
              item.raw.valorFrete = freteValue;
              enriched++;
            }
          });
          
          if (enriched > 0) {
            console.log(`[syncMonth] enriched ${enriched}/${itens.length} orders with freight`);
          }
        } catch (enrichError: any) {
          console.warn('[syncMonth] inline enrichment failed:', enrichError?.message);
        }
      }

      // Transform and upsert
      const rows = itens.map((it: any) => mapPedidoToOrderRow(it));

      // Buscar pedidos existentes para preservar campos enriquecidos
      const tinyIds = rows.map((r: any) => r.tiny_id);
      const { data: existing } = await supabaseAdmin
        .from('tiny_orders')
        .select('tiny_id, valor_frete, canal')
        .in('tiny_id', tinyIds);

      const existingMap = new Map(
        (existing || []).map(e => [e.tiny_id, { valor_frete: e.valor_frete, canal: e.canal }])
      );

      // Mesclar: preservar valor_frete e canal enriquecidos
      const mergedRows = rows.map((row: any) => {
        const exists = existingMap.get(row.tiny_id);
        if (!exists) return row; // Novo pedido, usar como está

        return {
          ...row,
          // Preservar valor_frete se já existe e é maior que zero
          valor_frete: (exists.valor_frete && exists.valor_frete > 0) 
            ? exists.valor_frete 
            : row.valor_frete,
          // Preservar canal se já existe e não é "Outros"
          canal: (exists.canal && exists.canal !== 'Outros') 
            ? exists.canal 
            : row.canal,
        };
      });

      // upsert in batches
      console.log(`[syncMonth] upserting ${mergedRows.length} orders (preserving enriched fields)`);
      const { error: upsertErr } = await supabaseAdmin
        .from('tiny_orders')
        .upsert(mergedRows, { onConflict: 'tiny_id' });

      if (upsertErr) {
        throw new Error('Erro ao upsert tiny_orders: ' + upsertErr.message);
      }

      totalFetched += rows.length;
      requestsMade += 1;

      // update job progress
      if (jobId) {
        await supabaseAdmin
          .from('sync_jobs')
          .update({
            total_requests: requestsMade,
            total_orders: totalFetched,
          })
          .eq('id', jobId);
      }

      // prepare next page
      offset += limit;
      // safety: if pagination metadata exists and says we're done, break
      const pag = (res as any).paginacao;
      if (pag && typeof pag.total === 'number') {
        if (offset >= (pag.total ?? 0)) break;
      }

      // rate limit: Tiny permite 120 req/min => ~500ms por chamada
      if (PAGE_DELAY_MS > 0) {
        await sleep(PAGE_DELAY_MS);
      }
    }

    console.log('[syncMonth] finished, total orders fetched/upserted:', totalFetched);

    await enrichFreteForRange(start, end);
    await normalizeChannelsLoop();

    if (jobId) {
      await supabaseAdmin.from('sync_jobs').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', jobId);
    }
  } catch (err: any) {
    console.error('[syncMonth] erro durante sync:', err?.message ?? err);
    try {
      if (jobId) {
        await supabaseAdmin.from('sync_jobs').update({ status: 'error', error: String(err?.message ?? err), finished_at: new Date().toISOString() }).eq('id', jobId);
      }
      await supabaseAdmin.from('sync_logs').insert({ job_id: jobId, level: 'error', message: 'Erro no scripts/syncMonth', meta: { error: String(err?.message ?? err) } });
    } catch (e) {
      console.error('[syncMonth] erro ao gravar erro no DB:', e);
    }
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
