import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSyncSettings, normalizeCronSettings } from '@/src/repositories/syncRepository';
import { getErrorMessage } from '@/lib/errors';
import type { Database } from '@/src/types/db-public';

type StepName = 'orders' | 'returns' | 'enrich' | 'produtos';
type SyncLogsRow = Database['public']['Tables']['sync_logs']['Row'];
type SelectedLogFields = Pick<SyncLogsRow, 'id' | 'created_at' | 'level' | 'message' | 'meta'>;

type StepSnapshot = {
  id: string;
  name: StepName;
  created_at: string;
  level: string;
  message: string;
  meta: Record<string, unknown> | null;
  ok: boolean;
};

const STEP_ORDER: StepName[] = ['orders', 'returns', 'enrich', 'produtos'];
const RUN_WINDOW_MS = 5 * 60 * 1000; // 5 minutos para agrupar passos da mesma execução

type LogWithMeta = SelectedLogFields & { meta: Record<string, unknown> };

function hasObjectMeta(log: SelectedLogFields | undefined | null): log is LogWithMeta {
  return Boolean(log && log.meta && typeof log.meta === 'object' && !Array.isArray(log.meta));
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('sync_logs')
      .select('id, created_at, level, message, meta')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    const entries: LogWithMeta[] = (data ?? []).filter((log) => hasObjectMeta(log));
    const cronDefaults = normalizeCronSettings(await getSyncSettings());
    const referenceOrder = entries.find((log) => log.meta?.step === 'orders');
    const referenceTimestamp = referenceOrder ? new Date(referenceOrder.created_at).getTime() : undefined;
    const hasReferenceTimestamp = typeof referenceTimestamp === 'number' && Number.isFinite(referenceTimestamp);

    const runEntries: Partial<Record<StepName, StepSnapshot>> = {};
    if (referenceOrder && hasReferenceTimestamp && typeof referenceTimestamp === 'number') {
      runEntries.orders = {
        id: String(referenceOrder.id),
        name: 'orders',
        created_at: referenceOrder.created_at,
        level: referenceOrder.level,
        message: referenceOrder.message,
        meta: referenceOrder.meta ?? null,
        ok: referenceOrder.level !== 'error',
      };

      for (const entry of entries) {
        const stepValue = entry.meta?.step;
        const step = typeof stepValue === 'string' ? (stepValue as StepName) : undefined;
        if (!step) continue;
        if (runEntries[step]) continue;
        const createdAtMs = new Date(entry.created_at).getTime();
        if (!Number.isFinite(createdAtMs)) continue;
        if (Math.abs(createdAtMs - referenceTimestamp) <= RUN_WINDOW_MS) {
          runEntries[step] = {
            id: String(entry.id),
            name: step,
            created_at: entry.created_at,
            level: entry.level,
            message: entry.message,
            meta: entry.meta ?? null,
            ok: entry.level !== 'error',
          };
        }
      }
    }

    const steps = STEP_ORDER.map((step) => runEntries[step]).filter(Boolean) as StepSnapshot[];
    const lastRunAt = referenceOrder?.created_at ?? null;
    const lastRunOk = steps.length ? steps.every((step) => step.level !== 'error') : null;
    const lastErrorEntry = steps.find((step) => step.level === 'error');

    const cronTrigger = entries.find((entry) => entry.message?.includes('cron_run_tiny_sync')) ?? null;

    return NextResponse.json({
      lastRunAt,
      lastRunOk,
      lastError: lastErrorEntry?.message ?? null,
      steps,
      cronTrigger: cronTrigger ? { createdAt: cronTrigger.created_at, message: cronTrigger.message, level: cronTrigger.level } : null,
      schedule: {
        enabled: true,
        expression: '*/15 * * * *',
        description: 'Supabase pg_cron → public.cron_run_tiny_sync() → POST /api/admin/cron/run-sync',
        defaults: {
          diasRecentes: cronDefaults.cron_dias_recent_orders,
          produtosLimit: cronDefaults.cron_produtos_limit,
          enrichEstoque: cronDefaults.cron_produtos_enrich_estoque,
          estoqueOnly: true,
        },
      },
      config: cronDefaults,
    });
  } catch (error: unknown) {
    console.error('[cron-status] erro', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Erro ao consultar status do cron' },
      { status: 500 }
    );
  }
}
