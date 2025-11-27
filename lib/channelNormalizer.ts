// @ts-nocheck
import { supabaseAdmin } from './supabaseAdmin';
import { deriveCanalFromRaw } from './tinyMapping';

export interface ChannelNormalizationResult {
  requested: number;
  updated: number;
  remaining: number;
}

export interface ChannelNormalizationOptions {
  limit?: number;
  includeOutros?: boolean;
}

export async function normalizeMissingOrderChannels(
  options: ChannelNormalizationOptions = {}
): Promise<ChannelNormalizationResult> {
  const limit = options.limit ?? 200;
  const includeOutros = options.includeOutros ?? false;

  const filters = ['canal.is.null', 'canal.eq.""'];
  if (includeOutros) {
    filters.push('canal.eq.Outros');
  }

  const { data, error, count } = await supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id, raw, canal', { count: 'exact' })
    .or(filters.join(','))
    .limit(limit);

  if (error) {
    throw new Error(`Erro ao buscar pedidos sem canal: ${error.message}`);
  }

  const rows = data ?? [];
  const pending = count ?? 0;

  if (!rows.length) {
    return { requested: 0, updated: 0, remaining: pending };
  }

  const updates = rows
    .map((row) => {
      const derived = deriveCanalFromRaw(row.raw);
      if (!derived || derived === 'Outros') return null;
      return {
        tiny_id: row.tiny_id,
        canal: derived,
      };
    })
    .filter(Boolean) as Array<{ tiny_id: number; canal: string }>;

  if (!updates.length) {
    return { requested: rows.length, updated: 0, remaining: pending };
  }

  // Usar Promise.all para atualizar apenas o campo canal de cada pedido
  const updatePromises = updates.map(({ tiny_id, canal }) =>
    supabaseAdmin
      .from('tiny_orders')
      .update({ canal, updated_at: new Date().toISOString() })
      .eq('tiny_id', tiny_id)
  );

  const results = await Promise.allSettled(updatePromises);
  const failedCount = results.filter(r => r.status === 'rejected').length;
  
  if (failedCount > 0) {
    console.warn(`[channelNormalizer] ${failedCount} updates failed`);
  }

  const updateError = results.find(r => r.status === 'rejected' && (r as any).reason);
  if (updateError && failedCount === updates.length) {
    throw new Error(`Erro ao normalizar canais: ${(updateError as any).reason?.message || 'Unknown error'}`);
  }

  const remaining = pending - updates.length;

  return {
    requested: rows.length,
    updated: updates.length - failedCount,
    remaining: remaining > 0 ? remaining : 0,
  };
}
// @ts-nocheck
