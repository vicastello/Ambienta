#!/usr/bin/env tsx
/**
 * Script para vincular automaticamente pedidos de TODO O ANO DE 2025 (últimos 365 dias)
 * Uso: npx tsx scripts/auto-link-full-2025.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load env FIRST
const envFiles = [
    '.env.local',
    '.env.production.local',
    '.env.development.local',
];

for (const envFile of envFiles) {
    const envPath = resolve(process.cwd(), envFile);
    if (existsSync(envPath)) {
        config({ path: envPath, override: false });
    }
}

async function main() {
    console.log('='.repeat(80));
    console.log('🔗 VINCULAÇÃO AUTOMÁTICA DE PEDIDOS - ANO 2025 COMPLETO');
    console.log('='.repeat(80));
    console.log();

    console.log('Este script vinculará automaticamente pedidos dos marketplaces');
    console.log('(Magalu, Shopee, Mercado Livre) com pedidos do Tiny.');
    console.log('Baseado no campo ecommerce.numeroPedidoEcommerce recuperado dos CSVs.');
    console.log();
    console.log('Processando últimos 400 dias (cobrindo todo 2025)...');
    console.log('='.repeat(80));
    console.log();

    const startTime = Date.now();

    try {
        // Dynamic import AFTER env is loaded
        const { autoLinkOrders } = await import('../src/services/autoLinkingService');

        // 400 dias garante cobrir desde 01/01/2025 até hoje (Dez/2025)
        const result = await autoLinkOrders(400);

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
            console.log('📝 PRIMEIROS 20 PEDIDOS VINCULADOS:');
            for (const link of result.linked_orders.slice(0, 20)) {
                console.log(
                    `  ✓ ${link.marketplace.padEnd(15)} ${link.marketplace_order_id.padEnd(20)} → Tiny #${link.tiny_numero_pedido}`
                );
            }
            if (result.linked_orders.length > 20) {
                console.log(`  ... e mais ${result.linked_orders.length - 20} pedidos.`);
            }
            console.log();
        }

        if (result.errors.length > 0) {
            console.log('⚠️  ERROS (amostra):');
            for (const error of result.errors.slice(0, 10)) {
                console.log(`  • ${error}`);
            }
            console.log();
        }

        console.log('='.repeat(80));

        process.exit(0);
    } catch (error) {
        console.error();
        console.error('❌ ERRO FATAL:', error);
        console.error();
        process.exit(1);
    }
}

main();
