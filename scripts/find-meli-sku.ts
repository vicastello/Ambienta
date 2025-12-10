#!/usr/bin/env tsx
/**
 * Script para encontrar o SKU do Mercado Livre para um produto específico
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function findMeliSku() {
  const productName = 'Kit 2 Vasos Suspensos 4,4l C/ Gancho Plástico Diversas Cores';

  console.log('Buscando SKU do Mercado Livre para:', productName);
  console.log('='.repeat(80));
  console.log();

  // Buscar nos itens de pedidos do Mercado Livre
  const { data: items, error } = await supabaseAdmin
    .from('meli_order_items')
    .select('sku, title, quantity, unit_price, raw_payload')
    .ilike('title', '%Kit 2 Vasos Suspenso%')
    .limit(20);

  if (error) {
    console.error('Erro ao buscar:', error);
    return;
  }

  if (!items || items.length === 0) {
    console.log('❌ Nenhum item encontrado com esse nome');
    console.log();
    console.log('Tentando busca mais ampla por "Vaso Suspenso"...');
    console.log();

    const { data: broadItems, error: broadError } = await supabaseAdmin
      .from('meli_order_items')
      .select('sku, title, quantity, unit_price')
      .ilike('title', '%Vaso%Suspenso%')
      .limit(30);

    if (broadError || !broadItems?.length) {
      console.log('❌ Nenhum item encontrado nem com busca ampla');
      return;
    }

    console.log(`Encontrados ${broadItems.length} itens com "Vaso Suspenso":\n`);

    // Agrupar por SKU e contar
    const skuMap = new Map<string, { name: string; count: number; unit_price: number }>();

    for (const item of broadItems) {
      const key = item.sku;
      if (!skuMap.has(key)) {
        skuMap.set(key, {
          name: item.title,
          count: 0,
          unit_price: item.unit_price || 0,
        });
      }
      const entry = skuMap.get(key)!;
      entry.count += item.quantity || 1;
    }

    // Ordenar por quantidade vendida
    const sorted = Array.from(skuMap.entries())
      .sort((a, b) => b[1].count - a[1].count);

    console.log('SKUs encontrados (ordenados por quantidade vendida):\n');
    for (const [sku, data] of sorted) {
      console.log(`SKU: ${sku}`);
      console.log(`  Nome: ${data.name}`);
      console.log(`  Vendidos: ${data.count}`);
      console.log(`  Preço: R$ ${data.unit_price.toFixed(2)}`);
      console.log();
    }

    return;
  }

  console.log(`✓ Encontrados ${items.length} itens\n`);

  // Agrupar por SKU
  const skuMap = new Map<string, { name: string; count: number; unit_price: number; raw?: any }>();

  for (const item of items) {
    const key = item.sku;
    if (!skuMap.has(key)) {
      skuMap.set(key, {
        name: item.title,
        count: 0,
        unit_price: item.unit_price || 0,
        raw: item.raw_payload,
      });
    }
    const entry = skuMap.get(key)!;
    entry.count += item.quantity || 1;
  }

  // Ordenar por quantidade
  const sorted = Array.from(skuMap.entries())
    .sort((a, b) => b[1].count - a[1].count);

  console.log('SKUs do Mercado Livre:\n');
  for (const [sku, data] of sorted) {
    console.log('─'.repeat(80));
    console.log(`SKU: ${sku}`);
    console.log(`Nome: ${data.name}`);
    console.log(`Quantidade vendida: ${data.count}`);
    console.log(`Preço: R$ ${data.unit_price.toFixed(2)}`);

    if (data.raw) {
      console.log('\nInformações do raw_payload:');
      console.log(`  - Item ID: ${data.raw.item?.id || 'N/A'}`);
      console.log(`  - Variation ID: ${data.raw.item?.variation_id || 'N/A'}`);
      console.log(`  - Seller SKU: ${data.raw.item?.seller_sku || 'N/A'}`);
      console.log(`  - Seller Custom Field: ${data.raw.item?.seller_custom_field || 'N/A'}`);
    }
    console.log();
  }

  // Buscar também no Tiny para comparar
  console.log('='.repeat(80));
  console.log('Buscando produto similar no Tiny...\n');

  const { data: tinyProducts, error: tinyError } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny, codigo, nome, tipo, preco, saldo')
    .or(`nome.ilike.%Kit 2 Vasos%,nome.ilike.%Vaso Suspenso 4,4%`)
    .limit(10);

  if (tinyError || !tinyProducts?.length) {
    console.log('❌ Nenhum produto similar encontrado no Tiny');
  } else {
    console.log(`✓ Encontrados ${tinyProducts.length} produtos no Tiny:\n`);
    for (const prod of tinyProducts) {
      console.log(`ID: ${prod.id_produto_tiny} | Código: ${prod.codigo}`);
      console.log(`Nome: ${prod.nome}`);
      console.log(`Tipo: ${prod.tipo} | Preço: R$ ${(prod.preco || 0).toFixed(2)} | Estoque: ${prod.saldo || 0}`);
      console.log();
    }
  }
}

findMeliSku()
  .then(() => {
    console.log('Busca concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
