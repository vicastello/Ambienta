#!/usr/bin/env tsx
/**
 * Deduplica tiny_pedido_itens de forma agressiva:
 * - Agrupa por (id_pedido, codigo_produto, valor_unitario arredondado a 2 casas).
 * - Soma quantidade e valor_total.
 * - Mantém o menor id para o grupo, atualiza quantidade/valor_total e remove os demais.
 * Use .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
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

type Item = {
  id: number;
  id_pedido: number;
  codigo_produto: string | null;
  quantidade: number;
  valor_unitario: number | null;
  valor_total: number | null;
};

async function run() {
  console.log('=== DEEP DEDUP tiny_pedido_itens ===');

  const groups = new Map<
    string,
    { keep: Item; sumQtd: number; sumValor: number; drop: number[] }
  >();

  let from = 0;
  const size = 2000;

  while (true) {
    const { data, error } = await supabase
      .from('tiny_pedido_itens')
      .select('id, id_pedido, codigo_produto, quantidade, valor_unitario, valor_total')
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data as Item[]) {
      const vu = row.valor_unitario ?? 0;
      const vuRounded = Math.round(vu * 100) / 100;
      const key = `${row.id_pedido}|${row.codigo_produto ?? 'SEM-CODIGO'}|${vuRounded}`;
      const current = groups.get(key);
      if (!current) {
        groups.set(key, {
          keep: row,
          sumQtd: row.quantidade ?? 0,
          sumValor: row.valor_total ?? 0,
          drop: [],
        });
      } else {
        current.sumQtd += row.quantidade ?? 0;
        current.sumValor += row.valor_total ?? 0;
        current.drop.push(row.id);
      }
    }

    if (data.length < size) break;
    from += size;
  }

  const toUpdate: Array<{ id: number; quantidade: number; valor_unitario: number; valor_total: number }> = [];
  const toDelete: number[] = [];

  for (const { keep, sumQtd, sumValor, drop } of groups.values()) {
    if (drop.length === 0) continue;
    const quantidade = sumQtd;
    const valor_total = Math.round((sumValor + Number.EPSILON) * 100) / 100;
    const valor_unitario = quantidade > 0 ? Math.round((valor_total / quantidade + Number.EPSILON) * 100) / 100 : keep.valor_unitario ?? 0;
    toUpdate.push({
      id: keep.id,
      quantidade,
      valor_unitario,
      valor_total,
    });
    toDelete.push(...drop);
  }

  console.log(`Grupos com duplicados: ${toUpdate.length}`);
  console.log(`Linhas a remover: ${toDelete.length}`);

  // Aplica updates
  for (const chunk of chunkArray(toUpdate, 500)) {
    const ids = chunk.map((c) => c.id);
    const { error } = await supabase
      .from('tiny_pedido_itens')
      .upsert(chunk);
    if (error) throw error;
  }

  // Remove duplicados
  for (const chunk of chunkArray(toDelete, 1000)) {
    const { error } = await supabase
      .from('tiny_pedido_itens')
      .delete()
      .in('id', chunk);
    if (error) throw error;
  }

  console.log('Dedup concluído.');
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
