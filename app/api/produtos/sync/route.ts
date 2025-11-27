import { NextRequest, NextResponse } from 'next/server';
import { countProdutos } from '@/src/repositories/tinyProdutosRepository';
import { syncProdutosFromTiny } from '@/src/lib/sync/produtos';

const SYNC_TOKEN_HEADER = 'x-ambienta-sync-token';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      limit = 100,
      enrichEstoque = true,
      modoCron = false,
    } = body;

    const secret = process.env.SYNC_PRODUTOS_SECRET;
    const provided = req.headers.get(SYNC_TOKEN_HEADER);
    if (!secret || !provided || provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    console.log('[sync-produtos] start', { body, modoCron });
    const result = await syncProdutosFromTiny({ limit, enrichEstoque, modoCron });
    const elapsed = Date.now() - startedAt;
    console.log('[sync-produtos] finish', { elapsed, resultSummary: { ok: result.ok, timedOut: result.timedOut, totalRequests: result.totalRequests } });
    const mode = modoCron ? 'cron' : 'manual';

    if ((result as any)?.ok === false || result.timedOut) {
      // Falha controlada ou timeout
      const err = result as any;
      const isProd = process.env.NODE_ENV === 'production';
      return NextResponse.json(
        {
          ok: false,
          mode,
          timedOut: result.timedOut ?? false,
          error: {
            code: err.reason ?? 'timeout-or-error',
            message: isProd
              ? 'Internal Server Error'
              : err.errorMessage ?? 'Timeout ou erro interno',
          },
          totalRequests: result.totalRequests ?? 0,
          total429: result.total429 ?? 0,
          windowUsagePct: result.windowUsagePct ?? 0,
          batchUsado: result.batchUsado ?? 0,
          workersUsados: result.workersUsados ?? 0,
          enrichAtivo: result.enrichAtivo ?? false,
        },
        { status: 500 }
      );
    }

    // Evitar sobrescrever ok/mode
    const { ok, mode: _mode, ...rest } = result;
    return NextResponse.json({ ok, mode, ...rest });
  } catch (error: any) {
    console.error('[Sync Produtos] Erro:', error);
    const isProd = process.env.NODE_ENV === 'production';
    const payload = isProd
      ? { error: { code: '500', message: 'Internal Server Error' } }
      : { error: { code: '500', message: error?.message ?? 'Erro desconhecido', stack: error?.stack } };
    return NextResponse.json(payload, { status: 500 });
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
