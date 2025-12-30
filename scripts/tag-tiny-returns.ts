import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.development.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TAG_NAME = 'devolucao';
const REQUEST_DELAY_MS = Number(process.env.TINY_RATE_LIMIT_BACKOFF_MS ?? '650');
const PAGE_LIMIT = 100;
const CHUNK_SIZE = 200;

const DEFAULT_FROM = '2025-01-01';
const DEFAULT_TO = '2025-12-31';

const toChunks = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const hasReturnMarker = (markers: string[]) =>
  markers.some((marker) => normalizeText(marker).includes('devol'));

const extractMarkers = (payload: any): string[] => {
  const raw =
    payload?.marcadores ??
    payload?.pedido?.marcadores ??
    payload?.pedido?.marcadoresList ??
    payload?.pedido?.marcadoresEtiquetas ??
    payload?.pedido?.marcadores?.marcador;

  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (item?.descricao ?? item?.nome ?? item?.tag ?? item))
      .filter((value) => typeof value === 'string');
  }

  if (typeof raw === 'string') return [raw];
  return [];
};

const getArgValue = (key: string) => {
  const arg = process.argv.find((entry) => entry.startsWith(`${key}=`));
  return arg ? arg.split('=').slice(1).join('=').trim() : null;
};

async function ensureAvailableTag() {
  const { data, error } = await supabase
    .from('available_tags')
    .select('id')
    .eq('name', TAG_NAME)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar available_tags:', error);
    return;
  }

  if (!data) {
    const { error: insertError } = await supabase
      .from('available_tags')
      .insert({ name: TAG_NAME, color: '#f97316', usage_count: 0 });

    if (insertError) {
      console.error('Erro ao criar tag em available_tags:', insertError);
    } else {
      console.log(`✓ Tag "${TAG_NAME}" criada em available_tags`);
    }
  }
}

