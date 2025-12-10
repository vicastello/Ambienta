#!/usr/bin/env tsx
/**
 * Script para comparar um pedido do Mercado Livre com o pedido vinculado no Tiny
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function compareOrder() {
  const meliOrderId = '2000014216247590';

  console.log('='.repeat(80));
  console.log(`COMPARAÇÃO DE PEDIDO - Mercado Livre ${meliOrderId}`);
  console.log('='.repeat(80));
  console.log();

  // 1. Buscar pedido do Mercado Livre
  console.log('1️⃣  Buscando pedido no Mercado Livre...');
  console.log();

  const { data: meliOrder, error: meliError } = await supabaseAdmin
    .from('meli_orders')
    .select('*')
    .eq('meli_order_id', parseInt(meliOrderId))
    .single();

  if (meliError || !meliOrder) {
    console.log('❌ Pedido não encontrado no Mercado Livre');
    console.log('Erro:', meliError);
    return;
  }

  console.log('✓ Pedido encontrado no Mercado Livre:');
  console.log(`  ID: ${meliOrder.meli_order_id}`);
  console.log(`  Data: ${meliOrder.date_created}`);
  console.log(`  Status: ${meliOrder.status}`);
  console.log(`  Total: R$ ${meliOrder.total_amount?.toFixed(2) || 'N/A'}`);
  console.log(`  Comprador: ${meliOrder.buyer_nickname || 'N/A'}`);
  console.log();

  // 2. Buscar itens do pedido do Mercado Livre
  console.log('2️⃣  Buscando itens do pedido no Mercado Livre...');
  console.log();

  const { data: meliItems, error: meliItemsError } = await supabaseAdmin
    .from('meli_order_items')
    .select('*')
    .eq('meli_order_id', parseInt(meliOrderId))
    .order('id', { ascending: true });

  if (meliItemsError || !meliItems || meliItems.length === 0) {
    console.log('❌ Nenhum item encontrado para este pedido');
    return;
  }

  console.log(`✓ Encontrados ${meliItems.length} itens:\n`);

  for (const item of meliItems) {
    console.log('─'.repeat(80));
    console.log(`Item: ${item.title}`);
    console.log(`  SKU: ${item.sku}`);
    console.log(`  Quantidade: ${item.quantity}`);
    console.log(`  Preço unitário: R$ ${item.unit_price?.toFixed(2) || 'N/A'}`);
    console.log(`  Subtotal: R$ ${(item.unit_price * item.quantity || 0).toFixed(2)}`);

    if (item.raw_payload) {
      const raw = item.raw_payload as any;
      console.log(`  Item ID: ${raw.item?.id || 'N/A'}`);
      console.log(`  Variation ID: ${raw.item?.variation_id || 'N/A'}`);
      console.log(`  Seller SKU: ${raw.item?.seller_sku || 'N/A'}`);
    }
    console.log();
  }

  // 3. Buscar vinculação com Tiny
  console.log('='.repeat(80));
  console.log('3️⃣  Buscando vinculação com Tiny...');
  console.log();

  const { data: link, error: linkError } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('*')
    .eq('marketplace', 'mercado_livre')
    .eq('marketplace_order_id', meliOrderId)
    .single();

  if (linkError || !link) {
    console.log('❌ Este pedido NÃO está vinculado a nenhum pedido do Tiny');
    console.log('Erro:', linkError?.message || 'Não encontrado');
    console.log();
    console.log('💡 Você pode vincular manualmente ou executar a vinculação automática.');
    return;
  }

  console.log('✓ Pedido vinculado ao Tiny:');
  console.log(`  Tiny Order ID: ${link.tiny_order_id}`);
  console.log(`  Vinculado em: ${link.linked_at}`);
  console.log(`  Vinculado por: ${link.linked_by || 'N/A'}`);
  console.log(`  Confiança: ${((link.confidence_score || 0) * 100).toFixed(0)}%`);
  console.log(`  Notas: ${link.notes || 'N/A'}`);
  console.log();

  // 4. Buscar pedido do Tiny
  console.log('4️⃣  Buscando pedido no Tiny...');
  console.log();

  const { data: tinyOrder, error: tinyError } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .eq('id', link.tiny_order_id)
    .single();

  if (tinyError || !tinyOrder) {
    console.log('❌ Pedido do Tiny não encontrado');
    console.log('Erro:', tinyError);
    return;
  }

  console.log('✓ Pedido encontrado no Tiny:');
  console.log(`  Número Pedido: ${tinyOrder.numero_pedido}`);
  console.log(`  Data Criação: ${tinyOrder.data_criacao}`);
  console.log(`  Data Prevista: ${tinyOrder.data_prevista || 'N/A'}`);
  console.log(`  Cliente: ${tinyOrder.nome_cliente || 'N/A'}`);
  console.log(`  Valor Total: R$ ${tinyOrder.valor_total?.toFixed(2) || 'N/A'}`);
  console.log(`  Canal: ${tinyOrder.canal || 'N/A'}`);
  console.log(`  Situação: ${tinyOrder.situacao || 'N/A'}`);
  console.log();

  // 5. Buscar itens do pedido do Tiny
  console.log('5️⃣  Buscando itens do pedido no Tiny...');
  console.log();

  const { data: tinyItems, error: tinyItemsError } = await supabaseAdmin
    .from('tiny_order_items')
    .select('*')
    .eq('order_id', link.tiny_order_id)
    .order('id', { ascending: true });

  if (tinyItemsError || !tinyItems || tinyItems.length === 0) {
    console.log('⚠️  Nenhum item encontrado para este pedido do Tiny');
    console.log();
  } else {
    console.log(`✓ Encontrados ${tinyItems.length} itens no Tiny:\n`);

    for (const item of tinyItems) {
      console.log('─'.repeat(80));
      console.log(`Produto: ${item.descricao || 'N/A'}`);
      console.log(`  Código: ${item.codigo || 'N/A'}`);
      console.log(`  ID Produto Tiny: ${item.id_produto_tiny || 'N/A'}`);
      console.log(`  Quantidade: ${item.quantidade || 0}`);
      console.log(`  Valor Unitário: R$ ${item.valor_unitario?.toFixed(2) || 'N/A'}`);
      console.log(`  Subtotal: R$ ${((item.valor_unitario || 0) * (item.quantidade || 0)).toFixed(2)}`);
      console.log();
    }
  }

  // 6. Comparação
  console.log('='.repeat(80));
  console.log('6️⃣  COMPARAÇÃO');
  console.log('='.repeat(80));
  console.log();

  console.log('📊 Resumo Comparativo:');
  console.log();
  console.log('MERCADO LIVRE:');
  console.log(`  • Pedido: ${meliOrderId}`);
  console.log(`  • Itens: ${meliItems.length}`);
  console.log(`  • Total: R$ ${meliOrder.total_amount?.toFixed(2) || 'N/A'}`);
  console.log(`  • Data: ${meliOrder.date_created}`);
  console.log();
  console.log('TINY:');
  console.log(`  • Pedido: #${tinyOrder.numero_pedido}`);
  console.log(`  • Itens: ${tinyItems?.length || 0}`);
  console.log(`  • Total: R$ ${tinyOrder.valor_total?.toFixed(2) || 'N/A'}`);
  console.log(`  • Data: ${tinyOrder.data_criacao}`);
  console.log();

  // Comparar SKUs
  console.log('🔍 Análise de SKUs:');
  console.log();

  const meliSkus = meliItems.map(item => item.sku).sort();
  const tinySkus = (tinyItems || []).map(item => item.codigo).filter(Boolean).sort();

  console.log(`SKUs no Mercado Livre: ${meliSkus.join(', ')}`);
  console.log(`SKUs no Tiny: ${tinySkus.length > 0 ? tinySkus.join(', ') : 'Nenhum código encontrado'}`);
  console.log();

  // Verificar se os SKUs batem
  const skusMatch = JSON.stringify(meliSkus) === JSON.stringify(tinySkus);
  if (skusMatch) {
    console.log('✅ SKUs batem perfeitamente!');
  } else {
    console.log('⚠️  SKUs NÃO batem - podem ter nomes/códigos diferentes');
    console.log();
    console.log('Possíveis razões:');
    console.log('  • Tiny usa produtos simples (kits) ao invés de componentes');
    console.log('  • Códigos diferentes entre marketplace e Tiny');
    console.log('  • Produtos não cadastrados ou mapeados incorretamente');
  }

  console.log();
  console.log('='.repeat(80));
}

compareOrder()
  .then(() => {
    console.log('Comparação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
