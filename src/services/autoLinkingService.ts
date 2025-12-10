/**
 * Serviço de vinculação automática de pedidos dos marketplaces com pedidos do Tiny
 * Faz o match baseado nos IDs que o Tiny armazena no campo ecommerce.numeroPedidoEcommerce
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  createOrderLink,
  getOrderLinkByMarketplaceOrder,
} from '@/src/repositories/orderLinkingRepository';

interface AutoLinkResult {
  total_processed: number;
  total_linked: number;
  total_already_linked: number;
  total_not_found: number;
  errors: string[];
  linked_orders: Array<{
    marketplace: string;
    marketplace_order_id: string;
    tiny_order_id: number;
    tiny_numero_pedido: number;
  }>;
}

/**
 * Extrai o ID do pedido do marketplace do raw_payload do Tiny
 */
function extractMarketplaceOrderId(rawPayload: any): string | null {
  if (!rawPayload) return null;

  // Tiny armazena no campo ecommerce.numeroPedidoEcommerce
  const numeroEcommerce = rawPayload.ecommerce?.numeroPedidoEcommerce;
  if (numeroEcommerce && typeof numeroEcommerce === 'string') {
    return numeroEcommerce.trim();
  }

  return null;
}

/**
 * Determina qual marketplace baseado no canal do Tiny
 */
function getMarketplaceFromCanal(canal: string | null): 'magalu' | 'shopee' | 'mercado_livre' | null {
  if (!canal) return null;

  const canalLower = canal.toLowerCase();

  if (canalLower.includes('shopee')) return 'shopee';
  if (canalLower.includes('mercado') || canalLower.includes('meli')) return 'mercado_livre';
  if (canalLower.includes('magalu') || canalLower.includes('magazine')) return 'magalu';

  return null;
}

/**
 * Vincula automaticamente pedidos dos últimos N dias
 */
