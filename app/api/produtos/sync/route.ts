import { NextRequest, NextResponse } from 'next/server';
import { countProdutos } from '@/src/repositories/tinyProdutosRepository';
import { syncProdutosFromTiny, type SyncProdutosMode, type SyncProdutosOptions } from '@/src/lib/sync/produtos';

const DEFAULT_CATALOG_CURSOR_KEY = 'catalog';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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

    const resolvedMode: SyncProdutosMode = bodyMode
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
    if (typeof resolvedCursorKey !== 'undefined') {
      options.cursorKey = resolvedCursorKey;
    }

    const result = await syncProdutosFromTiny(options);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Sync Produtos] Erro:', error);
    const isProd = process.env.NODE_ENV === 'production';
    return NextResponse.json(
      {
        ok: false,
        message: isProd ? 'Internal Server Error' : error?.message ?? 'Erro desconhecido',
        ...(isProd ? {} : { stack: error?.stack }),
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao consultar produtos' },
      { status: 500 }
    );
  }
}
