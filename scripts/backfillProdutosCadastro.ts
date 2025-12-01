#!/usr/bin/env tsx
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { TinyApiError, obterEstoqueProduto, obterProduto } from '../lib/tinyApi';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { buildProdutoUpsertPayload } from '../lib/productMapper';
import { upsertProduto } from '../src/repositories/tinyProdutosRepository';
import type { TinyProdutosRow } from '../src/types/db-public';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimiter {
  private readonly windowMs = 60_000;
  private hits: number[] = [];

  constructor(private maxPerMinute: number) {}

  async wait() {
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    while (this.hits.length >= this.maxPerMinute) {
      const oldest = this.hits[0];
      const waitFor = Math.max(250, this.windowMs - (now - oldest));
      await delay(waitFor);
      const refreshedNow = Date.now();
      this.hits = this.hits.filter((t) => refreshedNow - t < this.windowMs);
    }
    this.hits.push(Date.now());
  }
}

const MAX_RPM = Number(process.env.PRODUTOS_BACKFILL_RPM ?? 60);
const BATCH_SIZE = Number(process.env.PRODUTOS_BACKFILL_BATCH ?? 10);
const limiter = new RateLimiter(Math.max(1, Math.min(MAX_RPM, 120)));

let accessToken: string | null = null;

async function tinyRequest<T>(label: string, fn: (token: string) => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    if (!accessToken) accessToken = await getAccessTokenFromDbOrRefresh();
    await limiter.wait();
    try {
      return await fn(accessToken);
    } catch (err) {
      if (err instanceof TinyApiError && err.status === 401) {
        accessToken = await getAccessTokenFromDbOrRefresh();
        continue;
      }
      if (err instanceof TinyApiError && err.status === 429) {
        attempt += 1;
        const backoff = Math.min(2000 * attempt, 60000);
        console.warn(`[${label}] 429 recebido. Repetindo após ${backoff}ms (tentativa ${attempt})`);
        await delay(backoff);
        continue;
      }
      throw err;
    }
  }
}

async function fetchProdutosFaltantes(limit: number): Promise<TinyProdutosRow[]> {
  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('*')
    .or('codigo.is.null,tipo.is.null,preco.is.null,fornecedor_nome.is.null')
    .order('updated_at', { ascending: true })
    .limit(limit * 3);
  if (error) throw error;
  const rows = (data ?? []).filter((row) => {
    const codigoInvalido = !row.codigo || !row.codigo.trim();
    const tipoInvalido = !row.tipo;
    const precoInvalido = row.preco === null;
    const fornecedorNomeInvalido = !row.fornecedor_nome || !row.fornecedor_nome.trim?.();
    return codigoInvalido || tipoInvalido || precoInvalido || fornecedorNomeInvalido;
  });
  return rows.slice(0, limit);
}

async function processProduto(row: TinyProdutosRow) {
  const detalhe = await tinyRequest('produto', (token) => obterProduto(token, row.id_produto_tiny, {}));
  let estoque = null;
  try {
    estoque = await tinyRequest('estoque', (token) => obterEstoqueProduto(token, row.id_produto_tiny, {}));
  } catch (err) {
    console.warn(`Estoque indisponível para ${row.id_produto_tiny}:`, err instanceof TinyApiError ? err.status : err);
  }
  const payload = buildProdutoUpsertPayload({
    detalhe: detalhe as any,
    estoque: estoque as any,
    registroAtual: row,
  });
  await upsertProduto(payload);
}

async function main() {
  console.log('🧽 Backfill de cadastro de produtos em execução...');
  let total = 0;
  while (true) {
    const batch = await fetchProdutosFaltantes(BATCH_SIZE);
    if (!batch.length) break;
    for (const row of batch) {
      try {
        await processProduto(row);
        total += 1;
        console.log(`   ✔ Produto ${row.id_produto_tiny} sincronizado (total ${total})`);
      } catch (err) {
        console.error(`   ✖ Falha no produto ${row.id_produto_tiny}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  console.log(`✅ Backfill concluído. Produtos atualizados: ${total}`);
}

main().catch((err) => {
  console.error('Erro fatal no backfill de produtos', err);
  process.exit(1);
});
