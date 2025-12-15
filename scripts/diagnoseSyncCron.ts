import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const candidates = ['.env.local', '.env', '.env.local.bak'];
  for (const name of candidates) {
    const full = resolve(process.cwd(), name);
    if (existsSync(full)) {
      dotenvConfig({ path: full });
    }
  }
}

loadEnv();

type StepName = 'orders' | 'enrich' | 'produtos';
const STEP_ORDER: StepName[] = ['orders', 'enrich', 'produtos'];
const RUN_WINDOW_MS = 5 * 60 * 1000;

type SyncLogRow = {
  id: number;
  created_at: string;
  level: string;
  message: string;
  meta: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStep(meta: unknown): StepName | null {
  if (!isObject(meta)) return null;
  const step = meta.step;
  if (step === 'orders' || step === 'enrich' || step === 'produtos') return step;
  return null;
}

function formatAge(iso: string | null) {
  if (!iso) return 'n/d';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'n/d';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${hours}h${rest.toString().padStart(2, '0')}m`;
}

async function main() {
  console.log('--- Diagnose Tiny → Supabase (cron/sync) ---');

  const { supabaseAdmin } = await import('../lib/supabaseAdmin');

  const [{ data: settings, error: settingsError }, { data: logs, error: logsError }] = await Promise.all([
    supabaseAdmin
      .from('sync_settings')
      .select('id, auto_sync_enabled, cron_dias_recent_orders, cron_enrich_enabled, cron_produtos_enabled, cron_produtos_limit, cron_produtos_enrich_estoque, created_at, updated_at')
      .eq('id', 1)
      .maybeSingle(),
    supabaseAdmin
      .from('sync_logs')
      .select('id, created_at, level, message, meta')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (settingsError) {
    console.log('❌ Erro ao ler sync_settings:', settingsError.message);
  } else {
    console.log('sync_settings:', {
      auto_sync_enabled: settings?.auto_sync_enabled ?? null,
      cron_dias_recent_orders: settings?.cron_dias_recent_orders ?? null,
      cron_enrich_enabled: settings?.cron_enrich_enabled ?? null,
      cron_produtos_enabled: settings?.cron_produtos_enabled ?? null,
      cron_produtos_limit: settings?.cron_produtos_limit ?? null,
      cron_produtos_enrich_estoque: settings?.cron_produtos_enrich_estoque ?? null,
      updated_at: settings?.updated_at ?? null,
    });
  }

  if (logsError) {
    console.log('❌ Erro ao ler sync_logs:', logsError.message);
    return;
  }

  const entries = (logs ?? []) as SyncLogRow[];

  const referenceOrder = entries.find((log) => getStep(log.meta) === 'orders') ?? null;
  const referenceTs = referenceOrder ? new Date(referenceOrder.created_at).getTime() : NaN;

  const runEntries: Partial<Record<StepName, SyncLogRow>> = {};
  if (referenceOrder && Number.isFinite(referenceTs)) {
    runEntries.orders = referenceOrder;

    for (const entry of entries) {
      const step = getStep(entry.meta);
      if (!step) continue;
      if (runEntries[step]) continue;
      const t = new Date(entry.created_at).getTime();
      if (!Number.isFinite(t)) continue;
      if (Math.abs(t - referenceTs) <= RUN_WINDOW_MS) {
        runEntries[step] = entry;
      }
    }
  }

  const steps = STEP_ORDER.map((s) => runEntries[s]).filter(Boolean) as SyncLogRow[];
  const lastRunAt = referenceOrder?.created_at ?? null;
  const lastRunOk = steps.length ? steps.every((s) => s.level !== 'error') : null;
  const lastRunError = steps.find((s) => s.level === 'error') ?? null;

  const cronTrigger = entries.find((e) => e.message?.includes('cron_run_tiny_sync')) ?? null;
  const lastErrorOverall = entries.find((e) => e.level === 'error') ?? null;

  console.log('\nÚltima execução (agrupada por step em 5min):');
  console.log({
    lastRunAt,
    lastRunAge: formatAge(lastRunAt),
    lastRunOk,
    lastRunError: lastRunError?.message ?? null,
    cronTrigger: cronTrigger
      ? { created_at: cronTrigger.created_at, level: cronTrigger.level, message: cronTrigger.message }
      : null,
  });

  console.log('\nSteps da última execução:');
  for (const step of steps) {
    const meta = isObject(step.meta) ? step.meta : null;
    console.log({
      created_at: step.created_at,
      level: step.level,
      message: step.message,
      step: meta?.step ?? null,
      status: meta?.status ?? null,
      jobId: meta?.jobId ?? null,
      processed: meta?.processed ?? null,
    });
  }

  console.log('\nÚltimo erro (geral):');
  console.log(
    lastErrorOverall
      ? {
          created_at: lastErrorOverall.created_at,
          message: lastErrorOverall.message,
          meta: isObject(lastErrorOverall.meta) ? lastErrorOverall.meta : null,
        }
      : null
  );

  const { data: lastOrder, error: lastOrderError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, data_criacao, inserted_at, updated_at')
    .order('inserted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('\nÚltimo pedido no Supabase (tiny_orders):');
  if (lastOrderError) {
    console.log('❌ Erro:', lastOrderError.message);
  } else {
    console.log({
      id: lastOrder?.id ?? null,
      numero_pedido: lastOrder?.numero_pedido ?? null,
      canal: lastOrder?.canal ?? null,
      data_criacao: lastOrder?.data_criacao ?? null,
      inserted_at: lastOrder?.inserted_at ?? null,
      inserted_age: formatAge(lastOrder?.inserted_at ?? null),
      updated_at: lastOrder?.updated_at ?? null,
    });
  }

  console.log('\nAmostra dos 12 logs mais recentes:');
  for (const entry of entries.slice(0, 12)) {
    const meta = isObject(entry.meta) ? entry.meta : null;
    console.log({
      created_at: entry.created_at,
      level: entry.level,
      message: entry.message,
      step: meta?.step ?? null,
      status: meta?.status ?? null,
    });
  }
}

main().catch((err) => {
  console.error('❌ Falha inesperada:', err);
  process.exitCode = 1;
});
