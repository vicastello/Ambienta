import { supabaseAdmin } from './supabaseAdmin';
import { sincronizarItensPorPedidos } from './pedidoItensHelper';

export type MissingPedidoRow = {
  id: number;
  tiny_id: number | null;
  numero_pedido: number | null;
  data_criacao: string | null;
};

export type FixMissingPedidoOptions = {
  since: Date;
  limit?: number;
  force?: boolean;
  delayMs?: number;
  retries?: number;
  context?: string;
};

export async function listPedidosSemItens(since: Date, limit = 500): Promise<MissingPedidoRow[]> {
  const { data: pedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, data_criacao')
    .gte('data_criacao', since.toISOString())
    .order('data_criacao', { ascending: false })
    .limit(limit);

  if (!pedidos || !pedidos.length) {
    return [];
  }

  const ids = pedidos.map((pedido) => pedido.id);
  const { data: itens } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', ids);

  const pedidosComItens = new Set((itens ?? []).map((item) => item.id_pedido));
  return (pedidos as MissingPedidoRow[]).filter(
    (pedido) => !pedidosComItens.has(pedido.id) && typeof pedido.tiny_id === 'number'
  );
}

export async function fixMissingPedidoItens(
  accessToken: string,
  options: FixMissingPedidoOptions
): Promise<{ orders: MissingPedidoRow[]; result: Awaited<ReturnType<typeof sincronizarItensPorPedidos>> | null }> {
  const limit = options.limit ?? 500;
  const orders = await listPedidosSemItens(options.since, limit);
  if (!orders.length) {
    return { orders: [], result: null };
  }

  const tinyIds = orders.map((order) => order.tiny_id!).filter((id): id is number => Boolean(id));
  const result = await sincronizarItensPorPedidos(accessToken, tinyIds, {
    delayMs: options.delayMs,
    retries: options.retries,
    force: options.force,
    context: options.context,
  });

  return { orders, result };
}
