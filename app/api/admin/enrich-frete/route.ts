import { NextRequest, NextResponse } from 'next/server';
import { runFreteEnrichment } from '@/lib/freteEnricher';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const startDate = body?.dataInicial ?? body?.startDate;
    const endDate = body?.dataFinal ?? body?.endDate;
    const limit = body?.limit ? Number(body.limit) : undefined;
    const batchSize = body?.batchSize ? Number(body.batchSize) : undefined;

    const result = await runFreteEnrichment({
      startDate,
      endDate,
      limit,
      batchSize,
      newestFirst: true,
    });

    return NextResponse.json({
      message: 'Enrichment completed',
      ...result,
      enriched: result.updated,
      total: result.processed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}
