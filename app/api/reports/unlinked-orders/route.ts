import { NextRequest, NextResponse } from 'next/server';
import { getUnlinkedMarketplaceOrders } from '@/src/repositories/orderLinkingRepository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/unlinked-orders
 *
 * Returns marketplace orders that haven't been linked to Tiny orders yet
 *
 * Query params:
 * - marketplace: 'magalu' | 'shopee' | 'mercado_livre' (required)
 * - dateFrom: ISO date string (optional)
 * - dateTo: ISO date string (optional)
 * - limit: number (default 100)
 * - offset: number (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const marketplace = searchParams.get('marketplace') as 'magalu' | 'shopee' | 'mercado_livre' | null;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!marketplace || !['magalu', 'shopee', 'mercado_livre'].includes(marketplace)) {
      return NextResponse.json(
        { error: 'Invalid or missing marketplace parameter' },
        { status: 400 }
      );
    }

    const orders = await getUnlinkedMarketplaceOrders({
      marketplace,
      dateFrom,
      dateTo,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      marketplace,
      count: orders.length,
      orders
    });

  } catch (error) {
    console.error('[GET /api/reports/unlinked-orders] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unlinked orders' },
      { status: 500 }
    );
  }
}
