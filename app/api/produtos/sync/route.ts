import { NextRequest, NextResponse } from 'next/server';
import { countProdutos } from '@/src/repositories/tinyProdutosRepository';
import { syncProdutosFromTiny, type SyncProdutosMode, type SyncProdutosOptions } from '@/src/lib/sync/produtos';
import { getErrorMessage } from '@/lib/errors';

const DEFAULT_CATALOG_CURSOR_KEY = 'catalog';
const AVAILABLE_MODES: readonly SyncProdutosMode[] = ['manual', 'cron', 'backfill'] as const;

type SyncProdutosBody = {
  mode?: SyncProdutosMode | 'manual' | 'cron' | 'backfill';
  updatedSince?: string;
  limit?: number;
  workers?: number;
  enrichAtivo?: boolean;
  enrichEstoque?: boolean;
  modoCron?: boolean;
  estoqueOnly?: boolean;
  cursorKey?: string | null;
  modeLabel?: string;
  useCursor?: boolean;
  maxPages?: number;
  situacao?: 'A' | 'I' | 'E' | 'all';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSyncProdutosMode = (mode?: string): mode is SyncProdutosMode =>
  typeof mode === 'string' && AVAILABLE_MODES.includes(mode as SyncProdutosMode);

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    const body: SyncProdutosBody = isRecord(rawBody) ? (rawBody as SyncProdutosBody) : {};
    const {
      mode: bodyMode,
      updatedSince,
      limit,
      workers,
      enrichAtivo,
      enrichEstoque,
      modoCron: bodyModoCron = false,
      estoqueOnly: bodyEstoqueOnly,
      cursorKey: bodyCursorKey,
      modeLabel: bodyModeLabel,
      useCursor,
    } = body ?? {};
    const maxPages = typeof body?.maxPages === 'number' ? body.maxPages : undefined;
    const situacao = typeof body?.situacao === 'string' ? body.situacao : undefined;

    const resolvedMode: SyncProdutosMode =
      isSyncProdutosMode(bodyMode)
        ? bodyMode
        : bodyModoCron
          ? 'cron'
          : 'manual';
    const resolvedModoCron = resolvedMode === 'cron' || Boolean(bodyModoCron);
    const estoqueOnly = Boolean(bodyEstoqueOnly);
    const explicitEnrich = typeof enrichAtivo === 'boolean'
      ? enrichAtivo
      : typeof enrichEstoque === 'boolean'
        ? enrichEstoque
        : undefined;
    const resolvedEnrich =
      typeof explicitEnrich === 'boolean'
        ? explicitEnrich
        : estoqueOnly
          ? true
          : false;

    const resolvedModeLabel = typeof bodyModeLabel === 'string' && bodyModeLabel.trim().length
      ? bodyModeLabel.trim()
      : resolvedMode === 'cron' && estoqueOnly
        ? 'cron_estoque'
        : resolvedMode;

    const cleanedCursorKey = typeof bodyCursorKey === 'string' && bodyCursorKey.trim().length
      ? bodyCursorKey.trim()
      : undefined;
    const cursorToggle = typeof useCursor === 'boolean' ? useCursor : resolvedMode === 'backfill';
    const resolvedCursorKey = bodyCursorKey === null
      ? null
      : cleanedCursorKey ?? (cursorToggle ? DEFAULT_CATALOG_CURSOR_KEY : undefined);

    const options: SyncProdutosOptions = {
      mode: resolvedMode,
      modoCron: resolvedModoCron,
      updatedSince: typeof updatedSince === 'string' ? updatedSince : undefined,
      estoqueOnly,
      enrichEstoque: resolvedEnrich,
      modeLabel: resolvedModeLabel,
    };
    if (typeof limit === 'number') options.limit = limit;
    if (typeof workers === 'number') options.workers = workers;
    if (typeof maxPages === 'number') options.maxPages = maxPages;
    if (situacao === 'A' || situacao === 'I' || situacao === 'E' || situacao === 'all') {
      options.situacao = situacao;
    }
    if (typeof resolvedCursorKey !== 'undefined') {
      options.cursorKey = resolvedCursorKey;
    }

    const result = await syncProdutosFromTiny(options);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = getErrorMessage(error) ?? 'Erro desconhecido';
    console.error('[Sync Produtos] Erro:', error);
    const isProd = process.env.NODE_ENV === 'production';
    return NextResponse.json(
      {
        ok: false,
        message: isProd ? 'Internal Server Error' : message,
        ...(isProd ? {} : { stack: error instanceof Error ? error.stack : undefined }),
      },
      { status: 500 }
    );
  }
}

// GET para status
export async function GET() {
  try {
    const totalProdutos = await countProdutos();

    return NextResponse.json({
      totalProdutos,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error) ?? 'Erro ao consultar produtos';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
