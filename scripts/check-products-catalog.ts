#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkProducts() {
  const productIds = [891947153, 891942801, 891944462, 891943180, 891944416, 891944989];

  const { data } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny, codigo, nome')
    .in('id_produto_tiny', productIds);

  console.log('Produtos no catálogo:');
  data?.forEach(p => {
    console.log(`  ID: ${p.id_produto_tiny} | Código: ${p.codigo || 'NULL'} | Nome: ${p.nome}`);
  });

  const foundIds = new Set(data?.map(p => p.id_produto_tiny) || []);
  const missing = productIds.filter(id => foundIds.has(id) === false);

  if (missing.length) {
    console.log();
    console.log('Produtos NÃO encontrados no catálogo:', missing);
  }

  // Verificar quantos produtos únicos faltam SKU
  const { data: itemsWithoutSku } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_produto_tiny')
    .is('codigo_produto', null)
    .not('id_produto_tiny', 'is', null);

  const uniqueProductsWithoutSku = new Set(itemsWithoutSku?.map(i => i.id_produto_tiny));
  console.log();
  console.log(`Total de produtos únicos sem SKU: ${uniqueProductsWithoutSku.size}`);
}

checkProducts();
