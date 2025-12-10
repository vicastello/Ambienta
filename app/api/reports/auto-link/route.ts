import { NextRequest, NextResponse } from 'next/server';
import { autoLinkOrders, autoLinkMarketplace } from '@/src/services/autoLinkingService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/reports/auto-link
 *
 * Executa vinculação automática de pedidos dos marketplaces com pedidos do Tiny
 * Baseado nos IDs que o Tiny armazena no campo ecommerce.numeroPedidoEcommerce
 *
 * Body (optional):
 * {
 *   marketplace?: 'magalu' | 'shopee' | 'mercado_livre', // Se omitido, processa todos
 *   daysBack?: number // Quantos dias retroativos (padrão: 90)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const { marketplace, daysBack = 90 } = body;

    console.log('[POST /api/reports/auto-link] Iniciando vinculação automática...');
    console.log(`  Marketplace: ${marketplace || 'todos'}`);
    console.log(`  Dias retroativos: ${daysBack}`);

    let result;

    if (marketplace) {
      // Processar apenas um marketplace específico
      if (!['magalu', 'shopee', 'mercado_livre'].includes(marketplace)) {
        return NextResponse.json(
          { error: 'Invalid marketplace. Must be: magalu, shopee, or mercado_livre' },
          { status: 400 }
        );
      }

      result = await autoLinkMarketplace(marketplace, daysBack);
    } else {
      // Processar todos os marketplaces
      result = await autoLinkOrders(daysBack);
    }

    console.log('[POST /api/reports/auto-link] Concluído!');
    console.log(`  Total processado: ${result.total_processed}`);
    console.log(`  Total vinculado: ${result.total_linked}`);
    console.log(`  Já vinculados: ${result.total_already_linked}`);
    console.log(`  Não encontrados: ${result.total_not_found}`);
    console.log(`  Erros: ${result.errors.length}`);

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error) {
    console.error('[POST /api/reports/auto-link] Error:', error);
    return NextResponse.json(
      { error: 'Failed to auto-link orders', details: String(error) },
      { status: 500 }
    );
  }
}
