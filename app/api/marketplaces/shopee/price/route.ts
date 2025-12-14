import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tinyIdParam = url.searchParams.get('tinyId');
  const skuParam = url.searchParams.get('sku');

  try {
    // Determina o SKU da Shopee priorizando o mapping (tinyId -> marketplace_sku).
    // O `sku` na query é apenas fallback (muitas vezes é o `produto.codigo` do Tiny e não o SKU da Shopee).
    let marketplaceSku: string | null = null;
    let mappingUsed = false;

    if (tinyIdParam) {
      const tinyId = Number(tinyIdParam);
      if (!Number.isFinite(tinyId)) {
        return NextResponse.json({ ok: false, error: 'invalid_tinyId' }, { status: 400 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mapping } = await (supabaseAdmin as any)
        .from('marketplace_sku_mapping')
        .select('marketplace_sku')
        .eq('marketplace', 'shopee')
        .eq('tiny_product_id', tinyId)
        .limit(1)
        .maybeSingle();

      if (mapping?.marketplace_sku) {
        marketplaceSku = mapping.marketplace_sku;
        mappingUsed = true;
      }
    }

    if (!marketplaceSku && skuParam) {
      marketplaceSku = skuParam;
    }

    if (!marketplaceSku) {
      return NextResponse.json({ ok: true, original: null, discounted: null, meta: { skuUsed: null, mappingUsed } });
    }

    // Query recent shopee order items matching the SKU (model_sku or item_sku)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabaseAdmin as any)
      .from('shopee_order_items')
      .select('original_price,discounted_price,created_at')
      .or(`model_sku.eq.${marketplaceSku},item_sku.eq.${marketplaceSku}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!items || !items.length) {
      return NextResponse.json({ ok: true, original: null, discounted: null, meta: { skuUsed: marketplaceSku, mappingUsed } });
    }

    const item = items[0];
    const original = item.original_price != null ? Number(item.original_price) : null;
    const discounted = item.discounted_price != null ? Number(item.discounted_price) : null;

    return NextResponse.json({ ok: true, original, discounted, meta: { skuUsed: marketplaceSku, mappingUsed } });
  } catch (err) {
    console.error('[Shopee Price API] error', err);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
