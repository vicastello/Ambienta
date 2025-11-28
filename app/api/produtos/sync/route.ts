import { NextRequest, NextResponse } from 'next/server';
import { countProdutos } from '@/src/repositories/tinyProdutosRepository';
import { syncProdutosFromTiny, type SyncProdutosMode, type SyncProdutosOptions } from '@/src/lib/sync/produtos';

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
    } = body ?? {};

    const resolvedMode: SyncProdutosMode = bodyMode
      ? bodyMode
      : bodyModoCron
        ? 'cron'
        : 'manual';
    const resolvedModoCron = resolvedMode === 'cron' || Boolean(bodyModoCron);
    const resolvedEnrich = typeof enrichAtivo === 'boolean'
      ? enrichAtivo
      : typeof enrichEstoque === 'boolean'
        ? enrichEstoque
        : undefined;

    const options: SyncProdutosOptions = {
      mode: resolvedMode,
      modoCron: resolvedModoCron,
      updatedSince: typeof updatedSince === 'string' ? updatedSince : undefined,
    };
    if (typeof limit === 'number') options.limit = limit;
    if (typeof workers === 'number') options.workers = workers;
    if (typeof resolvedEnrich === 'boolean') options.enrichEstoque = resolvedEnrich;

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
