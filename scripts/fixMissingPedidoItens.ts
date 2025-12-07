import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { fixMissingPedidoItens } from '../lib/fixMissingPedidoItens';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 3;
const DEFAULT_LIMIT = 400;
const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 800;

type CliOptions = {
  days?: number;
  limit?: number;
  force?: boolean;
  retries?: number;
  delayMs?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === '--days' || current === '-d' || current.startsWith('--days=')) {
      const value = current.includes('=') ? current.split('=')[1] : argv[i + 1];
      opts.days = Number(value);
      if (!current.includes('=') && argv[i + 1]) i += 1;
      continue;
    }

    if (current === '--limit' || current === '-l' || current.startsWith('--limit=')) {
      const value = current.includes('=') ? current.split('=')[1] : argv[i + 1];
      opts.limit = Number(value);
      if (!current.includes('=') && argv[i + 1]) i += 1;
      continue;
    }

    if (current === '--retries' || current.startsWith('--retries=')) {
      const value = current.includes('=') ? current.split('=')[1] : argv[i + 1];
      opts.retries = Number(value);
      if (!current.includes('=') && argv[i + 1]) i += 1;
      continue;
    }

    if (current === '--delayMs' || current.startsWith('--delayMs=')) {
      const value = current.includes('=') ? current.split('=')[1] : argv[i + 1];
      opts.delayMs = Number(value);
      if (!current.includes('=') && argv[i + 1]) i += 1;
      continue;
    }

    if (current === '--force') {
      opts.force = true;
      continue;
    }

    if (current === '--no-force') {
      opts.force = false;
      continue;
    }

    if (!current.startsWith('-')) {
      positional.push(current);
    }
  }

  if (positional[0] && opts.days === undefined) {
    opts.days = Number(positional[0]);
  }

  if (positional[1] && opts.limit === undefined) {
    opts.limit = Number(positional[1]);
  }

  return opts;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const diasRaw = cli.days ?? DEFAULT_DAYS;
  const limitRaw = cli.limit ?? DEFAULT_LIMIT;
  const retriesRaw = cli.retries ?? DEFAULT_RETRIES;
  const delayMsRaw = cli.delayMs ?? DEFAULT_DELAY_MS;

  const dias = Number.isFinite(diasRaw) && diasRaw > 0 ? diasRaw : DEFAULT_DAYS;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT;
  const retries = Number.isFinite(retriesRaw) && retriesRaw >= 0 ? retriesRaw : DEFAULT_RETRIES;
  const delayMs = Number.isFinite(delayMsRaw) && delayMsRaw > 0 ? delayMsRaw : DEFAULT_DELAY_MS;
  const force = cli.force ?? true; // manter comportamento anterior (force on)

  const since = new Date(Date.now() - dias * DAY_MS);
  const accessToken = await getAccessTokenFromDbOrRefresh();

  console.log(
    `[fixMissingPedidoItens] buscando pedidos sem itens dos últimos ${dias} dias (limit=${limit}, retries=${retries}, delayMs=${delayMs}, force=${force})`
  );

  const { orders, result, remaining } = await fixMissingPedidoItens(accessToken, {
    since,
    limit,
    force,
    retries,
    delayMs,
    context: 'script_fix_missing_itens',
  });

  const corrected = result?.sucesso ?? 0;
  const stillMissing = (remaining ?? []).length;
  console.log(`encontrados ${orders.length} pedidos sem itens. corrigidos=${corrected}, restantes=${stillMissing}`, {
    result,
  });

  if (orders.length) {
    console.log(
      orders.map((order) => ({ tiny_id: order.tiny_id, id_pedido: order.id, numero_pedido: order.numero_pedido }))
    );
  }

  if (stillMissing) {
    console.log('[fixMissingPedidoItens] Alguns pedidos continuam sem itens; considere aumentar --days/--limit ou rever retries');
  }
}

// Defaults recomendados: dias=3, limit=400, retries=3, delayMs=800ms, force=on
main().catch((error) => {
  console.error('[fixMissingPedidoItens] erro inesperado', (error as Error).message ?? error);
  process.exit(1);
});
