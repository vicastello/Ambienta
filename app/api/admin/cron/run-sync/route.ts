import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { callInternalJson } from '@/lib/internalApi';
import { getErrorMessage } from '@/lib/errors';
import {
  getSyncSettings,
  normalizeCronSettings,
} from '@/src/repositories/syncRepository';
import type { Database, Json } from '@/src/types/db-public';

type StepName = 'orders' | 'enrich' | 'produtos';
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
