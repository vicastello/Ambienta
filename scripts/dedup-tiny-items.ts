#!/usr/bin/env tsx
/**
 * Deduplica itens de pedidos no Tiny.
 * Regra: para cada (id_pedido, codigo_produto, valor_unitario, valor_total),
 * mantém o menor id e remove os demais. Útil quando id_produto_tiny vem nulo
 * e o upsert não evita duplicação.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function run() {
  const start = process.argv[2] || '2025-11-01';
  const end = process.argv[3] || '2025-12-31';

  console.log(`Deduplicando tiny_pedido_itens de ${start} até ${end}...`);

  type Row = {
    id: number;
    id_pedido: number;
    codigo_produto: string | null;
    valor_unitario: number | null;
    valor_total: number | null;
  };

  const groups = new Map<
    string,
    { rows: Row[]; key: string }
  >();

  const pageSize = 2000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('tiny_pedido_itens')
      .select('id, id_pedido, codigo_produto, valor_unitario, valor_total, tiny_orders!inner(data_criacao)')
      .gte('tiny_orders.data_criacao', start)
      .lte('tiny_orders.data_criacao', end)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      const key = [
        row.id_pedido,
        row.codigo_produto ?? 'NULL',
        row.valor_unitario ?? 'NULL',
        row.valor_total ?? 'NULL',
      ].join('|');

      if (!groups.has(key)) groups.set(key, { key, rows: [] });
      groups.get(key)!.rows.push({
        id: row.id,
        id_pedido: row.id_pedido,
        codigo_produto: row.codigo_produto,
        valor_unitario: row.valor_unitario,
        valor_total: row.valor_total,
      });
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const dupGroups = Array.from(groups.values()).filter((g) => g.rows.length > 1);
  if (!dupGroups.length) {
    console.log('Nenhum duplicado encontrado.');
    return;
  }

  console.log(`Encontrados ${dupGroups.length} grupos com duplicação. Removendo excedentes...`);

  let deleted = 0;
  for (const group of dupGroups) {
    const sorted = group.rows.sort((a, b) => a.id - b.id);
    const toDelete = sorted.slice(1).map((r) => r.id);
    if (toDelete.length === 0) continue;

    const { error } = await supabase
      .from('tiny_pedido_itens')
      .delete()
      .in('id', toDelete);
    if (error) throw error;
    deleted += toDelete.length;
  }

  console.log(`Remoção concluída. Linhas deletadas: ${deleted}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
