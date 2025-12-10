import { NextRequest, NextResponse } from 'next/server';
import {
  createOrderLink,
  getLinkedOrdersView,
  deleteOrderLink,
  getOrderLinkByMarketplaceOrder,
} from '@/src/repositories/orderLinkingRepository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/order-links
 *
 * Get all linked orders with full details
 *
 * Query params:
 * - marketplace: 'magalu' | 'shopee' | 'mercado_livre' (optional)
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

    const links = await getLinkedOrdersView({
      marketplace: marketplace || undefined,
      dateFrom,
      dateTo,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      count: links.length,
      links
    });

  } catch (error) {
    console.error('[GET /api/reports/order-links] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order links' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports/order-links
 *
 * Create a new link between marketplace order and Tiny order
 *
 * Body:
 * {
 *   marketplace: 'magalu' | 'shopee' | 'mercado_livre',
 *   marketplace_order_id: string,
 *   tiny_order_id: number,
 *   linked_by?: string,
 *   confidence_score?: number,
 *   notes?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { marketplace, marketplace_order_id, tiny_order_id, linked_by, confidence_score, notes } = body;

    // Validate required fields
    if (!marketplace || !marketplace_order_id || !tiny_order_id) {
      return NextResponse.json(
        { error: 'Missing required fields: marketplace, marketplace_order_id, tiny_order_id' },
        { status: 400 }
      );
    }

    if (!['magalu', 'shopee', 'mercado_livre'].includes(marketplace)) {
      return NextResponse.json(
        { error: 'Invalid marketplace. Must be one of: magalu, shopee, mercado_livre' },
        { status: 400 }
      );
    }

    // Check if link already exists
    const existingLink = await getOrderLinkByMarketplaceOrder(marketplace, marketplace_order_id);
    if (existingLink) {
      return NextResponse.json(
        {
          error: 'Link already exists for this marketplace order',
          existing_link: existingLink
        },
        { status: 409 }
      );
    }

    // Create the link
    const link = await createOrderLink({
      marketplace,
      marketplace_order_id,
      tiny_order_id,
      linked_by,
      confidence_score,
      notes,
    });

    return NextResponse.json({
      success: true,
      link
    }, { status: 201 });

  } catch (error) {
    console.error('[POST /api/reports/order-links] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create order link' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reports/order-links
 *
 * Delete an order link
 *
 * Query params:
 * - linkId: number (required)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('linkId');

    if (!linkId) {
      return NextResponse.json(
        { error: 'Missing linkId parameter' },
        { status: 400 }
      );
    }

    await deleteOrderLink(parseInt(linkId));

    return NextResponse.json({
      success: true,
      message: 'Order link deleted successfully'
    });

  } catch (error) {
    console.error('[DELETE /api/reports/order-links] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete order link' },
      { status: 500 }
    );
  }
}
