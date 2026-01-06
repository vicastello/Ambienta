import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import processJob from '@/lib/syncProcessor';
import { runTinyOrdersIncrementalSync } from '@/src/services/tinySyncService';
import { getErrorMessage } from '@/lib/errors';
import type { Database, Json } from '@/src/types/db-public';

const DAY_MS = 24 * 60 * 60 * 1000;

// Em ambiente serverless, "background" não é confiável.
// Permitimos até 5 minutos para rodar sync recent/repair inline.
export const maxDuration = 300;

type SyncMode = 'full' | 'range' | 'recent' | 'repair' | 'incremental' | 'orders';

type SyncRequestBody = {
  mode?: string;
  diasRecentes?: number | string;
  dataInicial?: string;
  dataFinal?: string;
  background?: boolean | string;
  daysBack?: number | string;
  force?: boolean | string;
};

type SyncJobsInsert = Database['public']['Tables']['sync_jobs']['Insert'];
type SyncLogsInsert = Database['public']['Tables']['sync_logs']['Insert'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseBooleanish = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
};

const parseNumber = (value: unknown, fallback = 0): number => {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(num) ? num : fallback;
};

const isSyncMode = (mode: string | undefined): mode is SyncMode =>
  mode === 'full' ||
  mode === 'range' ||
  mode === 'recent' ||
  mode === 'repair' ||
  mode === 'incremental' ||
  mode === 'orders';

async function logJob(
  jobId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Json
) {
  const payload: SyncLogsInsert = {
    job_id: jobId,
    level,
    message,
    meta: meta ?? null,
  };

  await supabaseAdmin.from('sync_logs').insert(payload);
}

function runJobInBackground(jobId: string) {
  processJob(jobId).catch((error) => {
    console.error(`[API] Job ${jobId} falhou no background`, error);
  });
}

// Normalização de canais/datas/valores veio de lib/tinyMapping para evitar duplicidade

