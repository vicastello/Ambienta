// app/api/tiny/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { listarPedidosTiny, listarPedidosTinyPorPeriodo, TinyPedidoListaItem, TinyApiError } from '@/lib/tinyApi';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import processJob from '@/lib/syncProcessor';

const DAY_MS = 24 * 60 * 60 * 1000;

type SyncMode = 'full' | 'range' | 'recent' | 'repair';

function extrairDataISO(dataStr: string | null): string | null {
  if (!dataStr) return null;
  const d = new Date(dataStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseValorTiny(valor: string | null): number {
  if (!valor) return 0;

  const temVirgula = valor.includes(',');
  const temPonto = valor.includes('.');

  let normalizado = valor;

  if (temVirgula) {
    normalizado = valor.replace(/\./g, '').replace(',', '.');
  } else if (temPonto && !temVirgula) {
    normalizado = valor;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logJob(
  jobId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: any
) {
  await supabaseAdmin.from('sync_logs').insert({
    job_id: jobId,
    level,
    message,
    meta: meta ?? null,
  });
}

// Normaliza o canal vindo do Tiny
function normalizarCanalTiny(raw: string | null | undefined): string {
  if (!raw) return 'Outros';

  const v = raw.toLowerCase().trim();

  if (v.includes('shopee')) return 'Shopee';
  if (v.includes('mercado')) return 'Mercado Livre';
  if (v.includes('magalu') || v.includes('magazine')) return 'Magalu';
  if (v.includes('olist')) return 'Olist';
  if (v.includes('amazon')) return 'Amazon';
  if (v.includes('site') || v.includes('loja') || v.includes('ambienta')) {
    return 'Loja própria';
  }

  // se não bater em nada conhecido, devolve o original
  return raw;
}

export async function POST(req: NextRequest) {
  let jobId: string | null = null;

  try {
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('tiny_access_token')?.value || null;

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

    const body = await req.json().catch(() => ({}));
    const mode: SyncMode = (body.mode as SyncMode) || 'range';
    const diasRecentesBody = Number(body.diasRecentes ?? 0);
    const dataInicialParam = body.dataInicial as string | undefined;
    const dataFinalParam = body.dataFinal as string | undefined;

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
    const background = body.background === true || body.background === 'true';

    const jobPayload: any = {
      status: background ? 'queued' : 'running',
      params: { mode, dataInicial: dataInicialISO, dataFinal: dataFinalISO },
    };

    const { data: jobInsert, error: jobError } = await supabaseAdmin
      .from('sync_jobs')
      .insert(jobPayload)
      .select('*')
      .single();

    if (jobError || !jobInsert) {
      throw new Error('Não foi possível criar o job de sync.');
    }

    jobId = jobInsert.id as string;

    await logJob(jobId, 'info', 'Job criado', {
      mode,
      dataInicial: dataInicialISO,
      dataFinal: dataFinalISO,
      background,
    });

    // Sempre delega ao processador único (com chunking, backoff e salvando logs)
    const inApp = process.env.PROCESS_IN_APP === 'true';
    if (inApp) {
      await logJob(jobId, 'info', 'PROCESS_IN_APP enabled — processing job inside the app');
      const res = await processJob(jobId);
      return NextResponse.json({ jobId, queued: false, processedInApp: true, result: res });
    }

    // Sem PROCESS_IN_APP, apenas retorna o job para um worker externo pegar
    return NextResponse.json({ jobId, queued: true });
  } catch (err: any) {
    console.error('[API] /api/tiny/sync erro', err);

    if (jobId) {
      await supabaseAdmin
        .from('sync_jobs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error: err?.message ?? 'Erro desconhecido',
        })
        .eq('id', jobId);

      await logJob(jobId, 'error', 'Job finalizado com erro', {
        error: err?.message ?? 'Erro desconhecido',
      });
    }

    return NextResponse.json(
      {
        message: 'Erro ao executar sincronização com Tiny.',
        details: err?.message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}