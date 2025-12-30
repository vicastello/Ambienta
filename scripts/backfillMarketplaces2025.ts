#!/usr/bin/env tsx
/**
 * Backfill de pedidos de todos os marketplaces para 2025.
 * 
 * Sincroniza dados de:
 * - Shopee (até 180 dias)
 * - Magalu (até 180 dias)
 * - Mercado Livre (até 180 dias)
 * 
 * Uso:
 *   npx tsx scripts/backfillMarketplaces2025.ts
 *   npx tsx scripts/backfillMarketplaces2025.ts --shopee-only
 *   npx tsx scripts/backfillMarketplaces2025.ts --magalu-only
 *   npx tsx scripts/backfillMarketplaces2025.ts --meli-only
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const LOCAL_API_BASE = process.env.LOCAL_API_BASE || 'http://localhost:3000';
const MAX_PERIOD_DAYS = 180;
const DELAY_BETWEEN_SYNCS_MS = 10_000; // 10s entre marketplaces

interface SyncResult {
    marketplace: string;
    success: boolean;
    duration: number;
    data?: any;
    error?: string;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncMarketplace(
    name: string,
    endpoint: string,
    body: Record<string, unknown>
): Promise<SyncResult> {
    const startTime = Date.now();

    try {
        console.log(`\n📦 [${name}] Iniciando sincronização...`);
        console.log(`   Endpoint: ${LOCAL_API_BASE}${endpoint}`);
        console.log(`   Payload: ${JSON.stringify(body)}`);

        const response = await fetch(`${LOCAL_API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const duration = (Date.now() - startTime) / 1000;

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`❌ [${name}] Erro HTTP ${response.status}: ${errorText.slice(0, 200)}`);
            return {
                marketplace: name,
                success: false,
                duration,
                error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
            };
        }

        const result = await response.json().catch(() => ({}));
        console.log(`✅ [${name}] Sincronização concluída em ${duration.toFixed(2)}s`);

        if (result.data) {
            const data = result.data;
            if (data.ordersInserted != null || data.ordersUpdated != null) {
                console.log(`   📊 Inseridos: ${data.ordersInserted ?? 0} | Atualizados: ${data.ordersUpdated ?? 0}`);
            }
            if (data.itemsInserted != null) {
                console.log(`   📦 Itens inseridos: ${data.itemsInserted}`);
            }
        }

        return {
            marketplace: name,
            success: true,
            duration,
            data: result.data,
        };
    } catch (error: any) {
        const duration = (Date.now() - startTime) / 1000;
        console.error(`❌ [${name}] Erro:`, error.message);

        if (error.code === 'ECONNREFUSED') {
            console.log(`   ⚠️  Servidor Next.js não está rodando. Execute 'npm run dev' primeiro.`);
        }

        return {
            marketplace: name,
            success: false,
            duration,
            error: error.message,
        };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const shopeeOnly = args.includes('--shopee-only');
    const magaluOnly = args.includes('--magalu-only');
    const meliOnly = args.includes('--meli-only');
    const runAll = !shopeeOnly && !magaluOnly && !meliOnly;

    console.log('╔═════════════════════════════════════════════════════════════════╗');
    console.log('║  🛒 BACKFILL DE MARKETPLACES - 2025                             ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝\n');
    console.log(`📅 Período: últimos ${MAX_PERIOD_DAYS} dias`);
    console.log(`🌐 API Base: ${LOCAL_API_BASE}`);
    console.log(`⏰ Início: ${new Date().toLocaleString('pt-BR')}\n`);

    const results: SyncResult[] = [];

    // Shopee
    if (runAll || shopeeOnly) {
        const result = await syncMarketplace('Shopee', '/api/marketplaces/shopee/sync', {
            periodDays: MAX_PERIOD_DAYS,
            fullSync: true,
        });
        results.push(result);

        if ((runAll || !shopeeOnly) && result.success) {
            console.log(`\n⏳ Aguardando ${DELAY_BETWEEN_SYNCS_MS / 1000}s antes do próximo...`);
            await sleep(DELAY_BETWEEN_SYNCS_MS);
        }
    }

    // Magalu
    if (runAll || magaluOnly) {
        const result = await syncMarketplace('Magalu', '/api/marketplaces/magalu/sync', {
            periodDays: MAX_PERIOD_DAYS,
            fullSync: true,
        });
        results.push(result);

        if ((runAll || !magaluOnly) && result.success) {
            console.log(`\n⏳ Aguardando ${DELAY_BETWEEN_SYNCS_MS / 1000}s antes do próximo...`);
            await sleep(DELAY_BETWEEN_SYNCS_MS);
        }
    }

    // Mercado Livre
    if (runAll || meliOnly) {
        const result = await syncMarketplace('Mercado Livre', '/api/marketplaces/mercado-livre/sync', {
            periodDays: MAX_PERIOD_DAYS,
            pageLimit: 100, // Aumentar limite de páginas para backfill
            pageSize: 50,
        });
        results.push(result);
    }

    // Resumo
    console.log('\n╔═════════════════════════════════════════════════════════════════╗');
    console.log('║  📊 RESUMO DO BACKFILL                                          ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝\n');

    let totalDuration = 0;
    for (const r of results) {
        const status = r.success ? '✅' : '❌';
        console.log(`${status} ${r.marketplace}: ${r.duration.toFixed(2)}s`);
        if (r.data) {
            console.log(`   Inseridos: ${r.data.ordersInserted ?? '-'} | Atualizados: ${r.data.ordersUpdated ?? '-'}`);
        }
        if (r.error) {
            console.log(`   Erro: ${r.error}`);
        }
        totalDuration += r.duration;
    }

    console.log(`\n⏱️  Tempo total: ${(totalDuration / 60).toFixed(2)} minutos`);
    console.log(`🏁 Finalizado: ${new Date().toLocaleString('pt-BR')}`);

    // Exit code baseado nos resultados
    const hasErrors = results.some(r => !r.success);
    process.exit(hasErrors ? 1 : 0);
}

main().catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
