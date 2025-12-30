
import type { TinyPedidoListaItem } from '@/lib/tinyApi';
import { mapPedidoToOrderRow } from '@/lib/tinyMapping';
import type { TinyOrdersInsert } from '@/src/types/db-public';

/**
 * Upsert de um pedido Tiny (TinyPedidoListaItem) na tabela tiny_orders.
 */
export async function upsertOrder(pedido: TinyPedidoListaItem) {
  const row: TinyOrdersInsert = mapPedidoToOrderRow(pedido) as unknown as TinyOrdersInsert;
  const admin = supabaseAdmin as any;
  const { error } = await admin
    .from('tiny_orders')
    .upsert(row, { onConflict: 'tiny_id' });
  if (error) throw error;
}
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TinyOrdersRow } from '@/src/types/db-public';

export async function findOrderByTinyId(tinyId: number) {
  const { data, error } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .eq('tiny_id', tinyId)
    .maybeSingle();

  if (error) throw error;
  return data as TinyOrdersRow | null;
}

export async function listRecentOrders(limit = 20) {
  const { data, error } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, data_criacao, valor, canal, situacao, cliente_nome, updated_at')
    .order('data_criacao', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as Pick<TinyOrdersRow, 'id' | 'tiny_id' | 'numero_pedido' | 'data_criacao' | 'valor' | 'canal' | 'situacao' | 'cliente_nome' | 'updated_at'>[];
}
