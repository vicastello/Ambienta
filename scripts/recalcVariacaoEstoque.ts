import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { parse as parseEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env.local');
loadEnv({ path: envPath });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const parsed = parseEnv(readFileSync(envPath, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k]) process.env[k] = v;
    }
  } catch (err) {
    console.warn('Não foi possível carregar .env.local manualmente', err);
  }
}

const BATCH_SIZE = Number(process.env.RECALC_VARIACAO_BATCH ?? 250);

type ProdutoVariacaoRow = {
  id_produto_tiny: number;
  saldo: number | null;
  reservado: number | null;
  disponivel: number | null;
  raw_payload: Record<string, unknown> | null;
};

async function main() {
  const { supabaseAdmin } = await import('../lib/supabaseAdmin');
  const { computeVariacaoEstoqueTotals } = await import('../lib/productMapper');

  let offset = 0;
  let totalAtualizados = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny,saldo,reservado,disponivel,raw_payload,tipo')
      .eq('tipo', 'V')
      .order('id_produto_tiny', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    const rows = (data || []) as ProdutoVariacaoRow[];
    if (!rows.length) break;

    const updates: ProdutoVariacaoRow[] = [];

    for (const row of rows) {
      const totals = computeVariacaoEstoqueTotals(row.raw_payload as any);
      if (!totals) continue;

      const nextSaldo = totals.saldo ?? null;
      const nextReservado = totals.reservado ?? null;
      const nextDisponivel = totals.disponivel ?? nextSaldo ?? null;

      const hasChanges =
        nextSaldo !== (row.saldo ?? null) ||
        nextReservado !== (row.reservado ?? null) ||
        nextDisponivel !== (row.disponivel ?? null);

      if (!hasChanges) continue;

      updates.push({
        id_produto_tiny: row.id_produto_tiny,
        saldo: nextSaldo,
        reservado: nextReservado,
        disponivel: nextDisponivel,
        raw_payload: row.raw_payload,
      });
    }

    for (const update of updates) {
      const { error: updateError } = await supabaseAdmin
        .from('tiny_produtos')
        .update({
          saldo: update.saldo,
          reservado: update.reservado,
          disponivel: update.disponivel,
        })
        .eq('id_produto_tiny', update.id_produto_tiny);
      if (updateError) throw updateError;
    }

    totalAtualizados += updates.length;
    console.log(
      `Processados ${rows.length} registros (atualizados: ${updates.length}). Offset atual: ${offset}`
    );

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`Concluído. Produtos atualizados: ${totalAtualizados}`);
}

main().catch((err) => {
  console.error('Falha ao recalcular estoques de variações', err);
  process.exit(1);
});
