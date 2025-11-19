import { NextRequest, NextResponse } from 'next/server';

/**
 * GET: DEPRECATED - Enrichment now happens via POST /api/tiny/pedidos
 * This endpoint returns 410 Gone silently
 * 
 * This route is being called by something (possibly browser polling or cached request)
 * We return 410 immediately without logging to keep terminal clean
 */
export async function GET(req: NextRequest) {
  // Return 410 Gone silently (no response body, minimal overhead)
  // This prevents the 410 response from being logged by Next.js
  return new NextResponse(null, { 
    status: 410,
    headers: { 'Content-Length': '0' }
  });
}
