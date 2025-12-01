import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

function getArgValue(prefix: string): string | undefined {
  const arg = process.argv.find((v) => v.startsWith(prefix));
  if (!arg) return undefined;
  return arg.split('=')[1];
}

function parseDateArg(): string {
  const value = getArgValue('--date=');
  if (value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    console.error('❌ Formato inválido para --date. Use YYYY-MM-DD.');
    process.exit(1);
  }
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

function parseDateRange(): string[] {
  const startRaw = getArgValue('--start=');
  const endRaw = getArgValue('--end=');

  if (startRaw && endRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
      console.error('❌ Formato inválido para --start/--end. Use YYYY-MM-DD.');
      process.exit(1);
    }
    const start = new Date(`${startRaw}T00:00:00.000Z`);
    const end = new Date(`${endRaw}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      console.error('❌ Datas inválidas fornecidas para --start/--end.');
      process.exit(1);
    }
    if (start > end) {
      console.error('❌ --start precisa ser anterior ou igual a --end.');
      process.exit(1);
    }
    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  if (startRaw || endRaw) {
    console.error('❌ Use --start e --end juntos para definir um intervalo.');
    process.exit(1);
  }

  return [parseDateArg()];
}

function parseDelay(): number {
  const raw = Number(process.env.TINY_ITENS_DELAY_MS ?? '1000');
  if (Number.isFinite(raw) && raw >= 200) {
    return raw;
  }
  return 1000;
}

function parseRetries(): number {
  const cliArg = process.argv.find((v) => v.startsWith('--retries='));
  const rawValue = cliArg ? cliArg.split('=')[1] : process.env.TINY_ITENS_RETRIES ?? '2';
  if (!rawValue) return 2;
  const normalized = rawValue.toString().trim().toLowerCase();
  if (['inf', 'infinite', 'unlimited'].includes(normalized)) {
    return Number.POSITIVE_INFINITY;
  }
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return 2;
  if (numeric < 0) return Number.POSITIVE_INFINITY;
  return Math.floor(numeric);
}

function parseForceFlag(): boolean {
  return process.argv.includes('--force') || process.env.TINY_ITENS_FORCE === 'true';
}

async function main() {
  const dates = parseDateRange();

  const accessToken = await getAccessTokenFromDbOrRefresh();
  const delayMs = parseDelay();
  const retries = parseRetries();
  const force = parseForceFlag();

  const retriesLabel = Number.isFinite(retries) ? retries : 'infinite';
  console.log(
    `🚀 Sincronizando itens com delay ${delayMs}ms, até ${retriesLabel} novas tentativas e force=${force}`
  );

  for (const dateStr of dates) {
    console.log(`\n📅 Processando pedidos de ${dateStr}`);
    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);

    const { data: pedidos, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido, data_criacao')
      .gte('data_criacao', start.toISOString())
      .lt('data_criacao', end.toISOString())
      .order('data_criacao', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar pedidos:', error.message);
      process.exit(1);
    }

    const tinyIds = (pedidos ?? [])
      .map((p) => p.tiny_id)
      .filter((id): id is number => typeof id === 'number');

    if (!tinyIds.length) {
      console.log('⚠️  Nenhum pedido encontrado para essa data. Pulando.');
      continue;
    }

    console.log(`📦 Encontrados ${tinyIds.length} pedidos.`);

    try {
      const result = await sincronizarItensPorPedidos(accessToken, tinyIds, {
        delayMs,
        retries,
        force,
      });
      console.log('✅ Resultado:', result);
    } catch (err: any) {
      console.error('❌ Falha ao sincronizar itens:', err?.message ?? err);
      process.exit(1);
    }
  }
}

main();