export async function autoLinkOrders(daysBack = 90): Promise<AutoLinkResult> {
  const result: AutoLinkResult = {
    total_processed: 0,
    total_linked: 0,
    total_already_linked: 0,
    total_not_found: 0,
    errors: [],
    linked_orders: [],
  };

  try {
    // Calcular data de início (X dias atrás)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateISO = startDate.toISOString();

    console.log(`[autoLinkOrders] Buscando pedidos do Tiny desde ${startDateISO}...`);

    // Buscar pedidos do Tiny dos últimos N dias que têm canal de marketplace
    const { data: tinyOrders, error: tinyError } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, numero_pedido, canal, data_criacao, raw_payload')
      .gte('data_criacao', startDateISO)
      .in('canal', ['Shopee', 'Mercado Livre', 'Magalu'])
      .not('raw_payload', 'is', null)
      .order('data_criacao', { ascending: false });

    if (tinyError) {
      console.error('[autoLinkOrders] Erro ao buscar pedidos do Tiny:', tinyError);
      result.errors.push(`Erro ao buscar pedidos do Tiny: ${tinyError.message}`);
      return result;
    }

    console.log(`[autoLinkOrders] Encontrados ${tinyOrders?.length || 0} pedidos do Tiny para processar`);

    // Processar cada pedido do Tiny
    for (const tinyOrder of tinyOrders || []) {
      result.total_processed++;

      // Extrair ID do marketplace do raw_payload
      const marketplaceOrderId = extractMarketplaceOrderId(tinyOrder.raw_payload);
      if (!marketplaceOrderId) {
        console.log(
          `[autoLinkOrders] Pedido Tiny #${tinyOrder.numero_pedido}: sem ID do marketplace no raw_payload`
        );
        result.total_not_found++;
        continue;
      }

      // Determinar qual marketplace
      const marketplace = getMarketplaceFromCanal(tinyOrder.canal);
      if (!marketplace) {
        console.log(
          `[autoLinkOrders] Pedido Tiny #${tinyOrder.numero_pedido}: canal não reconhecido (${tinyOrder.canal})`
        );
        result.total_not_found++;
        continue;
      }

      // Verificar se já existe vinculação
      try {
        const existingLink = await getOrderLinkByMarketplaceOrder(marketplace, marketplaceOrderId);
        if (existingLink) {
          console.log(
            `[autoLinkOrders] Pedido ${marketplaceOrderId} (${marketplace}) já vinculado ao Tiny #${existingLink.tiny_order_id}`
          );
          result.total_already_linked++;
          continue;
        }
      } catch (error: any) {
        // Continuar se não encontrado
        if (error?.code !== 'PGRST116') {
          console.error(
            `[autoLinkOrders] Erro ao verificar link existente para ${marketplaceOrderId}:`,
            error
          );
          result.errors.push(`Erro ao verificar link: ${error.message}`);
          continue;
        }
      }

      // Verificar se o pedido do marketplace existe
      let marketplaceOrderExists = false;
      let actualMarketplaceOrderId = marketplaceOrderId;

      if (marketplace === 'shopee') {
        const { data, error } = await supabaseAdmin
          .from('shopee_orders')
          .select('order_sn')
          .eq('order_sn', marketplaceOrderId)
          .single();

        if (!error && data) {
          marketplaceOrderExists = true;
        }
      } else if (marketplace === 'mercado_livre') {
        // Para Mercado Livre, verificar tanto o meli_order_id quanto o pack_id
        // Primeiro tenta buscar pelo meli_order_id direto
        const { data: directOrder } = await supabaseAdmin
          .from('meli_orders')
          .select('meli_order_id')
          .eq('meli_order_id', parseInt(marketplaceOrderId))
          .maybeSingle();

        if (directOrder) {
          marketplaceOrderExists = true;
        } else {
          // Se não encontrar, busca por pack_id no raw_payload
          // Precisa buscar todos e filtrar manualmente pois pack_id está no JSON
          const { data: allOrders } = await supabaseAdmin
            .from('meli_orders')
            .select('meli_order_id, raw_payload')
            .limit(1000);

          const orderWithPackId = allOrders?.find(order => {
            const raw = order.raw_payload as any;
            return raw?.pack_id?.toString() === marketplaceOrderId;
          });

          if (orderWithPackId) {
            marketplaceOrderExists = true;
            // Atualizar para usar o ID real do pedido ao invés do pack_id
            actualMarketplaceOrderId = orderWithPackId.meli_order_id.toString();
            console.log(
              `[autoLinkOrders] Encontrado pedido ${actualMarketplaceOrderId} via pack_id ${marketplaceOrderId} do Tiny`
            );
          }
        }
      } else if (marketplace === 'magalu') {
        const { data, error } = await supabaseAdmin
          .from('magalu_orders')
          .select('id_order')
          .eq('id_order', marketplaceOrderId)
          .single();

        if (!error && data) {
          marketplaceOrderExists = true;
        }
      }

      if (!marketplaceOrderExists) {
        console.log(
          `[autoLinkOrders] Pedido ${marketplaceOrderId} (${marketplace}) não encontrado na base de dados do marketplace`
        );
        result.total_not_found++;
        continue;
      }

      // Criar vinculação automática
      try {
        await createOrderLink({
          marketplace,
          marketplace_order_id: actualMarketplaceOrderId,
          tiny_order_id: tinyOrder.id,
          linked_by: 'auto-linking-service',
          confidence_score: 1.0, // 100% de confiança pois é match exato de ID
          notes: `Vinculação automática baseada em ID do marketplace (${actualMarketplaceOrderId})${actualMarketplaceOrderId !== marketplaceOrderId ? ` - Tiny pack_id: ${marketplaceOrderId}` : ''}`,
        });

        console.log(
          `[autoLinkOrders] ✓ Vinculado: ${marketplace} ${actualMarketplaceOrderId} → Tiny #${tinyOrder.numero_pedido} (ID: ${tinyOrder.id})`
        );

        result.total_linked++;
        result.linked_orders.push({
          marketplace,
          marketplace_order_id: actualMarketplaceOrderId,
          tiny_order_id: tinyOrder.id,
          tiny_numero_pedido: tinyOrder.numero_pedido || 0,
        });
      } catch (error: any) {
        console.error(
          `[autoLinkOrders] Erro ao criar link para ${actualMarketplaceOrderId}:`,
          error
        );
        result.errors.push(`Erro ao vincular ${actualMarketplaceOrderId}: ${error.message}`);
      }
    }

    console.log('\n[autoLinkOrders] Resumo:');
    console.log(`  Total processado: ${result.total_processed}`);
    console.log(`  Total vinculado: ${result.total_linked}`);
    console.log(`  Já vinculados: ${result.total_already_linked}`);
    console.log(`  Não encontrados: ${result.total_not_found}`);
    console.log(`  Erros: ${result.errors.length}`);

    return result;
  } catch (error: any) {
    console.error('[autoLinkOrders] Erro fatal:', error);
    result.errors.push(`Erro fatal: ${error.message}`);
    return result;
  }
}

/**
 * Vincula automaticamente apenas pedidos de um marketplace específico
 */
