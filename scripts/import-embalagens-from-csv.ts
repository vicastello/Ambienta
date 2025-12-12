/**
 * Importa vínculos produto ↔ embalagem a partir do CSV Embalagens.csv (padrão fornecido).
 * Suporta identificação do produto por:
 *  - id_produto_tiny (coluna "Id Tiny") OU
 *  - código (coluna "Código")
 *
 * E da embalagem por:
 *  - código (coluna "Embalagem")  → resolve para embalagens.codigo
 *
 * Quantidade: coluna "Quantidade embalagem" (default 1).
 *
 * Uso:
 *   set -a && source .env.local && set +a && npx tsx scripts/import-embalagens-from-csv.ts Embalagens.csv
 */
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { parse } from 'csv-parse/sync';

interface CsvRow {
  idTiny?: string;
  codigoProduto?: string;
  codigoEmbalagem?: string;
  quantidade?: number;
}

function parseCsv(filePath: string): CsvRow[] {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const records = parse(raw, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  return records.map((row) => {
    const get = (key: string) =>
      Object.entries(row).find(([k]) => k.toLowerCase().includes(key))?.[1]?.trim() || '';
    return {
      idTiny: get('id tiny'),
      codigoProduto: get('código'),
      codigoEmbalagem: get('embalagem'),
      quantidade: Number(get('quantidade')) || 1,
    };
  });
}

async function main() {
  const filePath = process.argv[2] || 'Embalagens.csv';
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Arquivo não encontrado: ${absPath}`);
  }

  const rows = parseCsv(absPath).filter(
    (r) => (r.idTiny && r.idTiny !== '-' && r.idTiny !== '') || (r.codigoProduto && r.codigoProduto !== '')
  );
  console.log(`Linhas para processar: ${rows.length}`);

  // Pré-carrega produtos e embalagens para resolver localmente
  const idsTiny = Array.from(
    new Set(rows.map((r) => r.idTiny).filter((v) => Boolean(v) && v !== '-'))
  ) as string[];
  const codProdutos = Array.from(new Set(rows.map((r) => r.codigoProduto).filter(Boolean))) as string[];
  const codEmbalagens = Array.from(new Set(rows.map((r) => r.codigoEmbalagem).filter(Boolean))) as string[];

  const produtoByCodigo = new Map<string, number>();
  const produtoByIdTiny = new Map<string, number>();
  const embalagemByCodigo = new Map<string, string>();

  // Busca produtos por id_produto_tiny
  if (idsTiny.length) {
    for (let i = 0; i < idsTiny.length; i += 1000) {
      const chunk = idsTiny.slice(i, i + 1000);
      const { data, error } = await supabaseAdmin
        .from('tiny_produtos')
        .select('id, id_produto_tiny')
        .in('id_produto_tiny', chunk);
      if (error) throw error;
      (data || []).forEach((p) => produtoByIdTiny.set(p.id_produto_tiny, p.id));
    }
  }
  // Busca produtos por código
  if (codProdutos.length) {
    for (let i = 0; i < codProdutos.length; i += 1000) {
      const chunk = codProdutos.slice(i, i + 1000);
      const { data, error } = await supabaseAdmin
        .from('tiny_produtos')
        .select('id, codigo')
        .in('codigo', chunk);
      if (error) throw error;
      (data || []).forEach((p) => produtoByCodigo.set(p.codigo, p.id));
    }
  }
  // Busca embalagens por código
  if (codEmbalagens.length) {
    for (let i = 0; i < codEmbalagens.length; i += 1000) {
      const chunk = codEmbalagens.slice(i, i + 1000);
      const { data, error } = await supabaseAdmin
        .from('embalagens')
        .select('id, codigo')
        .in('codigo', chunk);
      if (error) throw error;
      (data || []).forEach((e) => embalagemByCodigo.set(e.codigo, e.id));
    }
  }

  let linked = 0;
  const errors: Array<{ row: CsvRow; reason: string }> = [];
  const reasonCount = new Map<string, number>();
  const upsertMap = new Map<string, { produto_id: number; embalagem_id: string; quantidade: number }>();

  for (const row of rows) {
    const produtoId =
      (row.idTiny && row.idTiny !== '-' && produtoByIdTiny.get(row.idTiny)) ||
      (row.codigoProduto && produtoByCodigo.get(row.codigoProduto)) ||
      null;
    const embalagemId = row.codigoEmbalagem ? embalagemByCodigo.get(row.codigoEmbalagem) : null;
    if (!produtoId) {
      errors.push({ row, reason: 'Produto não encontrado (id_tiny ou código)' });
      reasonCount.set('Produto não encontrado', (reasonCount.get('Produto não encontrado') || 0) + 1);
      continue;
    }
    if (!embalagemId) {
      errors.push({ row, reason: 'Embalagem não encontrada (código)' });
      reasonCount.set('Embalagem não encontrada', (reasonCount.get('Embalagem não encontrada') || 0) + 1);
      continue;
    }
    const quantidade = row.quantidade || 1;
    const key = `${produtoId}||${embalagemId}`;
    upsertMap.set(key, { produto_id: produtoId, embalagem_id: embalagemId, quantidade });
  }

  // Upsert em lotes (usa onConflict na PK natural produto_id + embalagem_id)
  const chunkSize = 500;
  const upserts = Array.from(upsertMap.values());
  for (let i = 0; i < upserts.length; i += chunkSize) {
    const chunk = upserts.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from('produto_embalagens')
      .upsert(chunk, { onConflict: 'produto_id,embalagem_id' });
    if (error) {
      errors.push({ row: { codigoProduto: 'lote', codigoEmbalagem: 'lote' }, reason: error.message });
      reasonCount.set(error.message, (reasonCount.get(error.message) || 0) + 1);
    } else {
      linked += chunk.length;
    }
  }

  console.log(`Vínculos criados/atualizados: ${linked}`);
  if (errors.length) {
    console.log(`Erros (${errors.length}):`);
    errors.slice(0, 50).forEach((e, idx) => {
      console.log(`#${idx + 1}`, e.reason, e.row);
    });
    if (reasonCount.size > 0) {
      console.log('Resumo de erros:');
      for (const [reason, count] of reasonCount.entries()) {
        console.log(`- ${count}x ${reason}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
