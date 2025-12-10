import { NextResponse } from 'next/server';
import { checkMagaluStatus } from '@/lib/magaluClientV2';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/marketplaces/magalu/status
 * Verifica o status da integração Magalu
 */
export async function GET() {
  try {
    // Verificar status da autenticação
    const authStatus = await checkMagaluStatus();

    // Buscar estatísticas do banco
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: totalOrders } = await (supabaseAdmin as any)
      .from('magalu_orders')
      .select('*', { count: 'exact', head: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cursor } = await (supabaseAdmin as any)
      .from('magalu_sync_cursor')
      .select('*')
      .eq('id', 1)
      .single();

    // Buscar distribuição de status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: statusDistribution } = await (supabaseAdmin as any)
      .from('magalu_orders')
      .select('order_status')
      .not('order_status', 'is', null);

    const statusCounts: Record<string, number> = {};
    for (const row of statusDistribution || []) {
      const status = row.order_status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    // Buscar período de dados
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dateRange } = await (supabaseAdmin as any)
      .from('magalu_orders')
      .select('purchased_date')
      .order('purchased_date', { ascending: true })
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: latestOrder } = await (supabaseAdmin as any)
      .from('magalu_orders')
      .select('purchased_date')
      .order('purchased_date', { ascending: false })
      .limit(1);

    return NextResponse.json({
      ok: true,
      data: {
        auth: {
          configured: authStatus.configured,
          authenticated: authStatus.authenticated,
          expiresAt: authStatus.expiresAt?.toISOString(),
          error: authStatus.error,
        },
        sync: {
          status: cursor?.sync_status || 'unknown',
          lastSyncAt: cursor?.last_sync_at,
          totalOrdersSynced: cursor?.total_orders_synced || 0,
          errorMessage: cursor?.error_message,
        },
        database: {
          totalOrders: totalOrders || 0,
          statusDistribution: statusCounts,
          oldestOrderDate: dateRange?.[0]?.purchased_date,
          newestOrderDate: latestOrder?.[0]?.purchased_date,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[Magalu Status] Erro:', message);
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 }
    );
  }
}
