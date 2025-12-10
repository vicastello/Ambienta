#!/usr/bin/env tsx
/**
 * Script para encontrar todos os pedidos de um pack do Mercado Livre
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function findPackOrders() {
  const packId = '2000010464212373';

  console.log('='.repeat(80));
  console.log(`BUSCANDO PEDIDOS DO PACK ${packId}`);
  console.log('='.repeat(80));
  console.log();

  // Buscar todos os pedidos deste pack usando raw_payload
  const { data: allOrders, error } = await supabaseAdmin
    .from('meli_orders')
    .select('*')
    .order('date_created', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Erro:', error);
    return;
  }

  // Filtrar manualmente por pack_id no raw_payload
  const packOrders = allOrders?.filter(order => {
    const raw = order.raw_payload as any;
    return raw?.pack_id?.toString() === packId || order.meli_order_id?.toString() === packId;
  }) || [];

  console.log(`✓ Encontrados ${packOrders.length} pedidos relacionados ao pack ${packId}:`);
  console.log();

  for (const order of packOrders) {
    const raw = order.raw_payload as any;

    console.log('─'.repeat(80));
    console.log(`Pedido Mercado Livre: ${order.meli_order_id}`);
    console.log(`  Data: ${order.date_created}`);
    console.log(`  Status: ${order.status}`);
    console.log(`  Valor: R$ ${order.total_amount?.toFixed(2)}`);
    console.log(`  Comprador: ${order.buyer_nickname}`);
    console.log(`  Pack ID: ${raw?.pack_id || 'N/A'}`);
    console.log();

    // Buscar itens
    const { data: items } = await supabaseAdmin
      .from('meli_order_items')
      .select('sku, title, quantity, unit_price')
      .eq('meli_order_id', order.meli_order_id);

    if (items && items.length > 0) {
      console.log(`  Itens (${items.length}):`);
      for (const item of items) {
        console.log(`    • ${item.title}`);
        console.log(`      SKU: ${item.sku} | Qtd: ${item.quantity} | R$ ${item.unit_price?.toFixed(2)}`);
      }
      console.log();
    }
  }

  // Buscar no Tiny usando o pack_id
  console.log('='.repeat(80));
  console.log('BUSCANDO NO TINY...');
  console.log('='.repeat(80));
  console.log();

  const { data: tinyOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .eq('canal', 'Mercado Livre')
    .order('data_criacao', { ascending: false })
    .limit(200);

  // Procurar pelo pack_id no raw_payload do Tiny
  const tinyOrder = tinyOrders?.find(order => {
    const raw = order.raw_payload as any;
    return raw?.ecommerce?.numeroPedidoEcommerce === packId;
  });

  if (tinyOrder) {
    console.log('✅ ENCONTRADO NO TINY!');
    console.log();
    console.log(`Pedido Tiny #${tinyOrder.numero_pedido} (ID: ${tinyOrder.id})`);
    console.log(`  Data: ${tinyOrder.data_criacao}`);
    console.log(`  Valor: R$ ${tinyOrder.valor?.toFixed(2)}`);
    console.log(`  Cliente: ${tinyOrder.cliente_nome}`);
    console.log(`  ID Mercado Livre armazenado: ${(tinyOrder.raw_payload as any)?.ecommerce?.numeroPedidoEcommerce}`);
    console.log();

    // Buscar itens do Tiny
    const { data: tinyItems } = await supabaseAdmin
      .from('tiny_order_items')
      .select('*')
      .eq('order_id', tinyOrder.id);

    if (tinyItems && tinyItems.length > 0) {
      console.log(`Itens do Tiny (${tinyItems.length}):`);
      for (const item of tinyItems) {
        console.log(`  • ${item.descricao}`);
        console.log(`    Código: ${item.codigo} | Qtd: ${item.quantidade} | R$ ${item.valor_unitario?.toFixed(2)}`);
      }
      console.log();
    }

    // Verificar se está vinculado
    const { data: link } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('*')
      .eq('tiny_order_id', tinyOrder.id)
      .maybeSingle();

    if (link) {
      console.log('✓ Pedido já vinculado:');
      console.log(`  Marketplace: ${link.marketplace}`);
      console.log(`  Marketplace Order ID: ${link.marketplace_order_id}`);
      console.log(`  Vinculado em: ${link.linked_at}`);
      console.log(`  Vinculado por: ${link.linked_by}`);
    } else {
      console.log('⚠️  Pedido NÃO vinculado ainda');
      console.log('   Execute o auto-linking para vincular automaticamente');
    }

  } else {
    console.log('❌ Não encontrado no Tiny com pack_id:', packId);
  }

  console.log();
  console.log('='.repeat(80));
}

findPackOrders()
  .then(() => {
    console.log('Busca concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
