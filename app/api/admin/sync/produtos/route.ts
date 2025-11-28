import { NextResponse } from 'next/server';
import { callInternalJson } from '@/lib/internalApi';

type AdminSyncBody = {
  mode?: 'manual' | 'cron' | 'backfill';
  backfill?: boolean;
  limit?: number;
  workers?: number;
  updatedSince?: string;
};

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value));

export async function POST(req: Request) {
  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as AdminSyncBody;
    const backfillRequested = body.backfill === true;
    const resolvedMode: AdminSyncBody['mode'] = backfillRequested ? 'backfill' : body.mode ?? 'manual';

    const payload: Record<string, unknown> = {
      mode: resolvedMode,
      updatedSince: typeof body.updatedSince === 'string' ? body.updatedSince : undefined,
      limit: Number.isFinite(toNumber(body.limit)) ? Number(toNumber(body.limit)) : undefined,
      workers: Number.isFinite(toNumber(body.workers)) ? Number(toNumber(body.workers)) : undefined,
      modoCron: resolvedMode === 'cron',
      enrichAtivo: true,
    };

    const bodyCleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
    );

    const result = await callInternalJson('/api/produtos/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyCleaned),
    });

    return NextResponse.json({ ok: Boolean(result?.ok), result });
  } catch (error: any) {
    const detail = error?.message ?? 'Erro inesperado';
    return NextResponse.json(
      { ok: false, message: 'Falha ao sincronizar produtos', detail },
      { status: 500 }
    );
  }
}