async function tagTinyReturns() {
  const from = getArgValue('--from') || DEFAULT_FROM;
  const to = getArgValue('--to') || DEFAULT_TO;
  const dryRun = process.argv.includes('--dry-run');
  const maxPagesArg = getArgValue('--max-pages');
  const maxPages = maxPagesArg ? Number(maxPagesArg) : 0;
  const debug = process.argv.includes('--debug');
  const markerFilter = getArgValue('--marker') || 'devolvido';
  const scanMarkers = process.argv.includes('--scan-markers');
  const force = process.argv.includes('--force');

  console.log(`🏷️ Buscando marcadores Tiny entre ${from} e ${to}...`);
  if (dryRun) {
    console.log('⚠️  DRY RUN: sem gravar tags.');
  }
  if (!scanMarkers) {
    console.log(`Filtro Tiny ativo: marcadores="${markerFilter}"`);
  }

  await ensureAvailableTag();

  const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');
  const { listarPedidosTinyPorPeriodo } = await import('../lib/tinyApi');
  const accessToken = await getAccessTokenFromDbOrRefresh();

  if (!scanMarkers) {
    const baseParams = {
      dataInicial: from,
      dataFinal: to,
      limit: 1,
      offset: 0,
      orderBy: 'desc' as const,
      fields:
        'valorFrete,valorTotalPedido,valorTotalProdutos,valorDesconto,valorOutrasDespesas,transportador',
    };

    const filtered = await listarPedidosTinyPorPeriodo(
      accessToken,
      { ...baseParams, marcadores: [markerFilter] },
      'tag_tiny_returns_probe'
    );
    const unfiltered = await listarPedidosTinyPorPeriodo(
      accessToken,
      baseParams,
      'tag_tiny_returns_probe_all'
    );

    const filteredTotal = filtered.total ?? filtered.paginacao?.total ?? 0;
    const unfilteredTotal = unfiltered.total ?? unfiltered.paginacao?.total ?? 0;

    if (filteredTotal === 0) {
      console.log('Nenhum pedido retornado pelo filtro de marcadores. Abortando.');
      return;
    }

    if (unfilteredTotal > 0 && filteredTotal >= unfilteredTotal && !force) {
      console.log('Filtro de marcadores parece inefetivo (totais semelhantes).');
      console.log('Rode com --force para continuar mesmo assim.');
      return;
    }
  }

  let offset = 0;
  let matchedTinyIds: number[] = [];
  let totalFetched = 0;
  let pageIndex = 0;

  while (true) {
    const page = await listarPedidosTinyPorPeriodo(
      accessToken,
      {
        dataInicial: from,
        dataFinal: to,
        limit: PAGE_LIMIT,
        offset,
        orderBy: 'desc',
        fields:
          'valorFrete,valorTotalPedido,valorTotalProdutos,valorDesconto,valorOutrasDespesas,transportador,marcadores',
        ...(scanMarkers ? {} : { marcadores: [markerFilter] }),
      },
      'tag_tiny_returns'
    );

    const items = page.itens ?? [];
    if (items.length === 0) break;

    totalFetched += items.length;
    pageIndex += 1;

    if (debug && pageIndex === 1 && items[0]) {
      console.log('Campos do primeiro item:', Object.keys(items[0]).slice(0, 30));
      console.log('Marcadores do primeiro item:', (items[0] as any)?.marcadores ?? null);
    }

    for (const item of items) {
      if (!scanMarkers) {
        if (typeof item.id === 'number') {
          matchedTinyIds.push(item.id);
        }
        continue;
      }

      const markers = extractMarkers(item);
      if (markers.length === 0) continue;
      if (!hasReturnMarker(markers)) continue;
      if (typeof item.id === 'number') {
        matchedTinyIds.push(item.id);
      }
    }

    if (items.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;

    if (maxPages > 0 && pageIndex >= maxPages) {
      console.log(`⏹️  Parando apos ${pageIndex} paginas (max-pages).`);
      break;
    }

    if (pageIndex % 10 === 0) {
      console.log(`Progresso: paginas=${pageIndex}, pedidos=${totalFetched}, marcados=${matchedTinyIds.length}`);
    }

    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }

  matchedTinyIds = [...new Set(matchedTinyIds)];
  console.log(`Pedidos Tiny com marcador devolucao: ${matchedTinyIds.length}`);

  if (matchedTinyIds.length === 0) {
    return;
  }

  const orderIdMap = new Map<number, number>();
  for (const chunk of toChunks(matchedTinyIds, CHUNK_SIZE)) {
    const { data: orders, error } = await supabase
      .from('tiny_orders')
      .select('id, tiny_id')
      .in('tiny_id', chunk);

    if (error) {
      console.error('Erro ao buscar tiny_orders:', error);
      continue;
    }

    orders?.forEach((order) => {
      if (order.tiny_id) {
        orderIdMap.set(order.tiny_id, order.id);
      }
    });
  }

  const rows = matchedTinyIds
    .map((tinyId) => orderIdMap.get(tinyId))
    .filter((orderId): orderId is number => typeof orderId === 'number')
    .map((orderId) => ({ order_id: orderId, tag_name: TAG_NAME }));

  console.log(`Pedidos Tiny encontrados no banco: ${rows.length}`);

  if (dryRun || rows.length === 0) {
    return;
  }

  let inserted = 0;
  for (const chunk of toChunks(rows, CHUNK_SIZE)) {
    const { error: insertError } = await supabase
      .from('order_tags')
      .upsert(chunk, { onConflict: 'order_id,tag_name' });

    if (insertError) {
      console.error('Erro ao inserir order_tags:', insertError);
    } else {
      inserted += chunk.length;
    }
  }

  console.log('✅ Concluido');
  console.log(`  Total pedidos Tiny analisados: ${totalFetched}`);
  console.log(`  Tags "${TAG_NAME}" aplicadas: ${inserted}`);
}

tagTinyReturns().catch((error) => {
  console.error('Erro inesperado:', error);
  process.exit(1);
});
