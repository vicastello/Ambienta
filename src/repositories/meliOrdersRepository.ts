import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { MeliOrdersInsert, MeliOrdersRow } from '@/src/types/db-public';

export async function upsertMeliOrders(orders: MeliOrdersInsert[]): Promise<void> {
  if (!orders.length) return;

  const { error } = await supabaseAdmin
    .from('meli_orders')
    .upsert(orders, { onConflict: 'meli_order_id' });

  if (error) {
    console.error('[meliOrdersRepository] upsertMeliOrders error', error);
    throw error;
  }
}

export async function listMeliOrdersByPeriod(params: {
  sellerId: number;
  from: string;
  to: string;
  limit?: number;
  offset?: number;
}): Promise<MeliOrdersRow[]> {
  const { sellerId, from, to, limit = 100, offset = 0 } = params;

  const { data, error } = await supabaseAdmin
    .from('meli_orders')
    .select('*')
    .eq('seller_id', sellerId)
    .gte('date_created', from)
    .lte('date_created', to)
    .order('date_created', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[meliOrdersRepository] listMeliOrdersByPeriod error', error);
    throw error;
  }

  return (data ?? []) as unknown as MeliOrdersRow[];
}
