import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: This endpoint was causing severe rate limiting issues
 * The Tiny API has aggressive rate limiting and cannot handle batch enrichment
 * 
 * Use GET /api/tiny/sync/enrich-slow instead (designed for cron job usage)
 * That endpoint enriches ONE pedido at a time with proper delays
 */

export async function POST(req: NextRequest) {
  return NextResponse.json(
    { error: 'Endpoint desabilitado. Use GET /api/tiny/sync/enrich-slow em seu lugar.' },
    { status: 410 }
  );
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { error: 'Endpoint desabilitado. Use GET /api/tiny/sync/enrich-slow em seu lugar.' },
    { status: 410 }
  );
}
