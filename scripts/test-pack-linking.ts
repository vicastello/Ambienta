#!/usr/bin/env tsx
/**
 * Script para testar a vinculação de pedidos com pack_id
 */

import { autoLinkMarketplace } from '../src/services/autoLinkingService';

async function testPackLinking() {
  console.log('='.repeat(80));
  console.log('TESTE DE VINCULAÇÃO COM PACK_ID');
  console.log('='.repeat(80));
  console.log();

  console.log('Testando vinculação automática do Mercado Livre...');
  console.log('Este teste deve encontrar e vincular pedidos que usam pack_id');
  console.log();

  const startTime = Date.now();

  const result = await autoLinkMarketplace('mercado_livre', 7);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log();
  console.log('='.repeat(80));
  console.log('RESULTADO DO TESTE');
  console.log('='.repeat(80));
  console.log();
  console.log(`⏱️  Tempo: ${duration}s`);
  console.log();
  console.log('📊 Estatísticas:');
  console.log(`  • Processados: ${result.total_processed}`);
  console.log(`  • Vinculados: ${result.total_linked}`);
  console.log(`  • Já existentes: ${result.total_already_linked}`);
  console.log(`  • Não encontrados: ${result.total_not_found}`);
  console.log(`  • Erros: ${result.errors.length}`);
  console.log();

  if (result.total_linked > 0) {
    console.log('✅ PEDIDOS VINCULADOS:');
    for (const link of result.linked_orders) {
      console.log(`  • Mercado Livre ${link.marketplace_order_id} → Tiny #${link.tiny_numero_pedido}`);
    }
    console.log();
  }

  if (result.errors.length > 0) {
    console.log('⚠️  ERROS:');
    for (const error of result.errors) {
      console.log(`  • ${error}`);
    }
    console.log();
  }

  console.log('='.repeat(80));

  if (result.total_linked > 0) {
    console.log('✅ Teste bem-sucedido! Pedidos com pack_id foram vinculados.');
  } else if (result.total_already_linked > 0) {
    console.log('ℹ️  Todos os pedidos já estavam vinculados.');
  } else {
    console.log('⚠️  Nenhum pedido novo foi vinculado.');
  }
}

testPackLinking()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
  });
