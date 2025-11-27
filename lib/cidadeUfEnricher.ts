// @ts-nocheck
import { supabaseAdmin } from './supabaseAdmin';
import { extractCidadeUfFromRaw } from './tinyMapping';

type CidadeUfOptions = {
  limit?: number;
};

type CidadeUfResult = {
  requested: number;
  updated: number;
  remaining: number;
};

/**
 * Preenche cidade/UF para pedidos que ainda não possuem esses campos
 * usando o raw salvo do Tiny.
 */
export async function enrichCidadeUfMissing(
  options: CidadeUfOptions = {}
): Promise<CidadeUfResult> {
  const limit = options.limit ?? 200;

  const { data, error, count } = await supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id, raw, cidade, uf', { count: 'exact' })
    .or('cidade.is.null,uf.is.null,cidade.eq.,uf.eq.')
    .order('inserted_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Erro ao buscar pedidos sem cidade/uf: ${error.message}`);
  }

  const rows = data ?? [];
  if (!rows.length) {
    return { requested: 0, updated: 0, remaining: count ?? 0 };
  }

  const updates = rows
    .map((row) => {
      const derived = extractCidadeUfFromRaw((row as any).raw);
      const cidade = derived.cidade ?? (row as any).cidade ?? null;
      const uf = derived.uf ?? (row as any).uf ?? null;
      if (!cidade && !uf) return null;
      if (cidade === (row as any).cidade && uf === (row as any).uf) return null;
      return {
        tiny_id: (row as any).tiny_id as number,
        cidade,
        uf,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean) as Array<{ tiny_id: number; cidade: string | null; uf: string | null; updated_at: string }>;

  if (!updates.length) {
    return { requested: rows.length, updated: 0, remaining: count ?? 0 };
  }

  const { error: updateError } = await supabaseAdmin
    .from('tiny_orders')
    .upsert(updates, { onConflict: 'tiny_id' });

  if (updateError) {
    throw new Error(`Erro ao preencher cidade/uf: ${updateError.message}`);
  }

  const remaining = Math.max(0, (count ?? 0) - updates.length);

  return {
    requested: rows.length,
    updated: updates.length,
    remaining,
  };
}
// @ts-nocheck
