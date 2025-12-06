#!/usr/bin/env tsx
/**
 * Sincroniza situações dos pedidos do mês atual a partir do Tiny,
 * preservando frete/canal já enriquecidos e inserindo pedidos ausentes.
 * Respeita limite de requisições (delay ~800ms + backoff em 429).
 */

import { listarPedidosTinyPorPeriodo, TinyApiError, TinyPedidoListaItem } from '../lib/tinyApi';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { mapPedidoToOrderRow } from '../lib/tinyMapping';
import { upsertOrdersPreservingEnriched } from '../lib/syncProcessor';

const PAGE_LIMIT = 100;
const BASE_DELAY_MS = 800; // ~75 req/min

function isoToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function startOfCurrentMonthIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const local = new Date(start.getTime() - start.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageWithRetry(
  accessToken: string,
  params: { dataInicial: string; dataFinal: string; limit: number; offset: number }
) {
  let attempt = 0;
  while (true) {
    try {
      return await listarPedidosTinyPorPeriodo(accessToken, {
        ...params,
        orderBy: 'asc',
      }, 'cron_pedidos');
    } catch (err: any) {
      if (err instanceof TinyApiError && err.status === 429) {
        attempt += 1;
        const backoff = Math.min(BASE_DELAY_MS * 2 * attempt, 5000);
        console.warn(`429 do Tiny (tentativa ${attempt}) — aguardando ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const dataInicial = startOfCurrentMonthIso();
  const dataFinal = isoToday();

  console.log(`🔄 Sincronizando situações do mês: ${dataInicial} a ${dataFinal}`);
  const accessToken = await getAccessTokenFromDbOrRefresh();

  let offset = 0;
  let totalTiny = 0;
  let totalUpserted = 0;
  let pageIndex = 0;

  while (true) {
    pageIndex += 1;
    const page = await fetchPageWithRetry(accessToken, {
      dataInicial,
      dataFinal,
      limit: PAGE_LIMIT,
      offset,
    });

    const itens: TinyPedidoListaItem[] = page?.itens ?? [];
    if (!itens.length) break;

    totalTiny += itens.length;
    console.log(`  • Página ${pageIndex} (offset ${offset}): ${itens.length} pedidos`);

    const rows = itens.map(mapPedidoToOrderRow);
    const { error } = await upsertOrdersPreservingEnriched(rows as any[]);
    if (error) {
      console.error('❌ Erro ao upsert:', error);
      process.exit(1);
    }
    totalUpserted += rows.length;

    offset += PAGE_LIMIT;
    await sleep(BASE_DELAY_MS);
  }

  console.log('\n✅ Concluído.');
  console.log(`  • Pedidos lidos do Tiny: ${totalTiny}`);
  console.log(`  • Upserts efetuados (novo/atualizado): ${totalUpserted}`);
}

main().catch((err) => {
  console.error('Erro na sincronização:', err);
  process.exit(1);
});