export async function autoLinkMarketplace(
  marketplace: 'magalu' | 'shopee' | 'mercado_livre',
  daysBack = 90
): Promise<AutoLinkResult> {
  const result: AutoLinkResult = {
    total_processed: 0,
    total_linked: 0,
    total_already_linked: 0,
    total_not_found: 0,
    errors: [],
    linked_orders: [],
  };

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateISO = startDate.toISOString();

    // Determinar canal do Tiny baseado no marketplace
    let canalFilter: string;
    if (marketplace === 'shopee') canalFilter = 'Shopee';
    else if (marketplace === 'mercado_livre') canalFilter = 'Mercado Livre';
    else canalFilter = 'Magalu';

    console.log(`[autoLinkMarketplace] Processando ${marketplace} desde ${startDateISO}...`);

    // Buscar pedidos do Tiny do marketplace específico
    const { data: tinyOrders, error: tinyError } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, numero_pedido, canal, data_criacao, raw_payload')
      .gte('data_criacao', startDateISO)
      .eq('canal', canalFilter)
      .not('raw_payload', 'is', null)
      .order('data_criacao', { ascending: false });

    if (tinyError) {
      result.errors.push(`Erro ao buscar pedidos: ${tinyError.message}`);
      return result;
    }

    console.log(`[autoLinkMarketplace] Encontrados ${tinyOrders?.length || 0} pedidos`);

    for (const tinyOrder of tinyOrders || []) {
      result.total_processed++;

      const marketplaceOrderId = extractMarketplaceOrderId(tinyOrder.raw_payload);
      if (!marketplaceOrderId) {
        result.total_not_found++;
        continue;
      }

      // Verificar se já existe vinculação
      try {
        const existingLink = await getOrderLinkByMarketplaceOrder(marketplace, marketplaceOrderId);
        if (existingLink) {
          result.total_already_linked++;
          continue;
        }
      } catch (error: any) {
        if (error?.code !== 'PGRST116') {
          result.errors.push(`Erro ao verificar link: ${error.message}`);
          continue;
        }
      }

      // Verificar se o pedido existe no marketplace
      let exists = false;
      let actualMarketplaceOrderId = marketplaceOrderId;

      if (marketplace === 'shopee') {
        const { data } = await supabaseAdmin
          .from('shopee_orders')
          .select('order_sn')
          .eq('order_sn', marketplaceOrderId)
          .single();
        exists = !!data;
      } else if (marketplace === 'mercado_livre') {
        // Para Mercado Livre, verificar tanto o meli_order_id quanto o pack_id
        const { data: directOrder } = await supabaseAdmin
          .from('meli_orders')
          .select('meli_order_id')
          .eq('meli_order_id', parseInt(marketplaceOrderId))
          .maybeSingle();

        if (directOrder) {
          exists = true;
        } else {
          // Buscar por pack_id
          const { data: allOrders } = await supabaseAdmin
            .from('meli_orders')
            .select('meli_order_id, raw_payload')
            .limit(1000);

          const orderWithPackId = allOrders?.find(order => {
            const raw = order.raw_payload as any;
            return raw?.pack_id?.toString() === marketplaceOrderId;
          });

          if (orderWithPackId) {
            exists = true;
            actualMarketplaceOrderId = orderWithPackId.meli_order_id.toString();
          }
        }
      } else if (marketplace === 'magalu') {
        const { data } = await supabaseAdmin
          .from('magalu_orders')
          .select('id_order')
          .eq('id_order', marketplaceOrderId)
          .single();
        exists = !!data;
      }

      if (!exists) {
        result.total_not_found++;
        continue;
      }

      // Criar vinculação
      try {
        await createOrderLink({
          marketplace,
          marketplace_order_id: actualMarketplaceOrderId,
          tiny_order_id: tinyOrder.id,
          linked_by: 'auto-linking-service',
          confidence_score: 1.0,
          notes: `Auto-link: ${marketplace} ${actualMarketplaceOrderId}${actualMarketplaceOrderId !== marketplaceOrderId ? ` (Tiny pack_id: ${marketplaceOrderId})` : ''}`,
        });

        result.total_linked++;
        result.linked_orders.push({
          marketplace,
          marketplace_order_id: actualMarketplaceOrderId,
          tiny_order_id: tinyOrder.id,
          tiny_numero_pedido: tinyOrder.numero_pedido || 0,
        });
      } catch (error: any) {
        result.errors.push(`Erro ao vincular ${actualMarketplaceOrderId}: ${error.message}`);
      }
    }

    return result;
  } catch (error: any) {
    result.errors.push(`Erro fatal: ${error.message}`);
    return result;
  }
}
