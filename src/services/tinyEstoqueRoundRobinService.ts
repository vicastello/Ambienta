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

async function writeState(newState: RoundRobinState) {
  await ensureSyncSettingsRow();
  const { error } = await supabaseAdmin
    .from('sync_settings')
    .update({
      settings: {
        [ROUND_ROBIN_KEY]: {
          last_id: newState.last_id,
        },
      },
    })
    .eq('id', 1);

  if (error) throw error;
}

export async function syncTinyEstoqueRoundRobin(options?: { batchSize?: number }) {
  const batchSize = options?.batchSize && options.batchSize > 0 ? options.batchSize : DEFAULT_BATCH_SIZE;

  const settingsRow = await ensureSyncSettingsRow();
  const state = readState(settingsRow);
  const previousLastId = state.last_id;

  const baseQuery = supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny')
    .eq('situacao', 'A')
    .order('id_produto_tiny', { ascending: true })
    .limit(batchSize);

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

  if (!produtosBatch.length) {
    await writeState({ last_id: null });
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

  for (const produto of produtosBatch) {
    const id = produto.id_produto_tiny;
    if (!Number.isFinite(id) || id <= 0) continue;

    try {
      const snapshot = await getEstoqueProdutoRealTime(id);
      upserts.push({
        id_produto_tiny: id,
        saldo: snapshot.saldo,
        reservado: snapshot.reservado,
        disponivel: snapshot.disponivel,
        data_atualizacao_tiny: new Date().toISOString(),
      });
    } catch (error) {
      const status = (error as any)?.status;
      if (status === 429) {
        console.error('[tinyEstoqueRoundRobin] rate limit 429 ao processar produto, abortando lote', {
          id_produto_tiny: id,
          message: (error as any)?.message,
        });
        rateLimited = true;
        break; // aborta o lote; cursor não avança
      }
      console.error('[tinyEstoqueRoundRobin] erro ao buscar estoque', {
        id_produto_tiny: id,
        message: (error as any)?.message,
        status: (error as any)?.status,
      });
      continue;
    }
  }

  if (upserts.length) {
    await upsertProdutosEstoque(upserts);
  }

  const lastProcessedId = upserts.length
    ? upserts[upserts.length - 1]?.id_produto_tiny ?? null
    : null;

  // Se deu rate limit, não avança o cursor (fica no valor anterior para reprocessar na próxima execução)
  if (!rateLimited) {
    const cursorToPersist =
      lastProcessedId != null ? lastProcessedId : produtosBatch[produtosBatch.length - 1]?.id_produto_tiny ?? null;
    await writeState({ last_id: cursorToPersist });
  } else {
    // Mantém cursor anterior para reprocessar o mesmo lote na próxima execução
    await writeState({ last_id: previousLastId });
  }

  return {
    processed: upserts.length,
    lastId: rateLimited ? previousLastId : lastProcessedId,
    wrapped,
    rateLimited,
  };
}
