import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  const date = process.argv[2] ?? '2025-11-27';
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, data_criacao')
    .gte('data_criacao', start.toISOString())
    .lt('data_criacao', end.toISOString())
    .order('data_criacao', { ascending: true });

  if (ordersError) {
    console.error('Erro ao buscar pedidos:', ordersError.message);
    process.exit(1);
  }

  if (!orders?.length) {
    console.log('Nenhum pedido para a data.');
    return;
  }

  const ids = orders.map((o) => o.id);
  const { data: itens, error: itensError } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', ids);

  if (itensError) {
    console.error('Erro ao buscar itens:', itensError.message);
    process.exit(1);
  }

  const counts = new Map<number, number>();
  for (const item of itens ?? []) {
    counts.set(item.id_pedido, (counts.get(item.id_pedido) ?? 0) + 1);
  }

  const summary = orders.map((order) => ({
    tiny_id: order.tiny_id,
    numero_pedido: order.numero_pedido,
    data_criacao: order.data_criacao,
    itens: counts.get(order.id) ?? 0,
  }));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
