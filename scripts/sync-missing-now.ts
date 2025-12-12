#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { sincronizarItensPorPedidos } from '../lib/pedidoItensHelper';

async function syncMissingItems() {
  console.log('🔍 Buscando pedidos sem itens desde 01/11/2024...\n');

  // Buscar todos os pedidos
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id')
    .gte('data_criacao', '2024-11-01')
    .order('id');

  if (!orders) {
    console.error('❌ Erro ao buscar pedidos');
    return;
  }

  // Verificar quais já têm itens
  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orders.map(o => o.id));

  const withItems = new Set(items?.map(i => i.id_pedido) || []);
  const missing = orders.filter(o => !withItems.has(o.id) && o.tiny_id);

  console.log(`📦 Total: ${orders.length}`);
  console.log(`✅ Com itens: ${withItems.size}`);
  console.log(`⏳ Sem itens: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('🎉 Todos os pedidos já têm itens!');
    return;
  }

  console.log(`🚀 Sincronizando ${missing.length} pedidos...\n`);

  const accessToken = await getAccessTokenFromDbOrRefresh();
  const tinyIds = missing.map(o => o.tiny_id!);

  const BATCH_SIZE = 100;
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalItems = 0;

  for (let i = 0; i < tinyIds.length; i += BATCH_SIZE) {
    const batch = tinyIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tinyIds.length / BATCH_SIZE);

    console.log(`   Lote ${batchNum}/${totalBatches} (${batch.length} pedidos)...`);

    const result = await sincronizarItensPorPedidos(accessToken, batch, {
      delayMs: 1000,
      retries: 2,
      force: false,
      context: 'sync_remaining_items',
    });

    totalSuccess += result.sucesso;
    totalFailed += result.falhas;
    totalItems += result.totalItens;

    console.log(`   ✓ ${result.sucesso} sucesso, ${result.falhas} falhas, ${result.totalItens} itens\n`);

    // Delay entre lotes
    if (i + BATCH_SIZE < tinyIds.length) {
      console.log('   ⏸️  Aguardando 30s...\n');
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  console.log('\n═════════════════════════════════════════════════');
  console.log('RESULTADO FINAL');
  console.log('═════════════════════════════════════════════════');
  console.log(`✅ Sucessos: ${totalSuccess}`);
  console.log(`❌ Falhas: ${totalFailed}`);
  console.log(`📦 Total de itens: ${totalItems}`);
  console.log('═════════════════════════════════════════════════\n');
}

syncMissingItems().catch(console.error);
