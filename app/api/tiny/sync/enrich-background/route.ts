// app/api/tiny/sync/enrich-background/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { obterPedidoDetalhado } from '@/lib/tinyApi';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';

/**
 * Background enrichment endpoint
 * Enriches up to 10 unenriched orders per call
 * Designed to be called frequently (e.g., every 5 minutes from a cron)
 */
export async function GET(req: NextRequest) {
  try {
    let token: string | null = process.env.TINY_ACCESS_TOKEN || null;
    if (!token) {
      token = (await getAccessTokenFromDbOrRefresh().catch(() => null)) as string | null;
    }
    if (!token) {
      return NextResponse.json({ enriched: 0, error: 'No token' }, { status: 401 });
    }

    // Find unenriched orders by fetching orders and filtering in memory
    // (more reliable than JSON null checks in Supabase filters)
    const { data: allOrders } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, raw')
      .order('data_criacao', { ascending: false })
      .limit(100);

    const unenrichedOrders = (allOrders || [])
      .filter(o => !o.raw?.valorTotalPedido)
      .slice(0, 10);

    if (!unenrichedOrders.length) {
      return NextResponse.json({ enriched: 0, message: 'No unenriched orders' });
    }

    let enriched = 0;
    let failed = 0;

    // Process each unenriched order
    for (const order of unenrichedOrders) {
      try {
        const tinyId = order.tiny_id;
        
        // Fetch detailed data from Tiny API
        const detailed = await obterPedidoDetalhado(token, tinyId);
        const valorTotal = Number(detailed.valorTotalPedido) || 0;
        const valorProdutos = Number(detailed.valorTotalProdutos) || 0;
        const valorFrete = Math.max(0, valorTotal - valorProdutos);

        // Merge with existing data to preserve all fields
        const existingRaw = order.raw || {};
        const mergedRaw = {
          ...existingRaw,
          valorTotalPedido: valorTotal,
          valorTotalProdutos: valorProdutos,
          valorFrete,
        };

        // Update in database
        const { error } = await supabaseAdmin
          .from('tiny_orders')
          .update({ raw: mergedRaw })
          .eq('tiny_id', tinyId);

        if (!error) {
          enriched++;
        } else {
          failed++;
        }
        
        // Rate limit: 500ms between detailed API calls to respect 120 req/min limit
        await new Promise(r => setTimeout(r, 500));
      } catch {
        failed++;
      }
    }

    return NextResponse.json({
      enriched,
      failed,
      total: unenrichedOrders.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