export async function POST(req: NextRequest) {
  let jobId: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('tiny_access_token')?.value ?? null;

    // se não há cookie (ou expirou), tenta usar token persistido + refresh no servidor
    if (!accessToken) {
      try {
        accessToken = await getAccessTokenFromDbOrRefresh();
      } catch (e) {
        return NextResponse.json(
          { message: 'Tiny não está conectado.' },
          { status: 401 }
        );
      }
    }

    const rawBody = await req.json().catch(() => null);
    const body: SyncRequestBody = isRecord(rawBody) ? (rawBody as SyncRequestBody) : {};
    const rawModeFromQuery = searchParams.get('mode') ?? undefined;
    const rawMode = typeof rawModeFromQuery === 'string' ? rawModeFromQuery : typeof body.mode === 'string' ? body.mode : undefined;
    const mode: SyncMode = isSyncMode(rawMode) ? rawMode : 'range';
    if (mode === 'incremental') {
      const result = await runTinyOrdersIncrementalSync();
      return NextResponse.json(result);
    }

    const diasRecentesBody = parseNumber(body.diasRecentes);
    const daysBackParam = searchParams.get('daysBack') ?? body.daysBack ?? body.diasRecentes;
    const daysBack = Math.min(Math.max(parseNumber(daysBackParam, 90), 1), 90);
    const dataInicialParam = typeof (searchParams.get('dataInicial') ?? body.dataInicial) === 'string'
      ? (searchParams.get('dataInicial') ?? body.dataInicial)!
      : undefined;
    const dataFinalParam = typeof (searchParams.get('dataFinal') ?? body.dataFinal) === 'string'
      ? (searchParams.get('dataFinal') ?? body.dataFinal)!
      : undefined;
    const force = parseBooleanish(searchParams.get('force') ?? body.force);

    const hoje = new Date();

    let dataInicialISO: string;
    let dataFinalISO: string;

    if (mode === 'full') {
      // Carga completa
      const dataFinalDate = hoje;
      const dataInicialDate = new Date(2000, 0, 1);
      dataInicialISO = dataInicialDate.toISOString().slice(0, 10);
      dataFinalISO = dataFinalDate.toISOString().slice(0, 10);
    } else if (mode === 'recent' || mode === 'repair') {
      // recent: poucos dias (para sync automático/rápido)
      // repair: janela grande (por exemplo, 90 dias)
      const janelaPadrao = mode === 'repair' ? 90 : 2;
      const janela = diasRecentesBody > 0 ? diasRecentesBody : janelaPadrao;

      const dataFinalDate = hoje;
      const dataInicialDate = new Date(
        dataFinalDate.getTime() - (janela - 1) * DAY_MS
      );
      dataInicialISO = dataInicialDate.toISOString().slice(0, 10);
      dataFinalISO = dataFinalDate.toISOString().slice(0, 10);
    } else if (mode === 'orders') {
      const dataFinalDate = hoje;
      const dataInicialDate = new Date(dataFinalDate.getTime() - (daysBack - 1) * DAY_MS);
      dataInicialISO = dataInicialDate.toISOString().slice(0, 10);
      dataFinalISO = dataFinalDate.toISOString().slice(0, 10);
    } else {
      // range: usa as datas passadas ou últimos 30 dias
      const dataFinalDate = dataFinalParam
        ? new Date(`${dataFinalParam}T00:00:00`)
        : hoje;

      const dataInicialDate = dataInicialParam
        ? new Date(`${dataInicialParam}T00:00:00`)
        : new Date(dataFinalDate.getTime() - 29 * DAY_MS);

      dataInicialISO = dataInicialDate.toISOString().slice(0, 10);
      dataFinalISO = dataFinalDate.toISOString().slice(0, 10);
    }

    // cria job (se background=true, só enfileira como 'queued')
    const background = parseBooleanish(searchParams.get('background') ?? body.background);

    const jobPayload: SyncJobsInsert = {
      id: crypto.randomUUID(),
      status: 'queued',
      started_at: new Date().toISOString(),
      finished_at: null,
      total_requests: null,
      total_orders: null,
      error: null,
      params: {
        mode,
        dataInicial: dataInicialISO,
        dataFinal: dataFinalISO,
        daysBack,
        force,
      } as Json,
    };

    const { data: jobInsert, error: jobError } = await supabaseAdmin
      .from('sync_jobs')
      .insert(jobPayload)
      .select('id')
      .single();

    if (jobError || !jobInsert) {
      throw new Error('Não foi possível criar o job de sync.');
    }

    jobId = jobInsert.id;

    await logJob(jobId, 'info', 'Job criado', {
      mode,
      dataInicial: dataInicialISO,
      dataFinal: dataFinalISO,
      background,
      daysBack,
      force,
    });

    const processInApp = process.env.PROCESS_IN_APP === 'true';
    const shouldAwait =
      processInApp ||
      !background ||
      mode === 'recent' ||
      mode === 'repair';

    if (shouldAwait) {
      await logJob(jobId, 'info', 'Processando job inline', { processInApp, background });
      const res = await processJob(jobId);
      return NextResponse.json({ jobId, queued: false, processedInApp: true, result: res });
    }

    await logJob(jobId, 'info', 'Processando job em background', { background: true });
    runJobInBackground(jobId);
    return NextResponse.json({ jobId, queued: true, processedInApp: false, runningInBackground: true });
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error('[API] /api/tiny/sync erro', err);

    if (jobId) {
      await supabaseAdmin
        .from('sync_jobs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error: message ?? 'Erro desconhecido',
        })
        .eq('id', jobId);

      await logJob(jobId, 'error', 'Job finalizado com erro', {
        error: message ?? 'Erro desconhecido',
      });
    }

    return NextResponse.json(
      {
        message: 'Erro ao executar sincronização com Tiny.',
        details: message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
