import { NextRequest, NextResponse } from 'next/server';
import { syncTinyEstoqueRoundRobin } from '@/src/services/tinyEstoqueRoundRobinService';

export async function POST(req: NextRequest) {
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
