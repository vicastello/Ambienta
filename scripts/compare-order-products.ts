#!/usr/bin/env tsx
/**
 * Script para comparar produtos de um pedido no Mercado Livre e Tiny
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function compareProducts() {
  const packId = '2000014212910676';

  console.log('='.repeat(80));
  console.log(`COMPARAÇÃO DE PRODUTOS - Pack/Pedido ${packId}`);
  console.log('='.repeat(80));
  console.log();

  // 1. Buscar no Mercado Livre (por pack_id ou order_id)
  console.log('1️⃣  MERCADO LIVRE');
  console.log('='.repeat(80));
  console.log();

  // Buscar todos os pedidos para filtrar manualmente por pack_id
  const { data: allMeliOrders } = await supabaseAdmin
    .from('meli_orders')
    .select('meli_order_id, date_created, status, total_amount, buyer_nickname, raw_payload')
    .limit(1000);

  // Filtrar por pack_id ou order_id direto
  const meliOrders = allMeliOrders?.filter(order => {
    const raw = order.raw_payload as any;
    return raw?.pack_id?.toString() === packId || order.meli_order_id.toString() === packId;
  }) || [];

  if (meliOrders.length === 0) {
    console.log('❌ Pedido não encontrado no Mercado Livre');
    console.log();
  } else {
    for (const order of meliOrders) {
      console.log(`Pedido: ${order.meli_order_id}`);
      console.log(`Data: ${order.date_created}`);
      console.log(`Status: ${order.status}`);
      console.log(`Valor: R$ ${order.total_amount?.toFixed(2)}`);
      console.log(`Comprador: ${order.buyer_nickname}`);

      const raw = order.raw_payload as any;
      if (raw?.pack_id) {
        console.log(`Pack ID: ${raw.pack_id}`);
      }
      console.log();

      // Buscar itens do pedido
      const { data: items } = await supabaseAdmin
        .from('meli_order_items')
        .select('*')
        .eq('meli_order_id', order.meli_order_id);

      if (items && items.length > 0) {
        console.log(`📦 Produtos (${items.length} itens):`);
        console.log();

        for (const item of items) {
          console.log('  ' + '─'.repeat(76));
          console.log(`  Produto: ${item.title}`);
          console.log(`  SKU: ${item.sku || 'N/A'}`);
          console.log(`  Item ID: ${item.item_id}`);
          console.log(`  Variation ID: ${item.variation_id || 'N/A'}`);
          console.log(`  Quantidade: ${item.quantity}`);
          console.log(`  Preço unitário: R$ ${item.unit_price?.toFixed(2)}`);
          console.log(`  Subtotal: R$ ${((item.unit_price || 0) * item.quantity).toFixed(2)}`);
          console.log();
        }
      }
    }
  }

  // 2. Buscar no Tiny
  console.log('='.repeat(80));
  console.log('2️⃣  TINY');
  console.log('='.repeat(80));
  console.log();

  const { data: tinyOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .eq('canal', 'Mercado Livre')
    .order('data_criacao', { ascending: false })
    .limit(200);

  // Procurar pelo pack_id no raw_payload
  const tinyOrder = tinyOrders?.find(order => {
    const raw = order.raw_payload as any;
    return raw?.ecommerce?.numeroPedidoEcommerce === packId;
  });

  if (!tinyOrder) {
    console.log('❌ Pedido não encontrado no Tiny');
    console.log();
  } else {
    console.log(`Pedido Tiny: #${tinyOrder.numero_pedido}`);
    console.log(`ID interno: ${tinyOrder.id}`);
    console.log(`Data: ${tinyOrder.data_criacao}`);
    console.log(`Cliente: ${tinyOrder.cliente_nome || 'N/A'}`);
    console.log(`Valor: R$ ${tinyOrder.valor?.toFixed(2) || 'N/A'}`);
    console.log(`Situação: ${tinyOrder.situacao || 'N/A'}`);
    console.log();

    // Buscar itens do pedido no Tiny
    const { data: tinyItems } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('*')
      .eq('id_pedido', tinyOrder.id)
      .order('id', { ascending: true });

    if (!tinyItems || tinyItems.length === 0) {
      console.log('⚠️  Nenhum item encontrado no Tiny');
      console.log();
    } else {
      console.log(`📦 Produtos (${tinyItems.length} itens):`);
      console.log();

      for (const item of tinyItems) {
        console.log('  ' + '─'.repeat(76));
        console.log(`  Produto: ${item.nome_produto || 'N/A'}`);
        console.log(`  Código: ${item.codigo_produto || 'N/A'}`);
        console.log(`  ID Produto Tiny: ${item.id_produto_tiny || 'N/A'}`);
        console.log(`  Quantidade: ${item.quantidade || 0}`);
        console.log(`  Valor unitário: R$ ${item.valor_unitario?.toFixed(2) || 'N/A'}`);
        console.log(`  Subtotal: R$ ${item.valor_total?.toFixed(2) || 'N/A'}`);
        console.log();

        // Buscar informações do produto no catálogo do Tiny
        if (item.id_produto_tiny) {
          const { data: produto } = await supabaseAdmin
            .from('tiny_produtos')
            .select('nome, tipo, codigo, saldo, preco')
            .eq('id_produto_tiny', item.id_produto_tiny)
            .single();

          if (produto) {
            console.log(`  📋 Informações do catálogo:`);
            console.log(`     Tipo: ${produto.tipo || 'N/A'}`);
            console.log(`     Estoque: ${produto.saldo || 0}`);
            console.log(`     Preço catálogo: R$ ${produto.preco?.toFixed(2) || 'N/A'}`);
            console.log();
          }
        }
      }
    }
  }

  // 3. Comparação
  console.log('='.repeat(80));
  console.log('3️⃣  COMPARAÇÃO');
  console.log('='.repeat(80));
  console.log();

  if (meliOrders.length === 0 || !tinyOrder) {
    console.log('⚠️  Não é possível comparar - pedido não encontrado em uma das plataformas');
    return;
  }

  // Buscar itens de ambas as plataformas
  const meliOrderIds = meliOrders.map(o => o.meli_order_id);
  const { data: allMeliItems } = await supabaseAdmin
    .from('meli_order_items')
    .select('sku, title, quantity, unit_price')
    .in('meli_order_id', meliOrderIds);

  const { data: allTinyItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('codigo_produto, nome_produto, quantidade, valor_unitario')
    .eq('id_pedido', tinyOrder.id);

  const meliItems = allMeliItems || [];
  const tinyItems = allTinyItems || [];

  console.log('📊 Resumo:');
  console.log();
  console.log(`Mercado Livre: ${meliItems.length} itens`);
  console.log(`Tiny: ${tinyItems.length} itens`);
  console.log();

  if (meliItems.length !== tinyItems.length) {
    console.log('⚠️  ATENÇÃO: Quantidade de itens diferente entre as plataformas!');
    console.log();
  }

  console.log('SKUs/Códigos:');
  console.log();
  console.log('Mercado Livre:');
  const meliSkuCounts = new Map<string, number>();
  meliItems.forEach(item => {
    const sku = item.sku || 'SEM SKU';
    meliSkuCounts.set(sku, (meliSkuCounts.get(sku) || 0) + item.quantity);
  });
  for (const [sku, qty] of Array.from(meliSkuCounts.entries()).sort()) {
    console.log(`  • ${sku}: ${qty} unidades`);
  }

  console.log();
  console.log('Tiny:');
  const tinySkuCounts = new Map<string, number>();
  tinyItems.forEach(item => {
    const codigo = item.codigo_produto || 'SEM CÓDIGO';
    tinySkuCounts.set(codigo, (tinySkuCounts.get(codigo) || 0) + (item.quantidade || 0));
  });
  for (const [codigo, qty] of Array.from(tinySkuCounts.entries()).sort()) {
    console.log(`  • ${codigo}: ${qty} unidades`);
  }

  console.log();
  console.log('='.repeat(80));
}

compareProducts()
  .then(() => {
    console.log('Comparação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
