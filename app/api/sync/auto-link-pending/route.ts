import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function getNumeroPedidoEcommerceFromRaw(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const ecommerce = raw['ecommerce'];
  if (!isRecord(ecommerce)) return null;
  const numero = ecommerce['numeroPedidoEcommerce'];
  return typeof numero === 'string' ? numero : null;
}

/**
 * API para vincular automaticamente pedidos pendentes
 * Verifica pedidos do Tiny que ainda não têm vínculo com marketplace
 * e tenta criar o vínculo se o pedido do marketplace existir
 */
export async function POST(request: Request) {
  try {
    console.log('[auto-link] Iniciando vinculação automática de pedidos pendentes...');

    const { daysBack = 7 } = await request.json().catch(() => ({}));

    // Data de início (últimos N dias)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateISO = startDate.toISOString();

    const result = {
      total_processed: 0,
      total_linked: 0,
      total_already_linked: 0,
      total_pending: 0,
      errors: [] as string[],
    };

    // Buscar pedidos do Tiny dos últimos N dias que são de marketplace
    const { data: tinyOrders, error: tinyError } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, numero_pedido, canal, tiny_id, raw_payload, numero_pedido_ecommerce')
      .gte('data_criacao', startDateISO)
      .in('canal', ['Shopee', 'Magalu', 'Mercado Livre'])
      .order('data_criacao', { ascending: false })
      .limit(500);

    if (tinyError) {
      console.error('[auto-link] Erro ao buscar pedidos:', tinyError);
      return NextResponse.json({ error: tinyError.message }, { status: 500 });
    }

    console.log(`[auto-link] Encontrados ${tinyOrders?.length || 0} pedidos para processar`);

    for (const tinyOrder of tinyOrders || []) {
      result.total_processed++;

      // Verificar se já tem vínculo
      const { data: existingLink } = await supabaseAdmin
        .from('marketplace_order_links')
        .select('id')
        .eq('tiny_order_id', tinyOrder.id)
        .maybeSingle();

      if (existingLink) {
        result.total_already_linked++;
        continue;
      }

      // Extrair ID do marketplace
      let marketplaceOrderId: string | null = null;

      // Tentar da coluna numero_pedido_ecommerce primeiro
      if (tinyOrder.numero_pedido_ecommerce) {
        marketplaceOrderId = tinyOrder.numero_pedido_ecommerce.trim();
      }
      // Se não tiver, tentar do raw_payload
      else if (tinyOrder.raw_payload) {
        const numeroEcommerce = getNumeroPedidoEcommerceFromRaw(tinyOrder.raw_payload as unknown);
        if (numeroEcommerce && typeof numeroEcommerce === 'string') {
          marketplaceOrderId = numeroEcommerce.trim();
        }
      }

      if (!marketplaceOrderId) {
        result.total_pending++;
        continue;
      }

      // Determinar marketplace
      let marketplace: 'magalu' | 'shopee' | 'mercado_livre' | null = null;
      const canalLower = (tinyOrder.canal || '').toLowerCase();

      if (canalLower.includes('shopee')) marketplace = 'shopee';
      else if (canalLower.includes('mercado') || canalLower.includes('meli')) marketplace = 'mercado_livre';
      else if (canalLower.includes('magalu') || canalLower.includes('magazine')) marketplace = 'magalu';

      if (!marketplace) {
        result.total_pending++;
        continue;
      }

      // Verificar se o pedido existe no marketplace
      let marketplaceExists = false;
      let actualMarketplaceOrderId = marketplaceOrderId;

      if (marketplace === 'shopee') {
        const { data } = await supabaseAdmin
          .from('shopee_orders')
          .select('order_sn')
          .eq('order_sn', marketplaceOrderId)
          .maybeSingle();
        marketplaceExists = !!data;
      } else if (marketplace === 'magalu') {
        const normalized = marketplaceOrderId.startsWith('LU-')
          ? marketplaceOrderId.replace(/^LU-/, '')
          : marketplaceOrderId;
        const { data } = await supabaseAdmin
          .from('magalu_orders')
          .select('order_id')
          .eq('order_id', normalized)
          .maybeSingle();
        marketplaceExists = !!data;
        if (marketplaceExists) actualMarketplaceOrderId = normalized;
      } else if (marketplace === 'mercado_livre') {
        const { data } = await supabaseAdmin
          .from('meli_orders')
          .select('meli_order_id')
          .eq('meli_order_id', parseInt(marketplaceOrderId, 10))
          .maybeSingle();
        marketplaceExists = !!data;
      }

      if (!marketplaceExists) {
        result.total_pending++;
        continue;
      }

      // Criar vínculo
      const { error: linkError } = await supabaseAdmin
        .from('marketplace_order_links')
        .insert({
          marketplace,
          marketplace_order_id: actualMarketplaceOrderId,
          tiny_order_id: tinyOrder.id,
          linked_by: 'auto-link-api',
          confidence_score: 1.0,
          notes: `Vinculação automática via cron`,
        });

      if (linkError) {
        console.error(`[auto-link] Erro ao vincular ${actualMarketplaceOrderId}:`, linkError.message);
        result.errors.push(`${actualMarketplaceOrderId}: ${linkError.message}`);
      } else {
        console.log(`[auto-link] ✓ Vinculado: ${marketplace} ${actualMarketplaceOrderId} → Tiny #${tinyOrder.numero_pedido}`);
        result.total_linked++;
      }
    }

    console.log('[auto-link] Resumo:');
    console.log(`  Processados: ${result.total_processed}`);
    console.log(`  Vinculados: ${result.total_linked}`);
    console.log(`  Já vinculados: ${result.total_already_linked}`);
    console.log(`  Pendentes: ${result.total_pending}`);
    console.log(`  Erros: ${result.errors.length}`);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[auto-link] Erro fatal:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
