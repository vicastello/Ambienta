import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { syncProdutosFromTiny } from '@/src/lib/sync/produtos';

type AdminSyncBody = {
  mode?: 'manual' | 'cron' | 'backfill';
  backfill?: boolean;
  limit?: number;
  workers?: number;
  updatedSince?: string;
  estoqueOnly?: boolean;
  enrichEstoque?: boolean;
  enrichAtivo?: boolean;
  modeLabel?: string;
  cursorKey?: string | null;
  useCursor?: boolean;
  disableCursor?: boolean;
  maxPages?: number;
  situacao?: 'A' | 'I' | 'E' | 'all';
};

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value));
const isSituacao = (value: unknown): value is 'A' | 'I' | 'E' | 'all' =>
  value === 'A' || value === 'I' || value === 'E' || value === 'all';

export async function POST(req: Request) {
  try {
    let rawBody: unknown = {};
    try {
      rawBody = await req.json();
    } catch {
      rawBody = {};
    }
    const body = isRecord(rawBody) ? (rawBody as AdminSyncBody) : {};

    const backfillRequested = body.backfill === true;
    const resolvedMode: AdminSyncBody['mode'] = backfillRequested ? 'backfill' : body.mode ?? 'backfill';
    const estoqueOnly = body.estoqueOnly === true;

    const explicitEnrich = typeof body.enrichEstoque === 'boolean'
      ? body.enrichEstoque
      : typeof body.enrichAtivo === 'boolean'
        ? body.enrichAtivo
        : undefined;

    const resolvedEnrich = typeof explicitEnrich === 'boolean'
      ? explicitEnrich
      : estoqueOnly
        ? true
        : true; // default para admin cron é enriquecer estoque

    const explicitModeLabel = typeof body.modeLabel === 'string' ? body.modeLabel.trim() : '';
    const resolvedModeLabel = explicitModeLabel || 'backfill_cron';

    const cleanedCursorKey = typeof body.cursorKey === 'string' && body.cursorKey.trim().length
      ? body.cursorKey.trim()
      : undefined;
    const cursorToggle = typeof body.useCursor === 'boolean'
      ? body.useCursor
      : resolvedMode === 'backfill' || backfillRequested;
    const cursorDisabled = body.disableCursor === true || body.cursorKey === null;
    const defaultCursorKey = resolvedMode === 'backfill' ? 'catalog_backfill' : 'catalog';
    const resolvedCursorKey = cursorDisabled
      ? undefined
      : cursorToggle
        ? cleanedCursorKey ?? defaultCursorKey
        : undefined;
    const finalCursorKey = body.cursorKey === null ? null : resolvedCursorKey;

    console.log('[admin/sync/produtos] incoming body', body);
    console.log('[admin/sync/produtos] resolved options', {
      resolvedMode,
      resolvedEnrich,
      estoqueOnly,
      limit: Number.isFinite(toNumber(body.limit)) ? Number(toNumber(body.limit)) : 10,
      workers: Number.isFinite(toNumber(body.workers)) ? Number(toNumber(body.workers)) : 1,
      modeLabel: resolvedModeLabel,
      cursorKey: finalCursorKey,
      modoCron: true,
      maxPages: Number.isFinite(toNumber(body.maxPages)) ? Number(toNumber(body.maxPages)) : undefined,
      situacao: isSituacao(body.situacao) ? body.situacao : undefined,
    });

    const result = await syncProdutosFromTiny({
      mode: resolvedMode,
      modoCron: true,
      updatedSince: typeof body.updatedSince === 'string' ? body.updatedSince : undefined,
      limit: Number.isFinite(toNumber(body.limit)) ? Number(toNumber(body.limit)) : 10,
      workers: Number.isFinite(toNumber(body.workers)) ? Number(toNumber(body.workers)) : 1,
      estoqueOnly,
      enrichEstoque: resolvedEnrich,
      modeLabel: resolvedModeLabel,
      cursorKey: finalCursorKey,
      maxPages: Number.isFinite(toNumber(body.maxPages)) ? Number(toNumber(body.maxPages)) : undefined,
      situacao: isSituacao(body.situacao) ? body.situacao : undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const detail = getErrorMessage(error) || 'Erro inesperado';
    return NextResponse.json(
      { ok: false, message: 'Falha ao sincronizar produtos', detail },
      { status: 500 }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
