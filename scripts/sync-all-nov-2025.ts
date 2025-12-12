import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';

async function syncAll() {
  console.log('🔍 Buscando TODOS os pedidos sem produtos desde 01/11/2025...\n');
  
  // 1. Pegar TODOS os pedidos desde 01/11 (sem limite)
  let allOrders: Array<{ id: number; tiny_id: number }> = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  
  while (true) {
    const { data: orders } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id')
      .gte('data_criacao', '2025-11-01')
      .order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (!orders || orders.length === 0) break;
    
    allOrders = allOrders.concat(orders);
    console.log(`  Carregada página ${page + 1}: ${orders.length} pedidos (total: ${allOrders.length})`);
    
    if (orders.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`\n📦 Total de pedidos: ${allOrders.length}`);

  const ids = allOrders.map(o => o.id);
  const tinyIdMap = new Map(allOrders.map(o => [o.id, o.tiny_id]));

  // 2. Ver quais já têm produtos
  const minId = Math.min(...ids);
  const maxId = Math.max(...ids);
  
  const { data: allItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .gte('id_pedido', minId)
    .lte('id_pedido', maxId);
  
  const orderIdsSet = new Set(ids);
  const items = allItems?.filter(item => orderIdsSet.has(item.id_pedido)) || [];
  const withItems = new Set(items?.map(x => x.id_pedido) || []);
  
  const missing = ids.filter(id => !withItems.has(id));
  
  console.log(`✅ Com produtos: ${withItems.size}`);
  console.log(`⏳ Sem produtos: ${missing.length}\n`);
  
  if (missing.length === 0) {
    console.log('✅ Todos os pedidos já têm produtos!');
    return;
  }

  // 3. Obter token de acesso do Tiny
  const accessToken = await getAccessTokenFromDbOrRefresh();
  
  // 4. Sincronizar os faltantes em lotes de 100
  console.log(`🚀 Sincronizando ${missing.length} pedidos em lotes de 100...\n`);
  
  const BATCH_SIZE = 100;
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalItems = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(missing.length / BATCH_SIZE);
    
    console.log(`\n[Lote ${batchNum}/${totalBatches}] Processando ${batch.length} pedidos...`);
    
    // Converter IDs do Supabase para tiny_ids do Tiny ERP
    const tinyIds = batch.map(id => tinyIdMap.get(id)).filter(Boolean) as number[];
    const result = await sincronizarItensPorPedidos(accessToken, tinyIds, { force: true });
    
    totalSuccess += result.sucesso;
    totalFailed += result.falhas;
    totalItems += result.totalItens;
    
    console.log(`  ✅ Sucessos: ${result.sucesso}`);
    console.log(`  ❌ Falhas: ${result.falhas}`);
    console.log(`  📦 Itens: ${result.totalItens}`);

    // Delay entre lotes para evitar rate limit
    if (i + BATCH_SIZE < missing.length) {
      console.log('  ⏳ Aguardando 2s antes do próximo lote...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n═════════════════════════════════════════════════');
  console.log('📊 RESUMO FINAL');
  console.log('═════════════════════════════════════════════════');
  console.log(`✅ Sucessos: ${totalSuccess}/${missing.length}`);
  console.log(`❌ Falhas: ${totalFailed}`);
  console.log(`📦 Total de itens inseridos: ${totalItems}`);
  console.log('═════════════════════════════════════════════════\n');
}

syncAll().catch(console.error);
