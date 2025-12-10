#!/usr/bin/env tsx
/**
 * Script para vincular automaticamente pedidos dos últimos 90 dias
 * Uso: npx tsx scripts/auto-link-orders-90d.ts
 */

import { autoLinkOrders } from '../src/services/autoLinkingService';

async function main() {
  console.log('='.repeat(80));
  console.log('VINCULAÇÃO AUTOMÁTICA DE PEDIDOS - ÚLTIMOS 90 DIAS');
  console.log('='.repeat(80));
  console.log();

  console.log('Este script vinculará automaticamente pedidos dos marketplaces');
  console.log('(Magalu, Shopee, Mercado Livre) com pedidos do Tiny.');
  console.log();
  console.log('A vinculação é baseada nos IDs que o Tiny armazena no campo');
  console.log('ecommerce.numeroPedidoEcommerce de cada pedido.');
  console.log();
  console.log('Processando últimos 90 dias...');
  console.log('='.repeat(80));
  console.log();

  const startTime = Date.now();

  try {
    const result = await autoLinkOrders(90);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log();
    console.log('='.repeat(80));
    console.log('RESULTADO FINAL');
    console.log('='.repeat(80));
    console.log();
    console.log(`✓ Tempo de execução: ${duration}s`);
    console.log();
    console.log(`📊 ESTATÍSTICAS:`);
    console.log(`  • Total processado:    ${result.total_processed}`);
    console.log(`  • Novos vínculos:      ${result.total_linked} ✓`);
    console.log(`  • Já vinculados:       ${result.total_already_linked}`);
    console.log(`  • Não encontrados:     ${result.total_not_found}`);
    console.log(`  • Erros:               ${result.errors.length}`);
    console.log();

    if (result.total_linked > 0) {
      console.log('📝 PEDIDOS VINCULADOS:');
      for (const link of result.linked_orders) {
        console.log(
          `  ✓ ${link.marketplace.padEnd(15)} ${link.marketplace_order_id.padEnd(20)} → Tiny #${link.tiny_numero_pedido}`
        );
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

    if (result.errors.length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error();
    console.error('❌ ERRO FATAL:', error);
    console.error();
    process.exit(1);
  }
}

main();
