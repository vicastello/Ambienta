import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { callInternalJson } from '@/lib/internalApi';
import { getErrorMessage } from '@/lib/errors';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { listarPedidosTinyPorPeriodo } from '@/lib/tinyApi';
import {
  getSyncSettings,
  normalizeCronSettings,
} from '@/src/repositories/syncRepository';
import type { Database, Json } from '@/src/types/db-public';

type StepName = 'orders' | 'returns' | 'enrich' | 'produtos';
type StepResult = {
  name: StepName;
  ok: boolean;
  processed?: number;
  detail?: string;
  meta?: Record<string, unknown>;
};

type CronRequestBody = {
  diasRecentes?: number;
  enrich?: { enabled?: boolean } | boolean;
  produtos?: {
    enabled?: boolean;
    limit?: number;
    enrichEstoque?: boolean;
    estoqueOnly?: boolean;
  };
};

type EffectiveCronConfig = {
  diasRecentes: number;
  enrichEnabled: boolean;
  produtos: {
    enabled: boolean;
    limit: number;
    enrichEstoque: boolean;
    estoqueOnly: boolean;
  };
};

type SyncLogsInsert = Database['public']['Tables']['sync_logs']['Insert'];
type LogMeta = Record<string, unknown>;

type OrdersSyncResponse = {
  jobId?: string;
  result?: { totalOrders?: number; total?: number } | null;
  totalOrders?: number;
};

type EnrichBackgroundResponse = {
  updated?: number;
  enriched?: number;
};

type ProdutosSyncCronResponse = {
  ok?: boolean;
  reason?: string;
  totalAtualizados?: number;
  totalSincronizados?: number;
};

export const maxDuration = 300;
const RETURNS_TAG_NAME = 'devolucao';
const DEFAULT_RETURNS_MARKER = 'devolvido';
const RETURNS_PAGE_LIMIT = 100;
const RETURNS_DELAY_MS = 650;
const RETURNS_CHUNK_SIZE = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toChunks = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const formatDate = (date: Date) => date.toISOString().split('T')[0];

async function ensureReturnsTag() {
  const { data, error } = await supabaseAdmin
    .from('available_tags')
    .select('id')
    .eq('name', RETURNS_TAG_NAME)
    .maybeSingle();

  if (error) {
    console.error('[run-sync] Erro ao buscar available_tags', error);
    return;
  }

  if (!data) {
    const { error: insertError } = await supabaseAdmin
      .from('available_tags')
      .insert({ name: RETURNS_TAG_NAME, color: '#f97316', usage_count: 0 });

    if (insertError) {
      console.error('[run-sync] Erro ao criar tag devolucao', insertError);
    }
  }
}

