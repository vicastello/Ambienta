#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

async function forceSyncMissing() {
  console.log('🔄 Forçando sincronização dos 270 pedidos sem itens...\n');

  const accessToken = await getAccessTokenFromDbOrRefresh();

  // Buscar pedidos sem itens
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id')
    .gte('data_criacao', '2024-11-01');

  if (!orders) return;

  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orders.map(o => o.id));

  const withItems = new Set(items?.map(i => i.id_pedido) || []);
  const missing = orders.filter(o => !withItems.has(o.id) && o.tiny_id);

  console.log(`📊 Encontrados ${missing.length} pedidos para sincronizar\n`);

  if (missing.length === 0) {
    console.log('✅ Todos os pedidos já têm itens!');
    return;
  }

  const tinyIds = missing.map(o => o.tiny_id!);
  const BATCH_SIZE = 50; // Reduzir para 50 para evitar timeouts
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalItems = 0;

  for (let i = 0; i < tinyIds.length; i += BATCH_SIZE) {
    const batch = tinyIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tinyIds.length / BATCH_SIZE);

    console.log(`\n📦 Lote ${batchNum}/${totalBatches} (${batch.length} pedidos)...`);

    const result = await sincronizarItensPorPedidos(accessToken, batch, {
      delayMs: 800,
      retries: 1,
      force: true, // FORÇAR reprocessamento
      context: 'force_sync_missing',
    });

    totalSuccess += result.sucesso;
    totalFailed += result.falhas;
    totalItems += result.totalItens;

    console.log(`   ✓ ${result.sucesso} sucesso, ${result.falhas} falhas, ${result.totalItens} itens`);

    // Delay maior entre lotes
    if (i + BATCH_SIZE < tinyIds.length) {
      console.log(`   ⏸️  Aguardando 45s antes do próximo lote...`);
      await new Promise(r => setTimeout(r, 45000));
    }
  }

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`RESULTADO FINAL`);
  console.log(`═════════════════════════════════════════════════`);
  console.log(`✅ Sucessos: ${totalSuccess}`);
  console.log(`❌ Falhas: ${totalFailed}`);
  console.log(`📦 Total de itens: ${totalItems}`);
  console.log(`═════════════════════════════════════════════════\n`);

  // Verificação final
  const { data: finalItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orders.map(o => o.id));

  const finalWithItems = new Set(finalItems?.map(i => i.id_pedido) || []);
  
  console.log(`📊 VERIFICAÇÃO FINAL:`);
  console.log(`   Total: ${orders.length}`);
  console.log(`   Com itens: ${finalWithItems.size} (${((finalWithItems.size/orders.length)*100).toFixed(1)}%)`);
  console.log(`   Sem itens: ${orders.length - finalWithItems.size}\n`);
}

forceSyncMissing().catch(console.error);
