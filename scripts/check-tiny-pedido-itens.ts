#!/usr/bin/env tsx
/**
 * Script para verificar se os itens existem na tabela correta tiny_pedido_itens
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkItems() {
  const orderId = 217540; // Tiny order ID for #24351

  console.log('='.repeat(80));
  console.log('VERIFICANDO TABELA tiny_pedido_itens');
  console.log('='.repeat(80));
  console.log();

  console.log(`Buscando itens para pedido_id: ${orderId}`);
  console.log();

  const { data: items, error } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*')
    .eq('id_pedido', orderId);

  if (error) {
    console.log('❌ Erro ao buscar itens:', error);
    console.log();
  } else {
    console.log(`✓ Encontrados ${items?.length || 0} itens`);
    console.log();

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log('─'.repeat(80));
        console.log(`Item ${i + 1}:`);
        console.log(JSON.stringify(item, null, 2));
        console.log();
      }
    }
  }

  // Check table structure with a sample
  console.log('─'.repeat(80));
  console.log('Verificando estrutura da tabela...');
  console.log();

  const { data: sample, error: sampleError } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*')
    .limit(1);

  if (sampleError) {
    console.log('❌ Erro ao buscar amostra:', sampleError);
  } else if (sample && sample.length > 0) {
    console.log('Colunas da tabela tiny_pedido_itens:');
    console.log(Object.keys(sample[0]).join(', '));
    console.log();
    console.log('Exemplo de registro:');
    console.log(JSON.stringify(sample[0], null, 2));
  } else {
    console.log('⚠️  Tabela vazia');
  }

  console.log();
  console.log('='.repeat(80));
}

checkItems()
  .then(() => {
    console.log('Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
