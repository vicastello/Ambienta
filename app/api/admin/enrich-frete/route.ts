import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function POST() {
  try {
    // Get orders without valor_frete from last 30 days
    const { data: orders, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido')
      .is('valor_frete', null)
      .gte('data_criacao', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .limit(200); // Process 200 at a time - faster batches

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ 
        message: 'No orders need enrichment', 
        enriched: 0 
      });
    }

    const token = await getAccessTokenFromDbOrRefresh();
    let enriched = 0;
    let failed = 0;

    // Process in parallel batches to respect 120 req/min (2 req/sec)
    const batchSize = 10; // Process 10 at a time
    
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (order) => {
          try {
            // Call Tiny API for order details
            const response = await fetch(
              `https://api.tiny.com.br/public-api/v3/pedidos/${order.tiny_id}`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json',
                },
              }
            );

            if (response.ok) {
              const data = await response.json();
              const valorFrete = data?.valorFrete || data?.frete?.valor || 0;

              // Update order with frete value
              await supabaseAdmin
                .from('tiny_orders')
                .update({ 
                  valor_frete: valorFrete,
                  raw: data, // Update full data
                  updated_at: new Date().toISOString()
                })
                .eq('tiny_id', order.tiny_id);

              return { success: true };
            } else {
              return { success: false };
            }
          } catch (err) {
            console.error(`Error enriching order ${order.numero_pedido}:`, err);
            return { success: false };
          }
        })
      );

      // Count successes and failures
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          enriched++;
        } else {
          failed++;
        }
      });

      // Delay between batches: 10 requests per 5 seconds = 120/min
      if (i + batchSize < orders.length) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return NextResponse.json({
      message: 'Enrichment completed',
      total: orders.length,
      enriched,
      failed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}
