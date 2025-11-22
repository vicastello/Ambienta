import { supabaseAdmin } from './supabaseAdmin';
import { obterPedidoDetalhado, TinyPedidoDetalhado } from './tinyApi';
import { getAccessTokenFromDbOrRefresh } from './tinyAuth';
import { parseValorTiny } from './tinyMapping';

type TinyOrderRow = {
  tiny_id: number;
  numero_pedido: number | null;
  data_criacao: string | null;
  raw: Record<string, any> | null;
};

export interface FreteEnrichmentOptions {
  limit?: number;
  batchSize?: number;
  batchDelayMs?: number;
  startDate?: string;
  endDate?: string;
  newestFirst?: boolean;
  maxRequests?: number;
  dataMinima?: Date;
}

export interface FreteEnrichmentResult {
  requested: number;
  processed: number;
  updated: number;
  failed: number;
  remaining: number;
  newestProcessed: string | null;
  oldestProcessed: string | null;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countOrdersNeedingFrete(filters: {
  startDate?: string;
  endDate?: string;
}): Promise<number> {
  let query = supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id', { count: 'exact', head: true })
    .or('valor_frete.is.null,is_enriched.eq.false');

  if (filters.startDate) {
    query = query.gte('data_criacao', filters.startDate);
  }

  if (filters.endDate) {
    query = query.lte('data_criacao', filters.endDate);
  }

  const { count } = await query;
  return count ?? 0;
}

async function fetchOrdersNeedingFrete(options: FreteEnrichmentOptions): Promise<TinyOrderRow[]> {
  const limit = options.limit ?? 40;
  const newestFirst = options.newestFirst ?? true;

  let query = supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id, numero_pedido, data_criacao, raw')
    .or('valor_frete.is.null,is_enriched.eq.false')
    .order('data_criacao', { ascending: !newestFirst })
    .limit(limit);

  if (options.startDate) {
    query = query.gte('data_criacao', options.startDate);
  }

  if (options.endDate) {
    query = query.lte('data_criacao', options.endDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[freteEnricher] Full error object:', JSON.stringify(error, null, 2));
    throw new Error(`Erro ao buscar pedidos para enriquecimento: ${error.message}`);
  }

  return (data ?? []).filter((row): row is TinyOrderRow => !!row?.tiny_id);
}

function resolveValorFrete(detail: TinyPedidoDetalhado): number {
  const rawValor =
    detail?.valorFrete ??
    (detail as any)?.frete?.valor ??
    (detail as any)?.frete?.valorFrete ??
    0;

  return parseValorTiny(rawValor as any);
}

export async function runFreteEnrichment(
  accessTokenOrOptions?: string | FreteEnrichmentOptions,
  options: FreteEnrichmentOptions = {}
): Promise<FreteEnrichmentResult> {
  // Suportar tanto runFreteEnrichment(token, options) quanto runFreteEnrichment(options)
  let token: string;
  let opts: FreteEnrichmentOptions;
  
  if (typeof accessTokenOrOptions === 'string') {
    token = accessTokenOrOptions;
    opts = options;
  } else {
    opts = accessTokenOrOptions || {};
    token = await getAccessTokenFromDbOrRefresh();
  }

  const batchSize = opts.batchSize ?? 5; // Reduzido para evitar rate limit
  const batchDelayMs = opts.batchDelayMs ?? 3000; // Aumentado para 3s entre batches
  const newestFirst = opts.newestFirst ?? true;
  const maxRequests = opts.maxRequests ?? 30;

  // Se dataMinima foi passada, converter para startDate
  if (opts.dataMinima && !opts.startDate) {
    opts.startDate = opts.dataMinima.toISOString().split('T')[0];
  }

  // Limitar pelo maxRequests
  if (!opts.limit || opts.limit > maxRequests) {
    opts.limit = maxRequests;
  }

  const orders = await fetchOrdersNeedingFrete(opts);
  const requested = orders.length;

  if (!requested) {
    const remaining = await countOrdersNeedingFrete(opts);
    return {
      requested,
      processed: 0,
      updated: 0,
      failed: 0,
      remaining,
      newestProcessed: null,
      oldestProcessed: null,
    };
  }

  let processed = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (order) => {
        const detail = await obterPedidoDetalhado(token, order.tiny_id);
        const valorFrete = resolveValorFrete(detail);
        const mergedRaw = {
          ...(order.raw ?? {}),
          ...detail,
          valorFrete,
        };

        // Buscar canal atual para preservá-lo se já estiver enriquecido
        const { data: current } = await supabaseAdmin
          .from('tiny_orders')
          .select('canal')
          .eq('tiny_id', order.tiny_id)
          .single();

        const updateData: any = {
          valor_frete: valorFrete,
          raw: mergedRaw,
          is_enriched: true,
          updated_at: new Date().toISOString(),
        };

        // NÃO sobrescrever canal se já existe e não é "Outros"
        // O freteEnricher só atualiza o frete, não deve mexer no canal
        // O canal deve ser atualizado apenas pelo channelNormalizer

        const { error } = await supabaseAdmin
          .from('tiny_orders')
          .update(updateData)
          .eq('tiny_id', order.tiny_id);

        if (error) {
          throw new Error(error.message);
        }
      })
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        updated += 1;
      } else {
        failed += 1;
      }
    });

    processed += batch.length;

    if (i + batchSize < orders.length) {
      await sleep(batchDelayMs);
    }
  }

  const remaining = await countOrdersNeedingFrete(opts);
  const firstDate = orders[0]?.data_criacao ?? null;
  const lastDate = orders[orders.length - 1]?.data_criacao ?? null;

  return {
    requested,
    processed,
    updated,
    failed,
    remaining,
    newestProcessed: newestFirst ? firstDate : lastDate,
    oldestProcessed: newestFirst ? lastDate : firstDate,
  };
}
