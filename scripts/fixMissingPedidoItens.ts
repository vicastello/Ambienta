import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { fixMissingPedidoItens } from '../lib/fixMissingPedidoItens';

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const diasArg = Number(process.argv[2] ?? 3);
  const limitArg = Number(process.argv[3] ?? 400);
  const dias = Number.isFinite(diasArg) && diasArg > 0 ? diasArg : 3;
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 400;

  const since = new Date(Date.now() - dias * DAY_MS);
  const accessToken = await getAccessTokenFromDbOrRefresh();

  console.log(`[fixMissingPedidoItens] buscando pedidos sem itens dos últimos ${dias} dias`);

  const { orders, result } = await fixMissingPedidoItens(accessToken, {
    since,
    limit,
    force: true,
    retries: 3,
    delayMs: 800,
    context: 'script_fix_missing_itens',
  });

  console.log(`encontrados ${orders.length} pedidos sem itens.`, { result });
  if (orders.length) {
    console.log(
      orders.map((order) => ({ tiny_id: order.tiny_id, id_pedido: order.id, numero_pedido: order.numero_pedido }))
    );
  }
}

main().catch((error) => {
  console.error('[fixMissingPedidoItens] erro inesperado', (error as Error).message ?? error);
  process.exit(1);
});
