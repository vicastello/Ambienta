#!/usr/bin/env tsx
/**
 * Script para investigar os códigos dos pedidos do Mercado Livre
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function investigate() {
  const wrongCode = '2000014216247590';
  const correctCode = '2000010464212373';

  console.log('='.repeat(80));
  console.log('INVESTIGANDO CÓDIGOS DOS PEDIDOS DO MERCADO LIVRE');
  console.log('='.repeat(80));
  console.log();

  // 1. Verificar se o código "errado" existe
  console.log(`1️⃣  Verificando código "${wrongCode}"...`);
  console.log();

  const { data: wrongOrder, error: wrongError } = await supabaseAdmin
    .from('meli_orders')
    .select('meli_order_id, date_created, status, total_amount, buyer_nickname, raw_payload')
    .eq('meli_order_id', parseInt(wrongCode))
    .maybeSingle();

  if (wrongOrder) {
    console.log('✓ Código EXISTE no banco de dados:');
    console.log(`  Pedido: ${wrongOrder.meli_order_id}`);
    console.log(`  Data: ${wrongOrder.date_created}`);
    console.log(`  Status: ${wrongOrder.status}`);
    console.log(`  Valor: R$ ${wrongOrder.total_amount?.toFixed(2)}`);
    console.log(`  Comprador: ${wrongOrder.buyer_nickname}`);

    // Verificar o raw_payload
    const raw = wrongOrder.raw_payload as any;
    console.log();
    console.log('  Informações do raw_payload:');
    console.log(`    - id: ${raw?.id}`);
    console.log(`    - order_id: ${raw?.order_id}`);
    console.log(`    - pack_id: ${raw?.pack_id}`);
    console.log();
  } else {
    console.log(`❌ Código "${wrongCode}" NÃO existe no banco de dados`);
    console.log();
  }

  console.log('='.repeat(80));
  console.log();

  // 2. Verificar o código correto
  console.log(`2️⃣  Verificando código "${correctCode}"...`);
  console.log();

  const { data: correctOrder, error: correctError } = await supabaseAdmin
    .from('meli_orders')
    .select('meli_order_id, date_created, status, total_amount, buyer_nickname, raw_payload')
    .eq('meli_order_id', parseInt(correctCode))
    .maybeSingle();

  if (correctOrder) {
    console.log('✓ Código EXISTE no banco de dados:');
    console.log(`  Pedido: ${correctOrder.meli_order_id}`);
    console.log(`  Data: ${correctOrder.date_created}`);
    console.log(`  Status: ${correctOrder.status}`);
    console.log(`  Valor: R$ ${correctOrder.total_amount?.toFixed(2)}`);
    console.log(`  Comprador: ${correctOrder.buyer_nickname}`);

    // Verificar o raw_payload
    const raw = correctOrder.raw_payload as any;
    console.log();
    console.log('  Informações do raw_payload:');
    console.log(`    - id: ${raw?.id}`);
    console.log(`    - order_id: ${raw?.order_id}`);
    console.log(`    - pack_id: ${raw?.pack_id}`);
    console.log();

    // Buscar itens
    const { data: items } = await supabaseAdmin
      .from('meli_order_items')
      .select('sku, title, quantity, unit_price')
      .eq('meli_order_id', parseInt(correctCode));

    if (items && items.length > 0) {
      console.log(`  Itens do pedido (${items.length}):`);
      for (const item of items) {
        console.log(`    • ${item.title}`);
        console.log(`      SKU: ${item.sku} | Qtd: ${item.quantity} | Preço: R$ ${item.unit_price?.toFixed(2)}`);
      }
      console.log();
    }

    // Verificar se está vinculado ao Tiny
    const { data: link } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('*, tiny_order:tiny_orders(numero_pedido, valor, cliente_nome)')
      .eq('marketplace', 'mercado_livre')
      .eq('marketplace_order_id', correctCode)
      .maybeSingle();

    if (link) {
      console.log('  ✓ Vinculado ao Tiny:');
      console.log(`    Pedido Tiny: #${(link.tiny_order as any)?.numero_pedido}`);
      console.log(`    Valor: R$ ${(link.tiny_order as any)?.valor?.toFixed(2)}`);
      console.log(`    Cliente: ${(link.tiny_order as any)?.cliente_nome}`);
    } else {
      console.log('  ⚠️  NÃO está vinculado ao Tiny');
    }
    console.log();

  } else {
    console.log(`❌ Código "${correctCode}" NÃO existe no banco de dados`);
    console.log();
  }

  console.log('='.repeat(80));
  console.log();

  // 3. Verificar se são pedidos relacionados (pack)
  console.log('3️⃣  Verificando se são pedidos relacionados (pack)...');
  console.log();

  if (wrongOrder && correctOrder) {
    const wrongRaw = wrongOrder.raw_payload as any;
    const correctRaw = correctOrder.raw_payload as any;

    console.log('Comparação:');
    console.log(`  ${wrongCode}:`);
    console.log(`    - pack_id: ${wrongRaw?.pack_id || 'N/A'}`);
    console.log(`    - order_id: ${wrongRaw?.order_id || wrongRaw?.id || 'N/A'}`);
    console.log();
    console.log(`  ${correctCode}:`);
    console.log(`    - pack_id: ${correctRaw?.pack_id || 'N/A'}`);
    console.log(`    - order_id: ${correctRaw?.order_id || correctRaw?.id || 'N/A'}`);
    console.log();

    if (wrongRaw?.pack_id && wrongRaw.pack_id === correctRaw?.pack_id) {
      console.log('🔗 SIM! Ambos pedidos fazem parte do MESMO PACK!');
      console.log(`   Pack ID: ${wrongRaw.pack_id}`);
      console.log();
      console.log('ℹ️  Isso significa que são pedidos diferentes do mesmo comprador,');
      console.log('   agrupados em uma única compra no Mercado Livre.');
    } else {
      console.log('❌ NÃO são parte do mesmo pack');
    }
  }

  console.log();
  console.log('='.repeat(80));
}

investigate()
  .then(() => {
    console.log('Investigação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
