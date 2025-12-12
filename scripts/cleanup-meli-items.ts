/**
 * Remove duplicatas em meli_order_items mantendo apenas o primeiro registro por
 * (meli_order_id, sku, unit_price).
 *
 * Uso:
 *   set -a && source .env.local && set +a && npx tsx scripts/cleanup-meli-items.ts
 */
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  const pageSize = 1000;
  let from = 0;
  const all: { id: number; meli_order_id: number; sku: string; unit_price: number | null }[] = [];

  console.log('Carregando meli_order_items...');
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('meli_order_items')
      .select('id, meli_order_id, sku, unit_price')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Total itens carregados: ${all.length}`);

  const toDelete: number[] = [];
  const seen = new Map<string, number>(); // key -> keepId

  for (const row of all) {
    const key = `${row.meli_order_id}||${row.sku || ''}||${row.unit_price ?? 'na'}`;
    if (!seen.has(key)) {
      seen.set(key, row.id);
    } else {
      toDelete.push(row.id);
    }
  }

  console.log(`Duplicatas a remover: ${toDelete.length}`);

  for (let i = 0; i < toDelete.length; i += 500) {
    const chunk = toDelete.slice(i, i + 500);
    const { error } = await supabaseAdmin.from('meli_order_items').delete().in('id', chunk);
    if (error) {
      console.error('Erro ao remover duplicatas:', error.message);
      process.exit(1);
    }
    console.log(`Removidos ${Math.min(i + 500, toDelete.length)} / ${toDelete.length}`);
  }

  console.log('Concluído.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
