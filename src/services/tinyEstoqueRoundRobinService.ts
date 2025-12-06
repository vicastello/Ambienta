import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getEstoqueProdutoRealTime } from '@/src/services/tinyEstoqueService';
import { upsertProdutosEstoque } from '@/src/repositories/tinyProdutosRepository';
import type { Database } from '@/src/types/db-public';

type Tables = Database['public']['Tables'];
type TinyProdutosRow = Tables['tiny_produtos']['Row'];
type SyncSettingsRow = Tables['sync_settings']['Row'];

const ROUND_ROBIN_KEY = 'tiny_estoque_round_robin';

type RoundRobinState = {
  last_id: number | null;
};

const parseBatchSize = (value?: number | string | null) => {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const DEFAULT_BATCH_SIZE = parseBatchSize(process.env.TINY_ESTOQUE_BATCH_SIZE) ?? 200;
const HARD_MAX_PRODUCTS_PER_JOB = 200;
const MAX_PRODUCTS_PER_JOB = HARD_MAX_PRODUCTS_PER_JOB;
const MAX_429_PER_JOB = 8;
const SAMPLE_IDS_MAX = 10;
const BASE_REQUEST_DELAY_MS = 450; // ~120 req/min quando não há 429
const RATE_LIMIT_DELAY_MS = 3000; // 3s após 429 para respeitar limite Tiny

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getSyncSettingsRow(): Promise<SyncSettingsRow | null> {
  const { data, error } = await supabaseAdmin
    .from('sync_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle<SyncSettingsRow>();

  if (error) throw error;
  return data ?? null;
}

async function ensureSyncSettingsRow(): Promise<SyncSettingsRow> {
  const existing = await getSyncSettingsRow();
  if (existing) return existing;

  const defaults: Tables['sync_settings']['Insert'] = {
    id: 1,
    auto_sync_enabled: true,
    auto_sync_window_days: 2,
    cron_dias_recent_orders: 2,
    cron_produtos_limit: 30,
    cron_enrich_enabled: true,
    cron_produtos_enabled: true,
    cron_produtos_enrich_estoque: true,
    settings: {} as any,
  };

  const { data, error } = await supabaseAdmin
    .from('sync_settings')
    .upsert(defaults, { onConflict: 'id' })
    .select('*')
    .single<SyncSettingsRow>();

  if (error) throw error;
  return data as SyncSettingsRow;
}

const readState = (row?: SyncSettingsRow | null): RoundRobinState => {
  const anyRow = row as SyncSettingsRow & { settings?: any };
  const lastIdRaw = anyRow?.settings?.[ROUND_ROBIN_KEY]?.last_id;
  const lastId = Number.isFinite(Number(lastIdRaw)) ? Number(lastIdRaw) : null;
  return { last_id: lastId };
};

async function writeState(row: SyncSettingsRow | null, newState: RoundRobinState) {
  const baseRow = row ?? (await ensureSyncSettingsRow());
  const currentSettings = (baseRow as any)?.settings ?? {};
  const nextSettings = {
    ...currentSettings,
    [ROUND_ROBIN_KEY]: {
      ...(currentSettings?.[ROUND_ROBIN_KEY] ?? {}),
      last_id: newState.last_id,
    },
  };

  const { error } = await supabaseAdmin
    .from('sync_settings')
    .update({
      settings: nextSettings,
    })
    .eq('id', 1);

  if (error) throw error;
}

export async function syncTinyEstoqueRoundRobin(options?: { batchSize?: number }) {
  const requestedBatchSize = options?.batchSize && options.batchSize > 0 ? options.batchSize : DEFAULT_BATCH_SIZE;
  const effectiveBatchSize = Math.min(Math.max(1, requestedBatchSize), MAX_PRODUCTS_PER_JOB);

  const settingsRow = await ensureSyncSettingsRow();
  const state = readState(settingsRow);
  const previousLastId = state.last_id;
  console.log('[tinyEstoqueRoundRobin] start', {
    previousLastId,
    requestedBatchSize,
    effectiveBatchSize,
    MAX_PRODUCTS_PER_JOB,
    MAX_429_PER_JOB,
  });

  const baseQuery = supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny')
    .eq('situacao', 'A')
    .order('id_produto_tiny', { ascending: true })
    .limit(effectiveBatchSize);

  let wrapped = false;
  let query = baseQuery;

  if (state.last_id != null) {
    query = query.gt('id_produto_tiny', state.last_id);
  }

  const { data: firstBatch, error: firstError } = await query;
  if (firstError) throw firstError;

  let produtosBatch = (firstBatch || []) as Pick<TinyProdutosRow, 'id_produto_tiny'>[];

  if (!produtosBatch.length) {
    wrapped = true;
    const { data: restartBatch, error: restartError } = await baseQuery;
    if (restartError) throw restartError;
    produtosBatch = (restartBatch || []) as Pick<TinyProdutosRow, 'id_produto_tiny'>[];
  }

  console.log('[tinyEstoqueRoundRobin] batch fetched', {
    totalProductsInBatch: produtosBatch.length,
    effectiveBatchSize,
    firstIds: produtosBatch.slice(0, SAMPLE_IDS_MAX).map((p) => p.id_produto_tiny),
    wrapped,
  });

  if (!produtosBatch.length) {
    await writeState(settingsRow, { last_id: null });
    console.log('[tinyEstoqueRoundRobin] empty batch', { wrapped });
    return { processed: 0, lastId: null, wrapped, rateLimited: false };
  }

  const upserts: {
    id_produto_tiny: number;
    saldo: number;
    reservado: number;
    disponivel: number;
    data_atualizacao_tiny: string;
  }[] = [];
  let rateLimited = false;
  let rateLimitedCount = 0;
  let lastSuccessfulId: number | null = null;
  let processed = 0;
  let rateLimitStopId: number | null = null;
  const processedSampleIds: number[] = [];

  for (const produto of produtosBatch) {
    const id = produto.id_produto_tiny;
    if (!Number.isFinite(id) || id <= 0) continue;

    if (processed >= MAX_PRODUCTS_PER_JOB) {
      break;
    }

    try {
      const snapshot = await getEstoqueProdutoRealTime(id, 'cron_estoque_round_robin');
      upserts.push({
        id_produto_tiny: id,
        saldo: snapshot.saldo,
        reservado: snapshot.reservado,
        disponivel: snapshot.disponivel,
        data_atualizacao_tiny: new Date().toISOString(),
      });
      lastSuccessfulId = id;
      processed += 1;
      if (processedSampleIds.length < SAMPLE_IDS_MAX) {
        processedSampleIds.push(id);
      }
    } catch (error) {
      const status =
        (error as any)?.statusCode ??
        (error as any)?.status ??
        (error as any)?.response?.status ??
        null;
      if (status === 429) {
        rateLimitedCount += 1;
        rateLimited = true;
        await delay(RATE_LIMIT_DELAY_MS);

        if (rateLimitedCount >= MAX_429_PER_JOB) {
          rateLimitStopId = id;
          console.error('[tinyEstoqueRoundRobin] limite de 429 excedido, abortando lote', {
            id_produto_tiny: id,
            rateLimitedCount,
            MAX_429_PER_JOB,
          });
          break; // aborta o lote; cursor não avança
        }

        console.warn('[tinyEstoqueRoundRobin] 429 recebido, tolerando e seguindo', {
          id_produto_tiny: id,
          rateLimitedCount,
          MAX_429_PER_JOB,
        });
        continue;
      }
      console.error('[tinyEstoqueRoundRobin] erro ao buscar estoque', {
        id_produto_tiny: id,
        message: (error as any)?.message,
        status,
      });
      await delay(BASE_REQUEST_DELAY_MS);
      continue;
    }

    if (processed < MAX_PRODUCTS_PER_JOB) {
      await delay(BASE_REQUEST_DELAY_MS);
    }
  }

  if (upserts.length) {
    await upsertProdutosEstoque(upserts);
  }

  const lastProcessedId = lastSuccessfulId ?? null;

  let newLastId: number | null = previousLastId;
  if (lastProcessedId != null && processed > 0) {
    newLastId = lastProcessedId;
  }

  await writeState(settingsRow, { last_id: newLastId });
  console.log('[tinyEstoqueRoundRobin] finish', {
    previousLastId,
    lastSuccessfulId,
    newLastId,
    processed,
    rateLimited,
    rateLimitedCount,
    rateLimitStopId,
    MAX_PRODUCTS_PER_JOB,
    MAX_429_PER_JOB,
    batchSizeRequested: requestedBatchSize,
    effectiveBatchSize,
    wrapped,
    processedSampleIds,
  });

  return {
    processed,
    lastId: newLastId,
    wrapped,
    rateLimited,
  };
}
