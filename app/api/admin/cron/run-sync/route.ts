import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Database } from '@/src/types/db-public';

const DEFAULT_RECENT_DAYS = 2;
const DEFAULT_PRODUTOS_LIMIT = 30;
const PRODUTOS_HEADER = 'X-AMBIENTA-SYNC-TOKEN';

type StepName = 'orders' | 'enrich' | 'produtos';
type StepResult = {
  name: StepName;
  ok: boolean;
  processed?: number;
  detail?: string;
  meta?: Record<string, any>;
};

type CronRequestBody = {
  diasRecentes?: number;
  enrich?: { enabled?: boolean } | boolean;
  produtos?: {
    enabled?: boolean;
    limit?: number;
    enrichEstoque?: boolean;
    token?: string;
  };
};

type SyncLogsInsert = Database['public']['Tables']['sync_logs']['Insert'];

export const maxDuration = 300;

function resolveBaseUrl() {
  const fromEnv = process.env.INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
    return normalized.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

async function logStep(step: StepName, status: 'ok' | 'error', message: string, meta?: Record<string, any>) {
  const payload: SyncLogsInsert = {
    job_id: null,
    level: status === 'ok' ? 'info' : 'error',
    message,
    meta: { step, status, ...(meta ?? {}) },
  };

  try {
    await supabaseAdmin.from('sync_logs').insert(payload as any);
  } catch (error) {
    console.error('[run-sync] Falha ao registrar sync_logs', error);
  }
}

async function parseJsonResponse(res: Response, fallbackMessage: string) {
  const text = await res.text();
  let json: any = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      console.warn('[run-sync] Resposta não-JSON', fallbackMessage, error);
    }
  }

  if (!res.ok) {
    const message = json?.error || json?.message || fallbackMessage;
    const err = new Error(message);
    (err as any).response = json ?? text;
    (err as any).status = res.status;
    throw err;
  }

  return json;
}

async function callInternalJson(path: string, init?: RequestInit) {
  const baseUrl = resolveBaseUrl();
  const target = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const response = await fetch(target, {
    cache: 'no-store',
    ...init,
    headers,
  });

  return parseJsonResponse(response, `Falha ao chamar ${path}`);
}

function sanitizeNumber(value: unknown, fallback: number) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(req: Request) {
  const body: CronRequestBody = await req.json().catch(() => ({}));
  const diasRecentes = sanitizeNumber(body?.diasRecentes, DEFAULT_RECENT_DAYS);
  const enrichConfig = typeof body?.enrich === 'boolean' ? { enabled: body.enrich } : body?.enrich ?? {};
  const produtosConfig = body?.produtos ?? {};

  const steps: StepResult[] = [];

  try {
    const ordersJson = await callInternalJson('/api/tiny/sync', {
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
  } catch (error: any) {
    const detail = error?.message ?? 'Erro ao sincronizar pedidos recentes';
    const failedStep: StepResult = { name: 'orders', ok: false, detail };
    steps.push(failedStep);
    await logStep('orders', 'error', 'Falha ao sincronizar pedidos recentes', {
      diasRecentes,
      error: detail,
    });
    return NextResponse.json({ ok: false, steps }, { status: 500 });
  }

  const shouldEnrich = enrichConfig.enabled !== false;
  if (shouldEnrich) {
    try {
      const enrichJson = await callInternalJson('/api/tiny/sync/enrich-background', { method: 'GET' });
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
    } catch (error: any) {
      const detail = error?.message ?? 'Erro ao enriquecer pedidos';
      const failedStep: StepResult = { name: 'enrich', ok: false, detail };
      steps.push(failedStep);
      await logStep('enrich', 'error', 'Falha ao rodar enrich background', { error: detail });
      return NextResponse.json({ ok: false, steps }, { status: 500 });
    }
  }

  const produtosEnabled = produtosConfig.enabled !== false;
  if (produtosEnabled) {
    const token = (produtosConfig.token ?? process.env.SYNC_PRODUTOS_SECRET ?? '').trim();
    if (!token) {
      const detail = 'SYNC_PRODUTOS_SECRET não configurado';
      const failedStep: StepResult = { name: 'produtos', ok: false, detail };
      steps.push(failedStep);
      await logStep('produtos', 'error', 'Token ausente para sync de produtos', {});
      return NextResponse.json({ ok: false, steps }, { status: 500 });
    }

    const limit = sanitizeNumber(produtosConfig.limit, DEFAULT_PRODUTOS_LIMIT);
    const enrichEstoque = produtosConfig.enrichEstoque ?? true;

    try {
      const produtosJson = await callInternalJson('/api/produtos/sync', {
        method: 'POST',
        headers: { [PRODUTOS_HEADER]: token },
        body: JSON.stringify({ limit, enrichEstoque, modoCron: true }),
      });

      const produtosStep: StepResult = {
        name: 'produtos',
        ok: true,
        processed: typeof produtosJson?.totalAtualizados === 'number' ? produtosJson.totalAtualizados : undefined,
        detail: 'produtos sincronizados',
        meta: { result: produtosJson },
      };
      steps.push(produtosStep);
      await logStep('produtos', 'ok', 'Sync de produtos executado via cron', {
        limit,
        enrichEstoque,
        summary: produtosJson,
      });
    } catch (error: any) {
      const detail = error?.message ?? 'Erro ao sincronizar produtos';
      const failedStep: StepResult = { name: 'produtos', ok: false, detail };
      steps.push(failedStep);
      await logStep('produtos', 'error', 'Falha no sync de produtos', {
        limit,
        enrichEstoque,
        error: detail,
      });
      return NextResponse.json({ ok: false, steps }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, steps });
}
