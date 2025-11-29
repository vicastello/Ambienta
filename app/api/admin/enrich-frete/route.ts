import { NextRequest, NextResponse } from 'next/server';
import { runFreteEnrichment } from '@/lib/freteEnricher';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeMissingOrderChannels } from '@/lib/channelNormalizer';
import { enrichCidadeUfMissing } from '@/lib/cidadeUfEnricher';
import { sincronizarItensPorPedidos } from '@/lib/pedidoItensHelper';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { getErrorMessage } from '@/lib/errors';
import type { Database, Json } from '@/src/types/db-public';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_ITENS_DELAY_MS = 800;
const MAX_DURATION_MS = 300000;

type TinyOrdersTinyIdRow = Pick<
  Database['public']['Tables']['tiny_orders']['Row'],
  'tiny_id'
>;

type SyncLogsInsert = Database['public']['Tables']['sync_logs']['Insert'];

type EnrichFretePayload = {
  mode?: string;
  dataInicial?: string;
  dataFinal?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  batchSize?: number;
  itensDelayMs?: number;
  channelLimit?: number;
  cidadeLimit?: number;
};

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    let rawBody: unknown = {};
    try {
      rawBody = await req.json();
    } catch {
      rawBody = {};
    }
    const body = (rawBody && typeof rawBody === 'object') ? (rawBody as EnrichFretePayload) : {};
    const mode = String(body?.mode ?? 'frete').toLowerCase();
    const startDate = normalizeDateInput(body?.dataInicial ?? body?.startDate);
    const endDate = normalizeDateInput(body?.dataFinal ?? body?.endDate);
    const limit = parseNumberInput(body?.limit);
    const batchSize = parseNumberInput(body?.batchSize);

    if (mode === 'range') {
      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: 'Informe dataInicial e dataFinal (YYYY-MM-DD)' },
          { status: 400 }
        );
      }

      if (!isRangeValid(startDate, endDate)) {
        return NextResponse.json(
          { error: 'dataInicial deve ser anterior ou igual a dataFinal' },
          { status: 400 }
        );
      }

      const result = await runManualRangeEnrichment({
        startDate,
        endDate,
        limit,
        batchSize,
        itensDelayMs: parseNumberInput(body?.itensDelayMs) ?? DEFAULT_ITENS_DELAY_MS,
        channelLimit: parseNumberInput(body?.channelLimit),
        cidadeLimit: parseNumberInput(body?.cidadeLimit),
      });

      return NextResponse.json(result);
    }

    const result = await runFreteEnrichment({
      startDate,
      endDate,
      limit,
      batchSize,
      newestFirst: true,
    });

    return NextResponse.json({
      message: 'Frete enrichment concluído',
      mode: 'frete',
      ...result,
      enriched: result.updated,
      total: result.processed,
    });
  } catch (error: unknown) {
    const status = typeof error === 'object' && error && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    console.error('[admin/enrich-frete] erro', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Erro interno' },
      { status }
    );
  }
}

type RangeParams = {
  startDate: string;
  endDate: string;
  limit?: number;
  batchSize?: number;
  itensDelayMs: number;
  channelLimit?: number;
  cidadeLimit?: number;
};

async function runManualRangeEnrichment(params: RangeParams) {
  const { startDate, endDate, limit, batchSize, itensDelayMs, channelLimit, cidadeLimit } = params;
  const janela = `${startDate}/${endDate}`;
  const timeoutHandle = setTimeout(() => {
    console.warn('[admin/enrich-frete] Range enrichment approaching timeout', janela);
  }, MAX_DURATION_MS - 5000);
  if (typeof timeoutHandle === 'object' && timeoutHandle && 'unref' in timeoutHandle && typeof (timeoutHandle as { unref?: () => void }).unref === 'function') {
    (timeoutHandle as { unref: () => void }).unref();
  }

  await logRangeEvent('info', 'Enriquecimento manual iniciado', {
    janela,
    janelaIni: startDate,
    janelaFim: endDate,
  });

  const tinyIds = await fetchTinyIdsForRange(startDate, endDate);
  const totalPedidos = tinyIds.length;

  const itensResult = await syncItensForRange(tinyIds, itensDelayMs, janela);
  const freteResult = await runFreteEnrichment({
    startDate,
    endDate,
    limit,
    batchSize,
    newestFirst: false,
  });
  await logRangeEvent('info', 'Frete enriquecido (manual)', {
    janela,
    ...freteResult,
  });

  const canaisResult = await normalizeMissingOrderChannels({
    includeOutros: true,
    limit: channelLimit,
  });
  await logRangeEvent('info', 'Canais normalizados (manual)', {
    janela,
    ...canaisResult,
  });

  const cidadeResult = await enrichCidadeUfMissing({
    limit: cidadeLimit,
  });
  await logRangeEvent('info', 'Cidade/UF enriquecidos (manual)', {
    janela,
    ...cidadeResult,
  });

  clearTimeout(timeoutHandle);

  return {
    mode: 'range',
    janela: { start: startDate, end: endDate },
    totalPedidos,
    itens: itensResult,
    frete: freteResult,
    canais: canaisResult,
    cidadeUf: cidadeResult,
  };
}

async function syncItensForRange(tinyIds: number[], delayMs: number, janela: string) {
  if (!tinyIds.length) {
    await logRangeEvent('info', 'Nenhum pedido encontrado para sincronizar itens', { janela });
    return { processados: 0, sucesso: 0, totalItens: 0 };
  }

  const safeDelay = Math.max(250, Math.min(delayMs, 5000));
  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    const result = await sincronizarItensPorPedidos(accessToken, tinyIds, {
      delayMs: safeDelay,
      retries: 1,
    });

    await logRangeEvent('info', 'Itens sincronizados (manual)', {
      janela,
      delayMs: safeDelay,
      ...result,
    });

    return result;
  } catch (error: unknown) {
    await logRangeEvent('error', 'Erro ao sincronizar itens para janela manual', {
      janela,
      error: getErrorMessage(error) || 'Erro desconhecido',
    });
    throw error;
  }
}

async function fetchTinyIdsForRange(startDate: string, endDate: string) {
  const { data, error } = await supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate);

  if (error) {
    throw new Error(`Erro ao buscar pedidos no intervalo: ${error.message}`);
  }

  const rows = (data ?? []) as TinyOrdersTinyIdRow[];
  const ids = rows
    .map((row) => Number(row.tiny_id))
    .filter((value): value is number => Number.isFinite(value));

  return Array.from(new Set(ids));
}

async function logRangeEvent(level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown>) {
  try {
    const payload: SyncLogsInsert = {
      job_id: null,
      level,
      message,
      meta: {
        step: 'orders',
        ...meta,
      } as Json,
    };

    await supabaseAdmin.from('sync_logs').insert(payload);
  } catch (error: unknown) {
    console.error('[admin/enrich-frete] erro ao gravar sync_logs', error);
  }
}

function normalizeDateInput(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return DATE_REGEX.test(trimmed) ? trimmed : undefined;
}

function isRangeValid(startDate: string, endDate: string) {
  return new Date(`${startDate}T00:00:00Z`).getTime() <= new Date(`${endDate}T00:00:00Z`).getTime();
}

function parseNumberInput(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}
