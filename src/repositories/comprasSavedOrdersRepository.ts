import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  ComprasSavedOrderInsert,
  ComprasSavedOrderRow,
  ComprasSavedOrderUpdate,
} from '@/src/types/db-public';
import type { SavedOrder, SavedOrderManualItem, SavedOrderProduct } from '@/src/types/compras';
import { getErrorMessage } from '@/lib/errors';

const TABLE_NAME = 'compras_saved_orders';
const DEFAULT_LIMIT = 200;

const normalizeSavedOrderRow = (row: ComprasSavedOrderRow): SavedOrder => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  periodDays: row.period_days,
  targetDays: row.target_days,
  produtos: (row.produtos as SavedOrderProduct[]) ?? [],
  manualItems: (row.manual_items as SavedOrderManualItem[]) ?? [],
});

export async function listSavedOrders(limit = DEFAULT_LIMIT) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map((row) => normalizeSavedOrderRow(row as ComprasSavedOrderRow));
}

export async function createSavedOrder(payload: {
  name: string;
  periodDays: number;
  targetDays: number;
  produtos: SavedOrderProduct[];
  manualItems: SavedOrderManualItem[];
}) {
  const insertPayload: ComprasSavedOrderInsert = {
    name: payload.name,
    period_days: payload.periodDays,
    target_days: payload.targetDays,
    produtos: payload.produtos,
    manual_items: payload.manualItems,
  } as unknown as ComprasSavedOrderInsert;

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw error;
  return normalizeSavedOrderRow(data as ComprasSavedOrderRow);
}

export async function updateSavedOrderName(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('O nome do pedido não pode ficar vazio.');
  }

  const updatePayload: ComprasSavedOrderUpdate = {
    name: trimmed,
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(getErrorMessage(error) ?? 'Erro ao atualizar pedido');
  return normalizeSavedOrderRow(data as ComprasSavedOrderRow);
}

export async function deleteSavedOrder(id: string) {
  const { error } = await supabaseAdmin.from(TABLE_NAME).delete().eq('id', id);
  if (error) throw error;
}
