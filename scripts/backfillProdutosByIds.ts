#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { obterProduto, obterEstoqueProduto, TinyApiError } from '../lib/tinyApi';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { buildProdutoUpsertPayload } from '../lib/productMapper';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { upsertProduto } from '../src/repositories/tinyProdutosRepository';
import type { TinyProdutosRow } from '../src/types/db-public';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimiter {
  private hits: number[] = [];
  private readonly windowMs = 60_000;

  constructor(private readonly maxPerMinute: number) {}

  async wait() {
    const now = Date.now();
    this.hits = this.hits.filter((hit) => now - hit < this.windowMs);
    while (this.hits.length >= this.maxPerMinute) {
      const oldest = this.hits[0];
      const sleepMs = Math.max(500, this.windowMs - (now - oldest));
      await delay(sleepMs);
      const refreshed = Date.now();
      this.hits = this.hits.filter((hit) => refreshed - hit < this.windowMs);
    }
    this.hits.push(Date.now());
  }
}

const MAX_RPM = Number(process.env.PRODUTOS_BACKFILL_RPM ?? 60);
const limiter = new RateLimiter(Math.max(1, Math.min(MAX_RPM, 120)));

async function tinyRequest<T>(label: string, fn: (token: string) => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    const token = await getAccessTokenFromDbOrRefresh();
    await limiter.wait();
    try {
      return await fn(token);
    } catch (err) {
      if (err instanceof TinyApiError && err.status === 401) {
        continue;
      }
      if (err instanceof TinyApiError && err.status === 429) {
        attempt += 1;
        const waitMs = Math.min(15_000, 2000 * attempt);
        console.warn(`[${label}] 429 recebido. Tentativa ${attempt}, aguardando ${waitMs}ms...`);
        await delay(waitMs);
        continue;
      }
      throw err;
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: {
    file: string;
    max?: number;
    ids?: number[];
    retry?: boolean;
  } = {
    file: path.resolve(process.cwd(), 'tmp/produtos_planilha_sem_cadastro.csv'),
  };

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      options.file = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if (arg.startsWith('--max=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value)) options.max = value;
    } else if (arg.startsWith('--ids=')) {
      const raw = arg.split('=')[1];
      const list = raw
        .split(',')
        .map((chunk) => Number(chunk.trim()))
        .filter((n) => Number.isFinite(n));
      if (list.length) options.ids = list as number[];
    } else if (arg === '--retry' || arg === '--retry=true') {
      options.retry = true;
    } else if (arg === '--retry=false') {
      options.retry = false;
    }
  }

  return options;
}

function readIdsFromFile(filePath: string): number[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de IDs não encontrado: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).slice(1); // descarta cabeçalho
  const ids: number[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const firstComma = trimmed.indexOf(',');
    const idChunk = (firstComma >= 0 ? trimmed.slice(0, firstComma) : trimmed).replace(/"/g, '').trim();
    const idValue = Number(idChunk);
    if (Number.isFinite(idValue)) {
      ids.push(idValue);
    }
  }
  return ids;
}

async function fetchRegistroAtual(id: number): Promise<TinyProdutosRow | null> {
  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('*')
    .eq('id_produto_tiny', id)
    .maybeSingle();
  if (error) throw error;
  return (data as TinyProdutosRow) ?? null;
}

async function processProduto(id: number, retry: boolean) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const detalhe = await tinyRequest('produto', (token) => obterProduto(token, id));
      let estoque = null;
      try {
        estoque = await tinyRequest('estoque', (token) => obterEstoqueProduto(token, id));
      } catch (err) {
        if (err instanceof TinyApiError && err.status === 404) {
          console.warn(`   ⚠️ Estoque não disponível para ${id} (404)`);
        } else {
          console.warn(`   ⚠️ Falha ao obter estoque ${id}:`, err instanceof Error ? err.message : err);
        }
      }
      const registroAtual = await fetchRegistroAtual(id);
      const payload = buildProdutoUpsertPayload({ detalhe, estoque: estoque as any, registroAtual: registroAtual ?? undefined });
      await upsertProduto(payload);
      return;
    } catch (err) {
      if (!retry) throw err;
      const waitMs = Math.min(60_000, 2000 * attempt);
      console.warn(`   ✖ Tentativa ${attempt} falhou para ${id}: ${err instanceof Error ? err.message : err}`);
      console.warn(`     Repetindo em ${waitMs}ms...`);
      await delay(waitMs);
    }
  }
}

async function main() {
  const { file, max, ids, retry = false } = parseArgs();
  const idList = (ids && ids.length ? ids : readIdsFromFile(file)).slice();
  if (!idList.length) {
    console.log('Nenhum ID para processar.');
    return;
  }

  const uniqueIds = Array.from(new Set(idList));
  const totalTarget = typeof max === 'number' && Number.isFinite(max) ? Math.min(max, uniqueIds.length) : uniqueIds.length;

  console.log(`🔁 Backfill direcionado para ${totalTarget}/${uniqueIds.length} produtos.`);

  let processed = 0;
  let success = 0;
  let failures = 0;

  for (const id of uniqueIds) {
    if (processed >= totalTarget) break;
    processed += 1;
    try {
      console.log(`→ (${processed}/${totalTarget}) sincronizando produto ${id}...`);
      await processProduto(id, retry);
      success += 1;
    } catch (err) {
      failures += 1;
      console.error(`   ✖ Erro ao sincronizar ${id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('──────────────────────────────');
  console.log(`✅ Sucesso: ${success}`);
  console.log(`⚠️ Falhas: ${failures}`);
  console.log('──────────────────────────────');

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Erro fatal no backfill direcionado de produtos:', err);
  process.exit(1);
});
