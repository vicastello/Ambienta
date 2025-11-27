#!/usr/bin/env tsx
/**
 * Varre todos os pedidos do mês atual no Tiny, compara a situação com o banco
 * e gera um relatório de divergências. Respeita o limite de 120 req/min
 * (usa paginação de 100 com pausa ~600ms entre chamadas => ~100 req/min).
 */

import fs from 'fs';
import path from 'path';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { listarPedidosTinyPorPeriodo, TinyApiError } from '../lib/tinyApi';
import { supabaseAdmin } from '../lib/supabaseAdmin';

type DbOrder = { tiny_id: number | null; numero_pedido: number | null; situacao: number | null };

const PAGE_LIMIT = 100;
const RATE_DELAY_MS = 800; // ~75 req/min, mais seguro

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
        fields: 'situacao,numeroPedido,dataCriacao',
      });
    } catch (err: any) {
      if (err instanceof TinyApiError && err.status === 429) {
        attempt += 1;
        const backoff = Math.min(800 * 2 * attempt, 5000);
        console.warn(`429 do Tiny (tentativa ${attempt}) — aguardando ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

async function loadDbOrders(dataInicial: string, dataFinal: string) {
  const pageSize = 1000;
  let offset = 0;
  const rows: DbOrder[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido, situacao')
      .gte('data_criacao', dataInicial)
      .lte('data_criacao', dataFinal)
      .order('tiny_id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const chunk = (data ?? []) as DbOrder[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }

  const byId = new Map<number, DbOrder>();
  const byNumero = new Map<number, DbOrder>();
  rows.forEach((row) => {
    if (typeof row.tiny_id === 'number') byId.set(row.tiny_id, row);
    if (typeof row.numero_pedido === 'number') byNumero.set(row.numero_pedido, row);
  });

  return { rows, byId, byNumero };
}

async function main() {
  const dataInicial = startOfCurrentMonthIso();
  const dataFinal = isoToday();

  console.log(`🔍 Verificando situações dos pedidos do mês: ${dataInicial} a ${dataFinal}`);

  const { rows: dbRows, byId: dbById, byNumero: dbByNumero } = await loadDbOrders(dataInicial, dataFinal);
  console.log(`📦 Pedidos no banco para o período: ${dbRows.length}`);

  const accessToken = await getAccessTokenFromDbOrRefresh();
  let offset = 0;
  let totalTiny = 0;
  let requestCount = 0;
  const divergencias: Array<{
    tinyId: number | null;
    numeroPedido: number | null;
    situacaoTiny: number | null;
    situacaoDb: number | null;
  }> = [];
  const ausentesNoDb: Array<{ tinyId: number | null; numeroPedido: number | null; situacaoTiny: number | null }> = [];

  while (true) {
    requestCount += 1;
    const res = await fetchPageWithRetry(accessToken, { dataInicial, dataFinal, limit: PAGE_LIMIT, offset });

    const itens = res?.itens ?? [];
    if (!itens.length) break;

    totalTiny += itens.length;
    console.log(`  • Página offset ${offset}: ${itens.length} pedidos (total até agora ${totalTiny})`);

    for (const item of itens) {
      const tinyId = typeof item.id === 'number' ? item.id : null;
      const numeroPedido = typeof item.numeroPedido === 'number' ? item.numeroPedido : null;
      const situacaoTiny = typeof item.situacao === 'number' ? item.situacao : null;

      const dbMatch =
        (tinyId !== null ? dbById.get(tinyId) : undefined) ??
        (numeroPedido !== null ? dbByNumero.get(numeroPedido) : undefined);

      if (!dbMatch) {
        ausentesNoDb.push({ tinyId, numeroPedido, situacaoTiny });
        continue;
      }

      const situacaoDb = typeof dbMatch.situacao === 'number' ? dbMatch.situacao : null;
      if (situacaoDb !== situacaoTiny) {
        divergencias.push({ tinyId, numeroPedido, situacaoTiny, situacaoDb });
      }
    }

    offset += PAGE_LIMIT;
    // Respeitar o rate limit com folga
    await sleep(RATE_DELAY_MS);
  }

  console.log(`\n✅ Consulta Tiny concluída: ${totalTiny} pedidos (${requestCount} requisições).`);

  const outDir = path.join(process.cwd(), 'tmp');
  const divergPath = path.join(outDir, 'situacoes_divergentes_mes_atual.csv');
  const missingPath = path.join(outDir, 'situacoes_ausentes_mes_atual.csv');
  fs.mkdirSync(outDir, { recursive: true });

  const divergCsv = ['tiny_id,numero_pedido,situacao_tiny,situacao_db'].concat(
    divergencias.map(
      (d) => `${d.tinyId ?? ''},${d.numeroPedido ?? ''},${d.situacaoTiny ?? ''},${d.situacaoDb ?? ''}`
    )
  );
  fs.writeFileSync(divergPath, divergCsv.join('\n'), 'utf8');

  const missingCsv = ['tiny_id,numero_pedido,situacao_tiny'].concat(
    ausentesNoDb.map((d) => `${d.tinyId ?? ''},${d.numeroPedido ?? ''},${d.situacaoTiny ?? ''}`)
  );
  fs.writeFileSync(missingPath, missingCsv.join('\n'), 'utf8');

  console.log('\nResumo:');
  console.log(`  • Pedidos Tiny no período: ${totalTiny}`);
  console.log(`  • Pedidos no banco no período: ${dbRows.length}`);
  console.log(`  • Divergências de situação: ${divergencias.length} (csv: ${divergPath})`);
  console.log(`  • Pedidos presentes no Tiny mas ausentes no banco: ${ausentesNoDb.length} (csv: ${missingPath})`);

  if (divergencias.length === 0 && ausentesNoDb.length === 0) {
    console.log('\n🎉 Nenhuma divergência encontrada.');
  } else {
    console.log('\n⚠️  Verifique os arquivos CSV para corrigir as inconsistências.');
  }
}

main().catch((err) => {
  console.error('Erro ao verificar situações:', err);
  process.exit(1);
});
