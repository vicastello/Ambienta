import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: This endpoint was attempting batch enrichment which caused rate limiting
 * Use GET /api/tiny/sync/enrich-slow instead (one pedido at a time, every 30 seconds)
 */
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { error: 'Endpoint desabilitado. Use GET /api/tiny/sync/enrich-slow em seu lugar.' },
    { status: 410 }
  );
}
