#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';

const DEFAULT_CSV_PATH = path.resolve(process.cwd(), 'tmp/produtos_planilha_sem_cadastro.csv');

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { csvPath: string } = { csvPath: DEFAULT_CSV_PATH };
  for (const arg of args) {
    if (arg.startsWith('--csv=')) {
      options.csvPath = path.resolve(process.cwd(), arg.split('=')[1]);
    }
  }
  return options;
}

function extractIds(csvPath: string): number[] {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV não encontrado em ${csvPath}`);
  }
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).slice(1); // remove cabeçalho
  const ids: number[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commaIdx = trimmed.indexOf(',');
    const slice = commaIdx >= 0 ? trimmed.slice(0, commaIdx) : trimmed;
    const numeric = Number(slice.replace(/"/g, '').trim());
    if (Number.isFinite(numeric)) ids.push(numeric);
  }
  return ids;
}

async function resolveExisting(ids: number[]): Promise<Set<number>> {
  const found = new Set<number>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const { data, error } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny')
      .in('id_produto_tiny', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.id_produto_tiny !== null && row.id_produto_tiny !== undefined) {
        found.add(row.id_produto_tiny);
      }
    }
  }
  return found;
}

async function main() {
  const { csvPath } = parseArgs();
  const ids = extractIds(csvPath);
  if (!ids.length) {
    console.log('Nenhum ID encontrado no CSV.');
    return;
  }

  console.log(`📄 CSV: ${csvPath}`);
  console.log(`🔢 IDs únicos no CSV: ${new Set(ids).size}`);

  const existing = await resolveExisting(Array.from(new Set(ids)));
  const missing = ids.filter((id) => !existing.has(id));

  if (!missing.length) {
    console.log('✅ Todos os produtos do CSV estão presentes na tabela tiny_produtos.');
    return;
  }

  console.log(`⚠️ Ainda faltam ${missing.length} produtos no catálogo.`);
  const preview = missing.slice(0, 20).map((id) => ` - ${id}`).join('\n');
  console.log(preview);
}

main().catch((err) => {
  console.error('Erro ao calcular diff da planilha:', err);
  process.exit(1);
});