async function tagTinyReturns(diasRecentes: number) {
  const markerEnv = process.env.TINY_RETURNS_MARKER ?? DEFAULT_RETURNS_MARKER;
  const markers = markerEnv
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (markers.length === 0) {
    return { tagged: 0, matched: 0, skipped: true };
  }

  await ensureReturnsTag();

  const accessToken = await getAccessTokenFromDbOrRefresh();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Math.max(1, diasRecentes));

  const dataInicial = formatDate(startDate);
  const dataFinal = formatDate(endDate);

  let offset = 0;
  let matchedTinyIds: number[] = [];
  let totalFetched = 0;

  while (true) {
    const page = await listarPedidosTinyPorPeriodo(
      accessToken,
      {
        dataInicial,
        dataFinal,
        limit: RETURNS_PAGE_LIMIT,
        offset,
        orderBy: 'desc',
        marcadores: markers,
        fields: 'valorFrete,valorTotalPedido,valorTotalProdutos,valorDesconto,valorOutrasDespesas,transportador',
      },
      'cron_tiny_returns'
    );

    const items = page.itens ?? [];
    if (items.length === 0) {
      break;
    }

    totalFetched += items.length;
    matchedTinyIds.push(
      ...items.map((item) => (typeof item.id === 'number' ? item.id : null)).filter(Boolean)
    );

    if (items.length < RETURNS_PAGE_LIMIT) {
      break;
    }

    offset += RETURNS_PAGE_LIMIT;
    await sleep(RETURNS_DELAY_MS);
  }

  matchedTinyIds = [...new Set(matchedTinyIds)];

  if (matchedTinyIds.length === 0) {
    return { tagged: 0, matched: 0, fetched: totalFetched };
  }

  const orderIdMap = new Map<number, number>();
  for (const chunk of toChunks(matchedTinyIds, RETURNS_CHUNK_SIZE)) {
    const { data: orders, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id')
      .in('tiny_id', chunk);

    if (error) {
      console.error('[run-sync] Erro ao buscar tiny_orders', error);
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
    .map((orderId) => ({ order_id: orderId, tag_name: RETURNS_TAG_NAME }));

  let inserted = 0;
  for (const chunk of toChunks(rows, RETURNS_CHUNK_SIZE)) {
    const { error: insertError } = await supabaseAdmin
      .from('order_tags')
      .upsert(chunk, { onConflict: 'order_id,tag_name' });

    if (insertError) {
      console.error('[run-sync] Erro ao inserir order_tags devolucao', insertError);
    } else {
      inserted += chunk.length;
    }
  }

  return {
    tagged: inserted,
    matched: matchedTinyIds.length,
    fetched: totalFetched,
    markers,
    range: { dataInicial, dataFinal },
  };
}

async function logStep(step: StepName, status: 'ok' | 'error', message: string, meta?: LogMeta) {
  const metaPayload = { step, status, ...(meta ?? {}) };
  const payload: SyncLogsInsert = {
    job_id: null,
    level: status === 'ok' ? 'info' : 'error',
    message,
    meta: metaPayload as Json,
  };

  try {
    await supabaseAdmin.from('sync_logs').insert(payload);
  } catch (error: unknown) {
    console.error('[run-sync] Falha ao registrar sync_logs', error);
  }
}

function formatErrorDetail(error: unknown, fallback: string) {
  const message = getErrorMessage(error);
  if (message) return message;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return fallback;
  }
}

function sanitizeNumber(value: unknown, fallback: number) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function resolveCronConfig(body: CronRequestBody): Promise<EffectiveCronConfig> {
  const settings = normalizeCronSettings(await getSyncSettings());

  const diasRecentes = sanitizeNumber(body?.diasRecentes, settings.cron_dias_recent_orders);

  const enrichOverride =
    typeof body?.enrich === 'boolean'
      ? body.enrich
      : typeof body?.enrich === 'object' && body.enrich
        ? body.enrich.enabled
        : undefined;
  const enrichEnabled =
    typeof enrichOverride === 'boolean' ? enrichOverride : settings.cron_enrich_enabled;

  const produtosOverride = body?.produtos ?? {};
  const produtosEnabled =
    typeof produtosOverride.enabled === 'boolean'
      ? produtosOverride.enabled
      : settings.cron_produtos_enabled;
  const produtosLimit = sanitizeNumber(
    produtosOverride.limit,
    settings.cron_produtos_limit
  );
  const produtosEnrichEstoque =
    typeof produtosOverride.enrichEstoque === 'boolean'
      ? produtosOverride.enrichEstoque
      : typeof settings.cron_produtos_enrich_estoque === 'boolean'
        ? !!settings.cron_produtos_enrich_estoque
        : undefined;
  const produtosEstoqueOnly =
    typeof produtosOverride.estoqueOnly === 'boolean'
      ? produtosOverride.estoqueOnly
      : true;

  return {
    diasRecentes,
    enrichEnabled,
    produtos: {
      enabled: produtosEnabled,
      limit: produtosLimit,
      enrichEstoque: typeof produtosEnrichEstoque === 'boolean' ? produtosEnrichEstoque : produtosEstoqueOnly,
      estoqueOnly: produtosEstoqueOnly,
    },
  };
}

export async function POST(req: Request) {
  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }
  const body = isRecord(rawBody) ? (rawBody as CronRequestBody) : {};
  const config = await resolveCronConfig(body);
  const { diasRecentes, enrichEnabled, produtos } = config;

  const steps: StepResult[] = [];
  let partial = false;

  try {
    const ordersJson = await callInternalJson<OrdersSyncResponse>('/api/tiny/sync', {
      method: 'POST',
      body: JSON.stringify({ mode: 'recent', diasRecentes }),
    });

    const ordersProcessed = ordersJson?.result?.totalOrders ?? ordersJson?.result?.total ?? ordersJson?.totalOrders ?? null;
    const ordersStep: StepResult = {
      name: 'orders',
      ok: true,
      processed: typeof ordersProcessed === 'number' ? ordersProcessed : undefined,
      detail: `job ${ordersJson?.jobId ?? 'n/d'}`,
      meta: { jobId: ordersJson?.jobId ?? null },
    };
    steps.push(ordersStep);
    await logStep('orders', 'ok', 'Pedidos recentes sincronizados via cron', {
      diasRecentes,
      jobId: ordersJson?.jobId ?? null,
      processed: ordersProcessed,
    });
  } catch (error: unknown) {
    const detail = formatErrorDetail(error, 'Erro ao sincronizar pedidos recentes');
    const failedStep: StepResult = { name: 'orders', ok: false, detail };
    steps.push(failedStep);
    await logStep('orders', 'error', 'Falha ao sincronizar pedidos recentes', {
      diasRecentes,
      error: detail,
    });
    return NextResponse.json({ ok: false, steps }, { status: 500 });
  }

  try {
    const returnsResult = await tagTinyReturns(diasRecentes);
    const returnsStep: StepResult = {
      name: 'returns',
      ok: true,
      processed: returnsResult.tagged,
      detail: 'marcadores Tiny',
      meta: returnsResult,
    };
    steps.push(returnsStep);
    await logStep('returns', 'ok', 'Tags de devolucao sincronizadas', {
      diasRecentes,
      result: returnsResult,
      processed: returnsResult.tagged,
    });
  } catch (error: unknown) {
    const detail = formatErrorDetail(error, 'Erro ao sincronizar tags de devolucao');
    const failedStep: StepResult = { name: 'returns', ok: false, detail };
    steps.push(failedStep);
    partial = true;
    await logStep('returns', 'error', 'Falha ao sincronizar tags de devolucao', {
      diasRecentes,
      error: detail,
    });
  }

  if (enrichEnabled) {
    try {
      const enrichJson = await callInternalJson<EnrichBackgroundResponse>('/api/tiny/sync/enrich-background', {
        method: 'GET',
      });
      const updated = enrichJson?.updated ?? enrichJson?.enriched ?? null;
      const enrichStep: StepResult = {
        name: 'enrich',
        ok: true,
        processed: typeof updated === 'number' ? updated : undefined,
        detail: 'frete/canais enriquecidos',
        meta: { result: enrichJson },
      };
      steps.push(enrichStep);
      await logStep('enrich', 'ok', 'Enriquecimento background executado', {
        updated,
        raw: enrichJson,
      });
    } catch (error: unknown) {
      const detail = formatErrorDetail(error, 'Erro ao enriquecer pedidos');
      const failedStep: StepResult = { name: 'enrich', ok: false, detail };
      steps.push(failedStep);
      partial = true;
      await logStep('enrich', 'error', 'Falha ao rodar enrich background', { detail });
    }
  }

  if (produtos.enabled) {
    const { limit, enrichEstoque, estoqueOnly } = produtos;
    const cronPayload = {
      mode: 'cron' as const,
      modoCron: true,
      limit,
      workers: 1,
      estoqueOnly,
      enrichEstoque: enrichEstoque ?? true,
      enrichAtivo: enrichEstoque ?? true,
      modeLabel: 'cron_estoque',
    };

    try {
      const produtosJson = await callInternalJson<ProdutosSyncCronResponse>('/api/produtos/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cronPayload),
      });

      const processed = typeof produtosJson?.totalAtualizados === 'number'
        ? produtosJson.totalAtualizados
        : typeof produtosJson?.totalSincronizados === 'number'
          ? produtosJson.totalSincronizados
          : 0;
      const produtosOk = produtosJson?.ok !== false;
      const produtosDetail = produtosOk
        ? 'produtos sincronizados'
        : produtosJson?.reason ?? 'falha no sync de produtos';
      const produtosStep: StepResult = {
        name: 'produtos',
        ok: produtosOk,
        processed,
        detail: produtosDetail,
        meta: { result: produtosJson, mode: 'cron_estoque', estoqueOnly },
      };
      steps.push(produtosStep);

      await logStep(
        'produtos',
        produtosOk ? 'ok' : 'error',
        produtosOk ? 'Sync de produtos executado via cron' : 'Sync de produtos falhou via cron',
        {
          limit,
          enrichEstoque,
          estoqueOnly,
          summary: produtosJson,
          mode: 'cron_estoque',
        }
      );

      if (!produtosOk) {
        partial = true;
      }
    } catch (error: unknown) {
      const detail = formatErrorDetail(error, 'Erro ao sincronizar produtos');
      const failedStep: StepResult = { name: 'produtos', ok: false, detail };
      steps.push(failedStep);
      partial = true;
      await logStep('produtos', 'error', 'Falha no sync de produtos', {
        limit,
        enrichEstoque,
        estoqueOnly,
        detail,
      });
    }
  }

  const hasFailedStep = partial || steps.some((step) => step.ok === false);
  const responseBody: { ok: boolean; partial?: boolean; steps: StepResult[] } = {
    ok: true,
    steps,
  };

  if (hasFailedStep) {
    responseBody.partial = true;
  }

  return NextResponse.json(responseBody);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
