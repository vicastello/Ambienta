import { supabaseAdmin } from '../lib/supabaseAdmin';

type OrderSummary = {
  id: number;
  tiny_id: number;
  numero_pedido: number | null;
  data_criacao: string | null;
  itens: number;
};

type DebugArgs = {
  days?: number;
  date?: string;
};

function parseArgs(argv: string[]): DebugArgs {
  const args: DebugArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--days' || current === '-d' || current.startsWith('--days=')) {
      const value = current.includes('=') ? current.split('=')[1] : argv[i + 1];
      args.days = Number(value);
      if (!current.includes('=') && argv[i + 1]) i += 1;
      continue;
    }
    if (!current.startsWith('-') && !args.date) {
      args.date = current;
    }
  }
  return args;
}

function buildWindow(args: DebugArgs) {
  const days = Number.isFinite(args.days) && (args.days as number) > 0 ? (args.days as number) : 1;
  if (days > 1) {
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() + 1); // início do dia seguinte
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - days);
    const label = `últimos ${days} dias`; // inclusive hoje
    return { label, start, end };
  }

  const pivot = args.date ?? new Date().toISOString().slice(0, 10);
  const start = new Date(`${pivot}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { label: pivot, start, end };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { label, start, end } = buildWindow(parsed);
  console.log(`[debugPedidosHoje] checando pedidos em ${label}`);

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
    console.log('[debugPedidosHoje] Nenhum pedido encontrado para a janela informada.');
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

  console.log(`[debugPedidosHoje] ${summary.length} pedidos em ${label}, ${missing.length} sem itens.`);
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
