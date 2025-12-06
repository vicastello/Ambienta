import { NextRequest, NextResponse } from 'next/server';
import { syncTinyEstoqueRoundRobin } from '@/src/services/tinyEstoqueRoundRobinService';

const unauthorized = () =>
  NextResponse.json(
    {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' },
    },
    { status: 401 }
  );

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const batchSize =
    typeof body?.batchSize === 'number' && body.batchSize > 0 ? body.batchSize : undefined;

  const result = await syncTinyEstoqueRoundRobin({ batchSize });

  return NextResponse.json({
    ok: true,
    batchSize: batchSize ?? undefined,
    ...result,
  });
}
