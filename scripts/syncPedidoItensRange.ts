import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

function parseDateArg(name: 'start' | 'end', fallback?: string): string {
  const arg = process.argv.find((v) => v.startsWith(`--${name}=`));
  if (arg) {
    const value = arg.split('=')[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    console.error(`❌ Formato inválido para --${name}. Use YYYY-MM-DD.`);
    process.exit(1);
  }
  if (fallback) return fallback;
  const today = new Date();
  const defaultDate = new Date(today);
  if (name === 'start') {
    defaultDate.setUTCDate(today.getUTCDate() - 60);
  }
  return defaultDate.toISOString().slice(0, 10);
}

function parseDelay(): number {
  const raw = Number(process.env.TINY_ITENS_DELAY_MS ?? '1000');
  return Number.isFinite(raw) && raw >= 200 ? raw : 1000;
}

function parseRetries(): number {
  const raw = Number(process.env.TINY_ITENS_RETRIES ?? '2');
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 2;
}

function parseForceFlag(): boolean {
  return process.argv.includes('--force') || process.env.TINY_ITENS_FORCE === 'true';
}

function parseDayGap(): number {
  const raw = Number(process.env.TINY_ITENS_DAY_DELAY_MS ?? '1500');
  return Number.isFinite(raw) && raw >= 0 ? raw : 1500;
}

function toDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    console.error(`❌ Data inválida: ${value}`);
    process.exit(1);
  }
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startStr = parseDateArg('start', undefined);
  const endStr = parseDateArg('end', new Date().toISOString().slice(0, 10));

  const startDate = toDate(startStr);
  const endDate = toDate(endStr);

  if (endDate <= startDate) {
    console.error('❌ A data final deve ser maior que a inicial.');
    process.exit(1);
  }

  const delayMs = parseDelay();
  const retries = parseRetries();
  const force = parseForceFlag();
  const dayDelayMs = parseDayGap();

  console.log('🔄 Sincronizando itens em range');
  console.log(`   • Início: ${formatDate(startDate)}`);
  console.log(`   • Fim (exclusive): ${formatDate(endDate)}`);
  console.log(`   • Delay por pedido: ${delayMs}ms`);
  console.log(`   • Tentativas extras: ${retries}`);
  console.log(`   • Force: ${force}`);
  console.log(`   • Delay entre dias: ${dayDelayMs}ms`);

  const accessToken = await getAccessTokenFromDbOrRefresh();

  let current = new Date(startDate);
  let totalProcessados = 0;
  let totalSucesso = 0;
  let totalFalhas = 0;
  let totalItens = 0;
  const dias: Array<{ data: string; pedidos: number; sucesso: number; falhas: number; itens: number }> = [];

  while (current < endDate) {
    const dayStart = new Date(current);
    const dayEnd = new Date(current);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const dayLabel = formatDate(dayStart);
    console.log(`\n📅 Dia ${dayLabel}`);

    const { data: pedidos, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido, data_criacao')
      .gte('data_criacao', dayStart.toISOString())
      .lt('data_criacao', dayEnd.toISOString())
      .order('data_criacao', { ascending: true });

    if (error) {
      console.error('   ❌ Erro ao buscar pedidos:', error.message);
      dias.push({ data: dayLabel, pedidos: 0, sucesso: 0, falhas: 0, itens: 0 });
      current = dayEnd;
      await sleep(dayDelayMs);
      continue;
    }

    const tinyIds = (pedidos ?? [])
      .map((p) => p.tiny_id)
      .filter((id): id is number => typeof id === 'number');

    if (!tinyIds.length) {
      console.log('   ⚠️  Nenhum pedido encontrado.');
      dias.push({ data: dayLabel, pedidos: 0, sucesso: 0, falhas: 0, itens: 0 });
      current = dayEnd;
      await sleep(dayDelayMs);
      continue;
    }

    console.log(`   📦 ${tinyIds.length} pedidos para sincronizar.`);

    try {
      const result = await sincronizarItensPorPedidos(accessToken, tinyIds, {
        delayMs,
        retries,
        force,
      });
      console.log(
        `   ✅ Resultado -> processados: ${result.processados}, sucesso: ${result.sucesso}, falhas: ${result.falhas}, itens: ${result.totalItens}`
      );
      totalProcessados += result.processados;
      totalSucesso += result.sucesso;
      totalFalhas += result.falhas;
      totalItens += result.totalItens;
      dias.push({
        data: dayLabel,
        pedidos: tinyIds.length,
        sucesso: result.sucesso,
        falhas: result.falhas,
        itens: result.totalItens,
      });
    } catch (err: any) {
      console.error('   ❌ Falha ao sincronizar itens:', err?.message ?? err);
      dias.push({ data: dayLabel, pedidos: tinyIds.length, sucesso: 0, falhas: tinyIds.length, itens: 0 });
    }

    current = dayEnd;
    if (current < endDate && dayDelayMs > 0) {
      await sleep(dayDelayMs);
    }
  }

  console.log('\n═════════════════════════════════════════════════════');
  console.log('   RESUMO GERAL');
  console.log('═════════════════════════════════════════════════════');
  console.log(`   Dias processados: ${dias.length}`);
  console.log(`   Pedidos processados: ${totalProcessados}`);
  console.log(`   Pedidos sucesso: ${totalSucesso}`);
  console.log(`   Pedidos falha: ${totalFalhas}`);
  console.log(`   Total de itens inseridos: ${totalItens}`);
  console.log('═════════════════════════════════════════════════════');

  const falhas = dias.filter((d) => d.falhas > 0);
  if (falhas.length) {
    console.log('\n⚠️  Dias com falhas:');
    falhas.forEach((d) => {
      console.log(`   • ${d.data}: sucesso ${d.sucesso}, falhas ${d.falhas}, itens ${d.itens}`);
    });
  }
}

main().catch((err) => {
  console.error('❌ Erro inesperado:', err?.message ?? err);
  process.exit(1);
});
