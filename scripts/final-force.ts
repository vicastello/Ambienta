#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

async function finalForce() {
  console.log('🔄 SINCRONIZAÇÃO FINAL DEFINITIVA\n');

  const accessToken = await getAccessTokenFromDbOrRefresh();

  // Buscar pedidos sem itens
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id')
    .gte('data_criacao', '2024-11-01');

  if (!orders) return;

  const allIds = orders.map(o => o.id);
  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', allIds);

  const withItems = new Set(items?.map(i => i.id_pedido) || []);
  const missing = orders.filter(o => !withItems.has(o.id) && o.tiny_id);

  console.log(`📊 Pedidos para sincronizar: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('✅ Todos os pedidos já têm itens!');
    return;
  }

  const tinyIds = missing.map(o => o.tiny_id!);
  
  // Processar em lotes de 100 com force=true
  const BATCH_SIZE = 100;
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalItems = 0;

  for (let i = 0; i < tinyIds.length; i += BATCH_SIZE) {
    const batch = tinyIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tinyIds.length / BATCH_SIZE);

    console.log(`\n📦 Lote ${batchNum}/${totalBatches} (${batch.length} pedidos)...`);

    const result = await sincronizarItensPorPedidos(accessToken, batch, {
      delayMs: 1200,
      retries: 2,
      force: true, // REMOVER itens existentes e reprocessar
      context: 'final_force_sync',
    });

    totalSuccess += result.sucesso;
    totalFailed += result.falhas;
    totalItems += result.totalItens;

    console.log(`   ✓ ${result.sucesso} ok, ${result.falhas} falhas, ${result.totalItens} itens`);

    // Delay maior entre lotes
    if (i + BATCH_SIZE < tinyIds.length) {
      console.log(`   ⏸️  Aguardando 90s...`);
      await new Promise(r => setTimeout(r, 90000));
    }
  }

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`RESULTADO FINAL`);
  console.log(`═════════════════════════════════════════════════`);
  console.log(`✅ Sucessos: ${totalSuccess}`);
  console.log(`❌ Falhas: ${totalFailed}`);
  console.log(`📦 Itens: ${totalItems}`);
  console.log(`═════════════════════════════════════════════════\n`);

  // Verificação final
  const { data: finalItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', allIds);

  const finalWithItems = new Set(finalItems?.map(i => i.id_pedido) || []);
  
  console.log(`📊 STATUS FINAL:`);
  console.log(`   Total: ${orders.length}`);
  console.log(`   Com itens: ${finalWithItems.size} (${((finalWithItems.size/orders.length)*100).toFixed(1)}%)`);
  console.log(`   Sem itens: ${orders.length - finalWithItems.size}\n`);
}

finalForce().catch(console.error);
