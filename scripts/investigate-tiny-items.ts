#!/usr/bin/env tsx
/**
 * Script para investigar por que os itens não aparecem no pedido do Tiny
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function investigate() {
  const tinyOrderId = 217540; // ID interno do pedido Tiny #24351

  console.log('='.repeat(80));
  console.log('INVESTIGAÇÃO - Itens do Pedido Tiny #24351');
  console.log('='.repeat(80));
  console.log();

  // 1. Verificar se o pedido existe
  console.log('1️⃣  Verificando pedido no Tiny...');
  console.log();

  const { data: order, error: orderError } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .eq('id', tinyOrderId)
    .single();

  if (orderError || !order) {
    console.log('❌ Pedido não encontrado!');
    console.log('Erro:', orderError);
    return;
  }

  console.log('✓ Pedido encontrado:');
  console.log(`  ID: ${order.id}`);
  console.log(`  Número: ${order.numero_pedido}`);
  console.log(`  Tiny ID: ${order.tiny_id}`);
  console.log(`  Canal: ${order.canal}`);
  console.log(`  Data: ${order.data_criacao}`);
  console.log(`  Valor: R$ ${order.valor?.toFixed(2)}`);
  console.log();

  // 2. Verificar raw_payload completo
  console.log('2️⃣  Analisando raw_payload...');
  console.log();

  const raw = order.raw_payload as any;

  if (!raw) {
    console.log('❌ raw_payload está vazio!');
    console.log();
  } else {
    console.log('Campos principais do raw_payload:');
    console.log(`  - id: ${raw.id}`);
    console.log(`  - numero: ${raw.numero}`);
    console.log(`  - ecommerce.numeroPedidoEcommerce: ${raw.ecommerce?.numeroPedidoEcommerce}`);
    console.log();

    // Verificar se há itens no raw_payload
    if (raw.itens) {
      console.log(`✓ Campo 'itens' encontrado no raw_payload!`);
      console.log(`  Quantidade de itens: ${Array.isArray(raw.itens) ? raw.itens.length : 'não é array'}`);
      console.log();

      if (Array.isArray(raw.itens) && raw.itens.length > 0) {
        console.log('📦 Itens no raw_payload:');
        console.log();

        for (let i = 0; i < raw.itens.length; i++) {
          const item = raw.itens[i];
          console.log(`  Item ${i + 1}:`);
          console.log(`    - codigo: ${item.codigo || 'N/A'}`);
          console.log(`    - descricao: ${item.descricao || 'N/A'}`);
          console.log(`    - unidade: ${item.unidade || 'N/A'}`);
          console.log(`    - quantidade: ${item.quantidade || 'N/A'}`);
          console.log(`    - valor_unitario: ${item.valor_unitario || 'N/A'}`);
          console.log(`    - id_produto: ${item.id_produto || 'N/A'}`);
          console.log();
        }
      }
    } else {
      console.log('⚠️  Campo "itens" NÃO encontrado no raw_payload');
      console.log();
      console.log('Campos disponíveis no raw_payload:');
      console.log(Object.keys(raw).join(', '));
      console.log();
    }
  }

  // 3. Buscar na tabela tiny_order_items
  console.log('3️⃣  Buscando na tabela tiny_order_items...');
  console.log();

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('tiny_order_items')
    .select('*')
    .eq('order_id', tinyOrderId);

  if (itemsError) {
    console.log('❌ Erro ao buscar itens:', itemsError);
  } else if (!items || items.length === 0) {
    console.log('❌ Nenhum item encontrado na tabela tiny_order_items');
    console.log();

    // Verificar se existem itens para QUALQUER pedido
    const { data: anyItems, error: anyError } = await supabaseAdmin
      .from('tiny_order_items')
      .select('order_id, count')
      .limit(5);

    if (!anyError && anyItems && anyItems.length > 0) {
      console.log('ℹ️  A tabela tiny_order_items TEM dados para outros pedidos:');
      console.log(`   Encontrados itens em ${anyItems.length} pedidos diferentes`);
    } else {
      console.log('⚠️  A tabela tiny_order_items pode estar completamente vazia!');
    }
  } else {
    console.log(`✓ Encontrados ${items.length} itens na tabela`);
    for (const item of items) {
      console.log();
      console.log(`  Item ID ${item.id}:`);
      console.log(`    - Código: ${item.codigo}`);
      console.log(`    - Descrição: ${item.descricao}`);
      console.log(`    - Quantidade: ${item.quantidade}`);
      console.log(`    - Valor: R$ ${item.valor_unitario?.toFixed(2)}`);
    }
  }
  console.log();

  // 4. Verificar estrutura completa do raw_payload
  console.log('4️⃣  Estrutura completa do raw_payload (JSON):');
  console.log();
  console.log(JSON.stringify(raw, null, 2));
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
