import { NextRequest, NextResponse } from 'next/server';
import { syncMeliOrdersToSupabase } from '@/src/services/meliSyncService';

export async function POST(req: NextRequest) {
  const appId = process.env.ML_APP_ID;
  const accessToken = process.env.ML_ACCESS_TOKEN;
  const sellerId = process.env.ML_SELLER_ID ?? '571389990';

  if (!appId || !accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'ML_NOT_CONFIGURED',
          message:
            'Mercado Livre não configurado. Defina ML_APP_ID e ML_ACCESS_TOKEN após completar o OAuth.',
        },
      },
      { status: 503 },
    );
  }

  const body = (await req
    .json()
    .catch(() => ({}))) as Partial<{
    periodDays: number;
    pageLimit: number;
    pageSize: number;
    includeDetails: boolean;
    detailConcurrency: number;
    detailDelayMs: number;
  }>;

  const periodDays =
    typeof body?.periodDays === 'number' && body.periodDays > 0
      ? body.periodDays
      : 3;

  try {
    const result = await syncMeliOrdersToSupabase({
      sellerId,
      accessToken,
      periodDays,
      pageLimit: body?.pageLimit ?? 3,
      pageSize: body?.pageSize ?? 50,
      includeDetails: body?.includeDetails,
      detailConcurrency: body?.detailConcurrency,
      detailDelayMs: body?.detailDelayMs,
    });

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string };
    console.error('[ML Sync API] Error syncing Mercado Livre orders', {
      message: err?.message,
      stack: err?.stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'ML_SYNC_ERROR',
          message: 'Falha ao sincronizar pedidos do Mercado Livre',
          details: {
            message: err?.message ?? null,
          },
        },
      },
      { status: 500 },
    );
  }
}
