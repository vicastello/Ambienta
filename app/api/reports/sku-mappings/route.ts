import { NextRequest, NextResponse } from 'next/server';
import {
  upsertSkuMapping,
  getSkuMapping,
  getSkuMappingsByMarketplace,
  getSkuMappingsByTinyProduct,
  deleteSkuMapping,
  batchUpsertSkuMappings,
} from '@/src/repositories/orderLinkingRepository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/sku-mappings
 *
 * Get SKU mappings. Can filter by marketplace or Tiny product
 *
 * Query params:
 * - marketplace: 'magalu' | 'shopee' | 'mercado_livre' (optional)
 * - marketplace_sku: string (optional, requires marketplace)
 * - tiny_product_id: number (optional)
 * - limit: number (default 1000)
 * - offset: number (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const marketplace = searchParams.get('marketplace') as 'magalu' | 'shopee' | 'mercado_livre' | null;
    const marketplaceSku = searchParams.get('marketplace_sku');
    const tinyProductIdStr = searchParams.get('tiny_product_id');
    const limit = parseInt(searchParams.get('limit') || '1000');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get specific mapping by marketplace SKU
    if (marketplace && marketplaceSku) {
      const mapping = await getSkuMapping(marketplace, marketplaceSku);
      return NextResponse.json({
        success: true,
        mapping
      });
    }

    // Get mappings by Tiny product
    if (tinyProductIdStr) {
      const tinyProductId = parseInt(tinyProductIdStr);
      const mappings = await getSkuMappingsByTinyProduct(tinyProductId);
      return NextResponse.json({
        success: true,
        count: mappings.length,
        mappings
      });
    }

    // Get mappings by marketplace
    if (marketplace) {
      if (!['magalu', 'shopee', 'mercado_livre'].includes(marketplace)) {
        return NextResponse.json(
          { error: 'Invalid marketplace' },
          { status: 400 }
        );
      }
      const mappings = await getSkuMappingsByMarketplace(marketplace, limit, offset);
      return NextResponse.json({
        success: true,
        marketplace,
        count: mappings.length,
        mappings
      });
    }

    return NextResponse.json(
      { error: 'Must provide either marketplace or tiny_product_id parameter' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[GET /api/reports/sku-mappings] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SKU mappings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports/sku-mappings
 *
 * Create or update a SKU mapping (single or batch)
 *
 * Body (single):
 * {
 *   marketplace: 'magalu' | 'shopee' | 'mercado_livre',
 *   marketplace_sku: string,
 *   marketplace_product_name?: string,
 *   tiny_product_id: number,
 *   mapping_type?: 'manual' | 'auto' | 'verified',
 *   created_by?: string,
 *   notes?: string
 * }
 *
 * Body (batch):
 * {
 *   batch: true,
 *   mappings: [
 *     { marketplace, marketplace_sku, tiny_product_id, ... },
 *     ...
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Batch operation
    if (body.batch && Array.isArray(body.mappings)) {
      const { mappings } = body;

      // Validate all mappings
      for (const mapping of mappings) {
        if (!mapping.marketplace || !mapping.marketplace_sku || !mapping.tiny_product_id) {
          return NextResponse.json(
            { error: 'Each mapping must have marketplace, marketplace_sku, and tiny_product_id' },
            { status: 400 }
          );
        }
        if (!['magalu', 'shopee', 'mercado_livre'].includes(mapping.marketplace)) {
          return NextResponse.json(
            { error: `Invalid marketplace in batch: ${mapping.marketplace}` },
            { status: 400 }
          );
        }
      }

      await batchUpsertSkuMappings(mappings);

      return NextResponse.json({
        success: true,
        message: `Successfully upserted ${mappings.length} SKU mappings`
      }, { status: 201 });
    }

    // Single operation
    const {
      marketplace,
      marketplace_sku,
      marketplace_product_name,
      tiny_product_id,
      mapping_type,
      created_by,
      notes
    } = body;

    // Validate required fields
    if (!marketplace || !marketplace_sku || !tiny_product_id) {
      return NextResponse.json(
        { error: 'Missing required fields: marketplace, marketplace_sku, tiny_product_id' },
        { status: 400 }
      );
    }

    if (!['magalu', 'shopee', 'mercado_livre'].includes(marketplace)) {
      return NextResponse.json(
        { error: 'Invalid marketplace. Must be one of: magalu, shopee, mercado_livre' },
        { status: 400 }
      );
    }

    // Create or update the mapping
    const mapping = await upsertSkuMapping({
      marketplace,
      marketplace_sku,
      marketplace_product_name,
      tiny_product_id,
      mapping_type,
      created_by,
      notes,
    });

    return NextResponse.json({
      success: true,
      mapping
    }, { status: 201 });

  } catch (error) {
    console.error('[POST /api/reports/sku-mappings] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create SKU mapping' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reports/sku-mappings
 *
 * Delete a SKU mapping
 *
 * Query params:
 * - mappingId: number (required)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mappingId = searchParams.get('mappingId');

    if (!mappingId) {
      return NextResponse.json(
        { error: 'Missing mappingId parameter' },
        { status: 400 }
      );
    }

    await deleteSkuMapping(parseInt(mappingId));

    return NextResponse.json({
      success: true,
      message: 'SKU mapping deleted successfully'
    });

  } catch (error) {
    console.error('[DELETE /api/reports/sku-mappings] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete SKU mapping' },
      { status: 500 }
    );
  }
}
