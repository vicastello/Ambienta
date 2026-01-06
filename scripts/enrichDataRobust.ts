#!/usr/bin/env tsx
/**
 * Script robusto de enriquecimento de dados que chama funções diretamente.
 * 
 * Vantagens:
 * - Sem timeout de HTTP (não depende de API routes)
 * - Retry automático em caso de falha
 * - Progresso detalhado
 * - Rate limit respeitado
 * 
 * Uso:
 *   npx tsx scripts/enrichDataRobust.ts
 *   npx tsx scripts/enrichDataRobust.ts --start-date=2025-01-01 --end-date=2025-03-31
 *   npx tsx scripts/enrichDataRobust.ts --recent-days=30
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load env FIRST before any other imports
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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const BATCH_DELAY_MS = 2000;

function parseArg(name: string): string | undefined {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    if (!arg) return undefined;
    return arg.split('=')[1];
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = MAX_RETRIES
): Promise<T | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const isLastAttempt = attempt === maxRetries - 1;
            console.error(`   ⚠️ [${label}] Tentativa ${attempt + 1}/${maxRetries} falhou: ${error.message}`);

            if (isLastAttempt) {
                console.error(`   ❌ [${label}] Falha após ${maxRetries} tentativas`);
                return null;
            }

            // Se for rate limit (429), aguardar mais tempo
            if (error.status === 429 || error.message?.includes('429')) {
                console.log(`   ⏳ Rate limit detectado. Aguardando 60s...`);
                await sleep(60000);
            } else {
                console.log(`   ⏳ Aguardando ${RETRY_DELAY_MS / 1000}s antes de tentar novamente...`);
                await sleep(RETRY_DELAY_MS);
            }
        }
    }
    return null;
}

interface EnrichResult {
    itens: { sincronizados: number; erros: number };
    frete: { updated: number; errors: number };
    canais: { updated: number };
    cidadeUf: { updated: number };
}

async function main() {
    console.log('╔═════════════════════════════════════════════════════════════════╗');
    console.log('║  📈 ENRIQUECIMENTO ROBUSTO DE DADOS                             ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝\n');

    // Dynamic imports AFTER env is loaded
    const { supabaseAdmin } = await import('../lib/supabaseAdmin');
    const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');
    const { sincronizarItensAutomaticamente } = await import('../lib/pedidoItensHelper');
    const { runFreteEnrichment } = await import('../lib/freteEnricher');
    const { normalizeMissingOrderChannels } = await import('../lib/channelNormalizer');
    const { enrichCidadeUfMissing } = await import('../lib/cidadeUfEnricher');

    const recentDays = parseArg('recent-days');
    let startDate = parseArg('start-date');
    let endDate = parseArg('end-date');

    if (recentDays) {
        const days = parseInt(recentDays);
        const now = new Date();
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        startDate = start.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    }

    if (!startDate || !endDate) {
        // Default: últimos 30 dias
        const now = new Date();
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate = start.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    }

    console.log(`📅 Período: ${startDate} a ${endDate}`);
    console.log(`⏰ Início: ${new Date().toLocaleString('pt-BR')}`);
    console.log(`🔄 Retries: até ${MAX_RETRIES} tentativas por operação\n`);

    // Obter token
    console.log('🔑 Obtendo token Tiny...');
    const accessToken = await withRetry(async () => {
        return await getAccessTokenFromDbOrRefresh();
    }, 'Token');

    if (!accessToken) {
        console.error('❌ Não foi possível obter token. Abortando.');
        process.exit(1);
    }
    console.log('   ✅ Token obtido\n');

    const result: EnrichResult = {
        itens: { sincronizados: 0, erros: 0 },
        frete: { updated: 0, errors: 0 },
        canais: { updated: 0 },
        cidadeUf: { updated: 0 },
    };

    const startTime = Date.now();
    const dataMinima = new Date(startDate);

    // 1. Sincronizar itens
    console.log('━'.repeat(60));
    console.log('📦 ETAPA 1: Sincronizando itens de pedidos...');
    console.log('━'.repeat(60));

    const itensResult = await withRetry(async () => {
        return await sincronizarItensAutomaticamente(accessToken, {
            limit: 50,
            maxRequests: 100,
            dataMinima,
        });
    }, 'Itens');

    if (itensResult) {
        result.itens.sincronizados = itensResult.totalItens ?? 0;
        result.itens.erros = itensResult.erros ?? 0;
        console.log(`\n   ✅ ${result.itens.sincronizados} itens de ${itensResult.sucesso} pedidos`);
    }

    await sleep(BATCH_DELAY_MS);

    // 2. Enriquecer frete
    console.log('\n' + '━'.repeat(60));
    console.log('🚚 ETAPA 2: Enriquecendo valor de frete...');
    console.log('━'.repeat(60));

    const freteResult = await withRetry(async () => {
        return await runFreteEnrichment(accessToken, {
            maxRequests: 100,
            batchSize: 5,
            batchDelayMs: 2000,
            dataMinima,
            newestFirst: false,
        });
    }, 'Frete');

    if (freteResult) {
        result.frete.updated = freteResult.updated ?? 0;
        result.frete.errors = freteResult.errors ?? 0;
        console.log(`\n   ✅ ${result.frete.updated} pedidos com frete atualizado`);
    }

    await sleep(BATCH_DELAY_MS);

    // 3. Normalizar canais
    console.log('\n' + '━'.repeat(60));
    console.log('📺 ETAPA 3: Normalizando canais de venda...');
    console.log('━'.repeat(60));

    const canalResult = await withRetry(async () => {
        return await normalizeMissingOrderChannels({ limit: 500 });
    }, 'Canais');

    if (canalResult) {
        result.canais.updated = canalResult.updated ?? 0;
        console.log(`\n   ✅ ${result.canais.updated} canais normalizados`);
    }

    await sleep(BATCH_DELAY_MS);

    // 4. Preencher cidade/UF
    console.log('\n' + '━'.repeat(60));
    console.log('🌎 ETAPA 4: Preenchendo cidade/UF ausentes...');
    console.log('━'.repeat(60));

    const locResult = await withRetry(async () => {
        return await enrichCidadeUfMissing();
    }, 'Cidade/UF');

    if (locResult) {
        result.cidadeUf.updated = locResult.updated ?? 0;
        console.log(`\n   ✅ ${result.cidadeUf.updated} pedidos com cidade/UF preenchidos`);
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    // Log no banco
    await supabaseAdmin.from('sync_logs').insert({
        job_id: null,
        level: 'info',
        message: 'Enriquecimento robusto concluído',
        meta: {
            startDate,
            endDate,
            result,
            durationMinutes: duration,
        },
    });

    // Resumo
    console.log('\n╔═════════════════════════════════════════════════════════════════╗');
    console.log('║  📊 RESUMO DO ENRIQUECIMENTO                                    ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝\n');

    console.log(`📦 Itens sincronizados: ${result.itens.sincronizados}`);
    console.log(`🚚 Fretes atualizados: ${result.frete.updated}`);
    console.log(`📺 Canais normalizados: ${result.canais.updated}`);
    console.log(`🌎 Cidade/UF preenchidos: ${result.cidadeUf.updated}`);
    console.log(`\n⏱️  Tempo total: ${duration} minutos`);
    console.log(`🏁 Finalizado: ${new Date().toLocaleString('pt-BR')}`);
}

main().catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
