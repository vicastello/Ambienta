import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

interface SalesReportItem {
  marketplace: string;
  marketplace_order_id: string;
  marketplace_order_date: string;
  tiny_numero_pedido: number;
  tiny_product_id: number;
  tiny_codigo: string;
  tiny_nome: string;
  tiny_tipo: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  // For kits and variations
  parent_product_id?: number;
  parent_codigo?: string;
  parent_nome?: string;
  parent_tipo?: string;
  is_component?: boolean;
}

/**
 * GET /api/reports/monthly-sales
 *
 * Generate a monthly sales report with proper kit and variation breakdowns
 * This report combines linked marketplace orders with Tiny order items,
 * expanding kits to show their components and properly attributing variations
 *
 * Query params:
 * - year: number (required)
 * - month: number (required, 1-12)
 * - marketplace: 'magalu' | 'shopee' | 'mercado_livre' | 'all' (optional, default 'all')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const yearStr = searchParams.get('year');
    const monthStr = searchParams.get('month');
    const marketplace = searchParams.get('marketplace') || 'all';

    if (!yearStr || !monthStr) {
      return NextResponse.json(
        { error: 'Missing required parameters: year and month' },
        { status: 400 }
      );
    }

    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Month must be between 1 and 12' },
        { status: 400 }
      );
    }

    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Query to get all linked orders with items for the period
    const query = `
      SELECT
        mol.marketplace,
        mol.marketplace_order_id,

        -- Marketplace order date
        CASE
          WHEN mol.marketplace = 'magalu' THEN mag.purchased_date
          WHEN mol.marketplace = 'shopee' THEN sho.create_time
          WHEN mol.marketplace = 'mercado_livre' THEN mel.date_created
        END AS marketplace_order_date,

        -- Tiny order info
        tord.numero_pedido AS tiny_numero_pedido,
        tord.id AS tiny_order_id,

        -- Tiny order items
        titem.id_produto_tiny AS tiny_product_id,
        titem.codigo_produto AS tiny_codigo,
        titem.nome_produto AS tiny_nome,
        titem.quantidade AS quantity,
        titem.valor_unitario AS unit_price,
        titem.valor_total AS total_price,

        -- Tiny product details (for tipo - Simple, Kit, Variation, etc)
        tprod.tipo AS tiny_tipo,
        tprod.raw_payload AS product_raw_payload

      FROM marketplace_order_links mol

      -- Join to get marketplace-specific dates
      LEFT JOIN magalu_orders mag ON mol.marketplace = 'magalu' AND mol.marketplace_order_id = mag.id_order
      LEFT JOIN shopee_orders sho ON mol.marketplace = 'shopee' AND mol.marketplace_order_id = sho.order_sn
      LEFT JOIN meli_orders mel ON mol.marketplace = 'mercado_livre' AND mol.marketplace_order_id = mel.meli_order_id::TEXT

      -- Join to Tiny orders
      INNER JOIN tiny_orders tord ON mol.tiny_order_id = tord.id

      -- Join to Tiny order items
      INNER JOIN tiny_pedido_itens titem ON tord.id = titem.id_pedido

      -- Join to Tiny products for product type
      LEFT JOIN tiny_produtos tprod ON titem.id_produto_tiny = tprod.id_produto_tiny

      WHERE
        -- Filter by month
        (
          (mol.marketplace = 'magalu' AND mag.purchased_date >= $1 AND mag.purchased_date <= $2)
          OR
          (mol.marketplace = 'shopee' AND sho.create_time >= $1 AND sho.create_time <= $2)
          OR
          (mol.marketplace = 'mercado_livre' AND mel.date_created >= $1 AND mel.date_created <= $2)
        )
        ${marketplace !== 'all' ? 'AND mol.marketplace = $3' : ''}

      ORDER BY marketplace_order_date DESC, mol.marketplace_order_id, titem.id
    `;

    const params = marketplace !== 'all'
      ? [startDate.toISOString(), endDate.toISOString(), marketplace]
      : [startDate.toISOString(), endDate.toISOString()];

    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql: query,
      params
    });

    if (error) {
      // Fallback to TypeScript if RPC not available
      return await generateReportFallback({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        marketplace: marketplace as any,
      });
    }

    // Process the data to expand kits
    const reportItems: SalesReportItem[] = [];

    for (const row of (data as any[]) || []) {
      const item: SalesReportItem = {
        marketplace: row.marketplace,
        marketplace_order_id: row.marketplace_order_id,
        marketplace_order_date: row.marketplace_order_date,
        tiny_numero_pedido: row.tiny_numero_pedido,
        tiny_product_id: row.tiny_product_id,
        tiny_codigo: row.tiny_codigo,
        tiny_nome: row.tiny_nome,
        tiny_tipo: row.tiny_tipo,
        quantity: parseFloat(row.quantity),
        unit_price: parseFloat(row.unit_price),
        total_price: parseFloat(row.total_price),
      };

      // If it's a kit, we need to expand it to show components
      if (row.tiny_tipo === 'K' && row.product_raw_payload) {
        const components = extractKitComponents(row.product_raw_payload);

        // Add the kit itself
        reportItems.push(item);

        // Add each component
        for (const component of components) {
          reportItems.push({
            ...item,
            tiny_product_id: component.id_produto_tiny || 0,
            tiny_codigo: component.codigo || '',
            tiny_nome: component.nome || '',
            tiny_tipo: 'S', // Components are usually simple products
            quantity: parseFloat(row.quantity) * (component.quantidade || 1),
            unit_price: 0, // Components don't have individual prices in kits
            total_price: 0,
            parent_product_id: row.tiny_product_id,
            parent_codigo: row.tiny_codigo,
            parent_nome: row.tiny_nome,
            parent_tipo: 'K',
            is_component: true,
          });
        }
      } else {
        reportItems.push(item);
      }
    }

    // Calculate summary statistics
    const summary = {
      period: {
        year,
        month,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      marketplace: marketplace,
      total_orders: new Set(reportItems.map(i => i.marketplace_order_id)).size,
      total_items: reportItems.filter(i => !i.is_component).length,
      total_revenue: reportItems
        .filter(i => !i.is_component)
        .reduce((sum, item) => sum + item.total_price, 0),
      breakdown_by_marketplace: {} as Record<string, any>,
      breakdown_by_product_type: {} as Record<string, any>,
    };

    // Group by marketplace
    for (const item of reportItems.filter(i => !i.is_component)) {
      if (!summary.breakdown_by_marketplace[item.marketplace]) {
        summary.breakdown_by_marketplace[item.marketplace] = {
          orders: new Set(),
          items: 0,
          revenue: 0,
        };
      }
      summary.breakdown_by_marketplace[item.marketplace].orders.add(item.marketplace_order_id);
      summary.breakdown_by_marketplace[item.marketplace].items++;
      summary.breakdown_by_marketplace[item.marketplace].revenue += item.total_price;
    }

    // Convert Sets to counts
    for (const mkt in summary.breakdown_by_marketplace) {
      summary.breakdown_by_marketplace[mkt].orders =
        summary.breakdown_by_marketplace[mkt].orders.size;
    }

    // Group by product type
    for (const item of reportItems.filter(i => !i.is_component)) {
      const type = item.tiny_tipo || 'unknown';
      if (!summary.breakdown_by_product_type[type]) {
        summary.breakdown_by_product_type[type] = {
          count: 0,
          quantity: 0,
          revenue: 0,
        };
      }
      summary.breakdown_by_product_type[type].count++;
      summary.breakdown_by_product_type[type].quantity += item.quantity;
      summary.breakdown_by_product_type[type].revenue += item.total_price;
    }

    return NextResponse.json({
      success: true,
      summary,
      items: reportItems,
      count: reportItems.length,
    });

  } catch (error) {
    console.error('[GET /api/reports/monthly-sales] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate sales report', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Extract kit components from product raw_payload
 */
