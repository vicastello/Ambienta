import { NextRequest, NextResponse } from 'next/server';
import { autoLinkOrders } from '@/src/services/autoLinkingService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/admin/cron/auto-link-orders
 *
 * Cron job para vincular automaticamente pedidos dos marketplaces
 * Deve ser executado diariamente
 *
 * Query params:
 * - daysBack: Quantos dias retroativos processar (padrão: 7)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysBack = parseInt(searchParams.get('daysBack') || '7');

    console.log('[CRON auto-link-orders] Iniciando...');
    console.log(`[CRON auto-link-orders] Processando últimos ${daysBack} dias`);

    const result = await autoLinkOrders(daysBack);

    console.log('[CRON auto-link-orders] Concluído!');
    console.log(`[CRON auto-link-orders] Vinculados: ${result.total_linked}`);
    console.log(`[CRON auto-link-orders] Já existentes: ${result.total_already_linked}`);
    console.log(`[CRON auto-link-orders] Não encontrados: ${result.total_not_found}`);

    if (result.errors.length > 0) {
      console.error('[CRON auto-link-orders] Erros:', result.errors);
    }

    return NextResponse.json({
      success: true,
      cron: 'auto-link-orders',
      timestamp: new Date().toISOString(),
      daysBack,
      result,
    });

  } catch (error) {
    console.error('[CRON auto-link-orders] Error:', error);
    return NextResponse.json(
      {
        success: false,
        cron: 'auto-link-orders',
        timestamp: new Date().toISOString(),
        error: String(error),
      },
      { status: 500 }
    );
  }
}
