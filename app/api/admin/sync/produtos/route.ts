import { NextResponse } from 'next/server';
import { callInternalJson } from '@/lib/internalApi';
import { getErrorMessage } from '@/lib/errors';

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
};

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value));

type ProdutosSyncResponse = {
  ok?: boolean;
  [key: string]: unknown;
};

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
    const resolvedMode: AdminSyncBody['mode'] = backfillRequested ? 'backfill' : body.mode ?? 'manual';

    const estoqueOnly = body.estoqueOnly === true;
    const explicitEnrich = typeof body.enrichEstoque === 'boolean'
      ? body.enrichEstoque
      : typeof body.enrichAtivo === 'boolean'
        ? body.enrichAtivo
        : undefined;
    const resolvedEnrich =
      typeof explicitEnrich === 'boolean'
        ? explicitEnrich
        : estoqueOnly
          ? true
          : true;

    const explicitModeLabel = typeof body.modeLabel === 'string' ? body.modeLabel.trim() : '';
    const resolvedModeLabel = explicitModeLabel
      ? explicitModeLabel
      : resolvedMode === 'cron' && estoqueOnly
        ? 'cron_estoque'
        : resolvedMode;

    const cleanedCursorKey = typeof body.cursorKey === 'string' && body.cursorKey.trim().length
      ? body.cursorKey.trim()
      : undefined;
    const cursorToggle = typeof body.useCursor === 'boolean'
      ? body.useCursor
      : resolvedMode === 'backfill' || backfillRequested;
    const cursorDisabled = body.disableCursor === true || body.cursorKey === null;
    const resolvedCursorKey = cursorDisabled
      ? undefined
      : cursorToggle
        ? cleanedCursorKey ?? 'catalog'
        : undefined;
    const finalCursorKey = body.cursorKey === null ? null : resolvedCursorKey;

    const payload: Record<string, unknown> = {
      mode: resolvedMode,
      updatedSince: typeof body.updatedSince === 'string' ? body.updatedSince : undefined,
      limit: Number.isFinite(toNumber(body.limit)) ? Number(toNumber(body.limit)) : undefined,
      workers: Number.isFinite(toNumber(body.workers)) ? Number(toNumber(body.workers)) : undefined,
      modoCron: resolvedMode === 'cron',
      estoqueOnly: estoqueOnly || undefined,
      enrichEstoque: resolvedEnrich,
      enrichAtivo: resolvedEnrich,
      modeLabel: resolvedModeLabel,
      cursorKey: finalCursorKey,
    };

    const bodyCleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    );

    const result = await callInternalJson<ProdutosSyncResponse>('/api/produtos/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyCleaned),
    });

    return NextResponse.json({ ok: result.ok !== false, result });
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
