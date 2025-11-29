import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Database } from '@/src/types/db-public';

export type ProdutosSyncCursorRow = Database['public']['Tables']['produtos_sync_cursor']['Row'];
type ProdutosSyncCursorInsert = Database['public']['Tables']['produtos_sync_cursor']['Insert'];
type ProdutosCursorUpdates = Partial<
  Pick<ProdutosSyncCursorRow, 'updated_since' | 'latest_data_alteracao'>
>;

const PRODUTOS_CURSOR_TABLE: keyof Database['public']['Tables'] = 'produtos_sync_cursor';

export async function getProdutosSyncCursor(
  cursorKey: string
): Promise<ProdutosSyncCursorRow | null> {
  const { data, error } = await supabaseAdmin
    .from(PRODUTOS_CURSOR_TABLE)
    .select('*')
    .eq('cursor_key', cursorKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as ProdutosSyncCursorRow;
}

export async function upsertProdutosSyncCursor(
  cursorKey: string,
  updates: ProdutosCursorUpdates
): Promise<ProdutosSyncCursorRow> {
  const payload: ProdutosSyncCursorInsert = {
    cursor_key: cursorKey,
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(updates, 'updated_since')) {
    payload.updated_since = updates.updated_since ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'latest_data_alteracao')) {
    payload.latest_data_alteracao = updates.latest_data_alteracao ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from(PRODUTOS_CURSOR_TABLE)
    .upsert(payload, { onConflict: 'cursor_key' })
    .select('*')
    .single();

  if (error) throw error;
  return data as ProdutosSyncCursorRow;
}
