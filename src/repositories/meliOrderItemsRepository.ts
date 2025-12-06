import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { MeliOrderItemsInsert, MeliOrderItemsRow } from '@/src/types/db-public';

export async function upsertMeliOrderItems(items: MeliOrderItemsInsert[]): Promise<void> {
  if (!items.length) return;

  const { error } = await supabaseAdmin
    .from('meli_order_items')
    .upsert(items, { onConflict: 'id' });

  if (error) {
    console.error('[meliOrderItemsRepository] upsertMeliOrderItems error', error);
    throw error;
  }
}

export async function listMeliOrderItemsByOrder(orderId: number): Promise<MeliOrderItemsRow[]> {
  const { data, error } = await supabaseAdmin
    .from('meli_order_items')
    .select('*')
    .eq('meli_order_id', orderId)
    .order('id', { ascending: true });

  if (error) {
    console.error('[meliOrderItemsRepository] listMeliOrderItemsByOrder error', error);
    throw error;
  }

  return (data ?? []) as unknown as MeliOrderItemsRow[];
}
