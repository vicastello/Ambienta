import { supabaseAdmin } from '../lib/supabaseAdmin';

type OrderSummary = {
  id: number;
  tiny_id: number;
  numero_pedido: number | null;
  data_criacao: string | null;
  itens: number;
};

function buildDates(dateArg?: string) {
  const pivot = dateArg ?? new Date().toISOString().slice(0, 10);
  const start = new Date(`${pivot}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { pivot, start, end };
}

async function main() {
  const { pivot, start, end } = buildDates(process.argv[2]);
  console.log(`[debugPedidosHoje] checando pedidos em ${pivot}`);

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, data_criacao')
    .gte('data_criacao', start.toISOString())
    .lt('data_criacao', end.toISOString())
    .order('data_criacao', { ascending: true });

  if (ordersError) {
    console.error('[debugPedidosHoje] Falha ao buscar pedidos:', ordersError.message);
    process.exit(1);
  }

  if (!orders || orders.length === 0) {
    console.log('[debugPedidosHoje] Nenhum pedido encontrado para a data informada.');
    return;
  }

  const orderIds = orders.map((order) => order.id);
  const { data: itens, error: itensError } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orderIds);

  if (itensError) {
    console.error('[debugPedidosHoje] Falha ao buscar itens:', itensError.message);
    process.exit(1);
  }

  const counts = new Map<number, number>();
  for (const item of itens ?? []) {
    counts.set(item.id_pedido, (counts.get(item.id_pedido) ?? 0) + 1);
  }

  const summary: OrderSummary[] = orders.map((order) => ({
    id: order.id,
    tiny_id: order.tiny_id,
    numero_pedido: order.numero_pedido,
    data_criacao: order.data_criacao,
    itens: counts.get(order.id) ?? 0,
  }));

  const missing = summary.filter((order) => order.itens === 0);

  console.log(`[debugPedidosHoje] ${summary.length} pedidos em ${pivot}, ${missing.length} sem itens.`);
  if (missing.length) {
    console.table(
      missing.map((order) => ({
        tiny_id: order.tiny_id,
        id_pedido: order.id,
        numero_pedido: order.numero_pedido,
        data_criacao: order.data_criacao,
      }))
    );
  }
}

main().catch((err) => {
  console.error('[debugPedidosHoje] Erro inesperado:', err);
  process.exit(1);
});
