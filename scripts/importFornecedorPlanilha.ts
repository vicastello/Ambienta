#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env.local');
loadEnv({ path: envPath });

import { supabaseAdmin } from '../lib/supabaseAdmin';
import type { TinyProdutosRow } from '../src/types/db-public';

const normalizeSku = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length
    ? value.trim().toUpperCase()
    : null;

const normalizeSupplierCode = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length ? value.trim().toUpperCase() : null;

const normalizeGtin = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length ? value.trim() : null;

const parseEmbalagem = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/,/g, '.').trim();
  if (!normalized) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
};

type ImportRow = {
  fornecedorCodigo: string | null;
  sku: string | null;
  ean: string | null;
  embalagem: number | null;
  line: number;
};

function parseCsv(filePath: string): ImportRow[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const rows: ImportRow[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(';');
    if (parts.length < 2) return;
    const [codigoFornecedor, sku, ean, embalagem] = parts.map((part) => part?.trim() ?? '');
    rows.push({
      fornecedorCodigo: normalizeSupplierCode(codigoFornecedor),
      sku: normalizeSku(sku),
      ean: normalizeGtin(ean),
      embalagem: parseEmbalagem(embalagem),
      line: index + 1,
    });
  });

  return rows;
}

async function carregarProdutos(): Promise<TinyProdutosRow[]> {
  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny,codigo,gtin');
  if (error) throw error;
  return (data ?? []) as TinyProdutosRow[];
}

async function main() {
  const inputPathArg = process.argv[2] ?? process.env.FORNECEDOR_PLANILHA;
  if (!inputPathArg) {
    console.error('Uso: npx tsx scripts/importFornecedorPlanilha.ts <caminho_csv>');
    process.exit(1);
  }
  const filePath = path.isAbsolute(inputPathArg)
    ? inputPathArg
    : path.resolve(process.cwd(), inputPathArg);

  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  const rows = parseCsv(filePath);
  if (!rows.length) {
    console.log('Nenhuma linha válida encontrada no CSV.');
    return;
  }

  console.log(`📥 Linhas válidas no CSV: ${rows.length}`);

  const produtos = await carregarProdutos();
  const mapPorCodigo = new Map<string, TinyProdutosRow>();
  const mapPorGtin = new Map<string, TinyProdutosRow>();

  for (const produto of produtos) {
    if (produto.codigo) mapPorCodigo.set(produto.codigo.trim().toUpperCase(), produto);
    if (produto.gtin) mapPorGtin.set(produto.gtin.trim(), produto);
  }

  type PendingUpdate = {
    id: number;
    fornecedor_codigo?: string;
    embalagem_qtd?: number;
  };

  const updates: PendingUpdate[] = [];
  const naoEncontrados: ImportRow[] = [];

  for (const row of rows) {
    let produto: TinyProdutosRow | undefined;
    if (row.sku) produto = mapPorCodigo.get(row.sku);
    if (!produto && row.ean) produto = mapPorGtin.get(row.ean);

    if (!produto) {
      naoEncontrados.push(row);
      continue;
    }

    const patch: PendingUpdate = { id: produto.id_produto_tiny };
    if (row.fornecedorCodigo) patch.fornecedor_codigo = row.fornecedorCodigo;
    if (row.embalagem !== null) patch.embalagem_qtd = row.embalagem;

    if (patch.fornecedor_codigo !== undefined || patch.embalagem_qtd !== undefined) {
      updates.push(patch);
    }
  }

  console.log(`🧾 Produtos encontrados para atualização: ${updates.length}`);
  if (!updates.length) {
    console.log('Nada para atualizar.');
  } else {
    let applied = 0;
    for (const update of updates) {
      const patch: Record<string, any> = {};
      if (update.fornecedor_codigo !== undefined) patch.fornecedor_codigo = update.fornecedor_codigo;
      if (update.embalagem_qtd !== undefined) patch.embalagem_qtd = update.embalagem_qtd;
      if (!Object.keys(patch).length) continue;
      const { error } = await supabaseAdmin
        .from('tiny_produtos')
        .update(patch)
        .eq('id_produto_tiny', update.id);
      if (error) throw error;
      applied += 1;
      if (applied % 50 === 0) {
        console.log(`   • ${applied} registros atualizados...`);
      }
    }
    console.log(`✅ Atualizações aplicadas: ${applied}`);
  }

  if (naoEncontrados.length) {
    console.warn(`⚠️  ${naoEncontrados.length} linhas não tiveram correspondência no catálogo.`);
    console.warn(
      naoEncontrados.slice(0, 15).map((row) => `Linha ${row.line}: SKU=${row.sku ?? '-'} · EAN=${row.ean ?? '-'} · Fornecedor=${row.fornecedorCodigo ?? '-'}`).join('\n')
    );
    if (naoEncontrados.length > 15) {
      console.warn('...');
    }
  }
}

main().catch((err) => {
  console.error('Erro ao importar planilha de fornecedores:', err);
  process.exit(1);
});
