/**
 * Script para enriquecer pedidos recentes com itens, frete e canal
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getAccessTokenFromDbOrRefresh } from "../lib/tinyAuth";
import { sincronizarItensPorPedidos } from "../lib/pedidoItensHelper";
import { runFreteEnrichment } from "../lib/freteEnricher";
import { normalizeMissingOrderChannels } from "../lib/channelNormalizer";

async function enrichRecentOrders() {
  console.log('🔄 Enriquecendo pedidos recentes...\n');

  const accessToken = await getAccessTokenFromDbOrRefresh();

  // Buscar pedidos de hoje que precisam de enriquecimento
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: orders, error } = await supabaseAdmin
    .from('tiny_orders')
    .select('tiny_id, numero_pedido, data_criacao')
    .gte('data_criacao', today.toISOString())
    .order('data_criacao', { ascending: false });

  if (error) {
    console.error('❌ Erro ao buscar pedidos:', error.message);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('📄 Nenhum pedido recente encontrado');
    return;
  }

  console.log(`📦 ${orders.length} pedidos encontrados de hoje\n`);

  // 1. Sincronizar itens
  console.log('📦 Sincronizando itens...');
  try {
    const tinyIds = orders.map(o => o.tiny_id);
    const itensResult = await sincronizarItensPorPedidos(accessToken, tinyIds, {
      batchSize: 10,
      delayMs: 700,
    });
    
    console.log(`✅ ${itensResult.totalItens} itens de ${itensResult.sucesso} pedidos\n`);
  } catch (error: any) {
    console.error('❌ Erro ao sincronizar itens:', error.message);
  }

  // 2. Enriquecer frete
  console.log('🚚 Enriquecendo valor de frete...');
  try {
    const freteResult = await runFreteEnrichment(accessToken, {
      maxRequests: 50,
      dataMinima: today,
    });
    console.log(`✅ ${freteResult.updated} pedidos com frete atualizado\n`);
  } catch (error: any) {
    console.error('❌ Erro ao enriquecer frete:', error.message);
  }

  // 3. Normalizar canais
  console.log('📺 Normalizando canais...');
  try {
    const canalResult = await normalizeMissingOrderChannels();
    console.log(`✅ ${canalResult.updated} canais normalizados\n`);
  } catch (error: any) {
    console.error('❌ Erro ao normalizar canais:', error.message);
  }

  console.log('✅ Enriquecimento completo!');
}

enrichRecentOrders().catch(console.error);