function extractKitComponents(rawPayload: any): any[] {
  if (!rawPayload) return [];

  // Try different possible paths for kit components
  const paths = [
    ['componentes'],
    ['produto', 'componentes'],
    ['componentes', 'componente'],
    ['produto', 'componentes', 'componente'],
    ['kit', 'componentes'],
    ['itensKit'],
  ];

  for (const path of paths) {
    let current = rawPayload;
    for (const key of path) {
      if (current && typeof current === 'object') {
        current = current[key];
      } else {
        current = null;
        break;
      }
    }

    if (Array.isArray(current)) {
      return current;
    } else if (current && typeof current === 'object') {
      return [current];
    }
  }

  return [];
}

/**
 * Fallback implementation using TypeScript (if SQL RPC fails)
 */
async function generateReportFallback(params: {
  startDate: string;
  endDate: string;
  marketplace: 'magalu' | 'shopee' | 'mercado_livre' | 'all';
}) {
  const { startDate, endDate, marketplace } = params;

  // Get linked orders
  let query = supabaseAdmin
    .from('vw_marketplace_orders_linked')
    .select('*')
    .gte('marketplace_order_date', startDate)
    .lte('marketplace_order_date', endDate);

  if (marketplace !== 'all') {
    query = query.eq('marketplace', marketplace);
  }

  const { data: linkedOrders, error: linksError } = await query;

  if (linksError) {
    throw linksError;
  }

  // Get order items for each linked Tiny order
  const tinyOrderIds = ((linkedOrders as any[]) || []).map((o: any) => o.tiny_order_id);

  if (tinyOrderIds.length === 0) {
    return NextResponse.json({
      success: true,
      summary: {
        period: { startDate, endDate },
        marketplace,
        total_orders: 0,
        total_items: 0,
        total_revenue: 0,
      },
      items: [],
      count: 0,
    });
  }

  const { data: orderItems, error: itemsError } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select(`
      *,
      produto:tiny_produtos(id_produto_tiny, codigo, nome, tipo, raw_payload)
    `)
    .in('id_pedido', tinyOrderIds);

  if (itemsError) {
    throw itemsError;
  }

  // Combine data
  const reportItems: SalesReportItem[] = [];

  for (const linkedOrder of ((linkedOrders as any[]) || [])) {
    const items = ((orderItems as any[]) || []).filter((item: any) => item.id_pedido === linkedOrder.tiny_order_id);

    for (const item of items) {
      const produto = Array.isArray(item.produto) ? item.produto[0] : item.produto;

      reportItems.push({
        marketplace: linkedOrder.marketplace,
        marketplace_order_id: linkedOrder.marketplace_order_id,
        marketplace_order_date: linkedOrder.marketplace_order_date,
        tiny_numero_pedido: linkedOrder.tiny_numero_pedido,
        tiny_product_id: item.id_produto_tiny,
        tiny_codigo: item.codigo_produto,
        tiny_nome: item.nome_produto,
        tiny_tipo: produto?.tipo || 'S',
        quantity: parseFloat(item.quantidade),
        unit_price: parseFloat(item.valor_unitario),
        total_price: parseFloat(item.valor_total),
      });

      // Expand kits
      if (produto?.tipo === 'K' && produto.raw_payload) {
        const components = extractKitComponents(produto.raw_payload);
        for (const component of components) {
          reportItems.push({
            marketplace: linkedOrder.marketplace,
            marketplace_order_id: linkedOrder.marketplace_order_id,
            marketplace_order_date: linkedOrder.marketplace_order_date,
            tiny_numero_pedido: linkedOrder.tiny_numero_pedido,
            tiny_product_id: component.id_produto_tiny || 0,
            tiny_codigo: component.codigo || '',
            tiny_nome: component.nome || '',
            tiny_tipo: 'S',
            quantity: parseFloat(item.quantidade) * (component.quantidade || 1),
            unit_price: 0,
            total_price: 0,
            parent_product_id: item.id_produto_tiny,
            parent_codigo: item.codigo_produto,
            parent_nome: item.nome_produto,
            parent_tipo: 'K',
            is_component: true,
          });
        }
      }
    }
  }

  // Summary (similar to main implementation)
  const summary = {
    period: { startDate, endDate },
    marketplace,
    total_orders: new Set(reportItems.map(i => i.marketplace_order_id)).size,
    total_items: reportItems.filter(i => !i.is_component).length,
    total_revenue: reportItems
      .filter(i => !i.is_component)
      .reduce((sum, item) => sum + item.total_price, 0),
  };

  return NextResponse.json({
    success: true,
    summary,
    items: reportItems,
    count: reportItems.length,
  });
}
