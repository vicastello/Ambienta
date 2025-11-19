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

import 'ts-node/register';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { listarPedidosTinyPorPeriodo } from '../lib/tinyApi';

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  return process.argv[idx].split('=')[1];
}

function formatDateOnly(iso?: string | null) {
  if (!iso) return null;
  // keep only yyyy-mm-dd
  return iso.slice(0, 10);
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

    while (true) {
      round++;
      console.log(`[syncMonth] requesting page ${round} (offset=${offset})`);
      const res = await listarPedidosTinyPorPeriodo(accessToken, {
        dataInicial: start,
        dataFinal: end,
        limit,
        offset,
      });

      const itens = (res as any).itens ?? [];
      if (!itens.length) {
        console.log('[syncMonth] no more items, finishing');
        break;
      }

      // Transform and upsert
      const rows = itens.map((it: any) => {
        return {
          tiny_id: it.id ?? null,
          numero_pedido: it.numeroPedido ?? null,
          situacao: it.situacao ?? null,
          data_criacao: formatDateOnly(it.dataCriacao),
          valor: it.valor ? Number(String(it.valor).replace(',', '.')) : null,
          canal: it.ecommerce?.canal ?? null,
          cliente_nome: it.cliente?.nome ?? null,
          raw: it,
        };
      });

      // upsert in batches
      console.log(`[syncMonth] upserting ${rows.length} orders`);
      const { error: upsertErr } = await supabaseAdmin
        .from('tiny_orders')
        .upsert(rows, { onConflict: 'tiny_id' });

      if (upsertErr) {
        throw new Error('Erro ao upsert tiny_orders: ' + upsertErr.message);
      }

      totalFetched += rows.length;

      // update job progress
      if (jobId) {
        await supabaseAdmin.from('sync_jobs').update({
          total_requests: (x => (x ?? 0) + 1)(jobRow.total_requests),
          total_orders: (x => (x ?? 0) + rows.length)(jobRow.total_orders),
        }).eq('id', jobId);
      }

      // prepare next page
      offset += limit;
      // safety: if pagination metadata exists and says we're done, break
      const pag = (res as any).paginacao;
      if (pag && typeof pag.total === 'number') {
        if (offset >= (pag.total ?? 0)) break;
      }
    }

    console.log('[syncMonth] finished, total orders fetched/upserted:', totalFetched);

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
