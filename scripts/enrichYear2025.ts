#!/usr/bin/env tsx
/**
 * Enriquecimento de dados do ano de 2025 mês a mês.
 * 
 * Este script:
 * - Itera de janeiro a dezembro de 2025
 * - Chama /api/admin/enrich-frete para cada mês
 * - Respeita rate limits com delays entre meses
 * 
 * Uso:
 *   npx tsx scripts/enrichYear2025.ts
 *   npx tsx scripts/enrichYear2025.ts --start-month=6  # Começar de junho
 *   npx tsx scripts/enrichYear2025.ts --end-month=11   # Até novembro
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const LOCAL_API_BASE = process.env.LOCAL_API_BASE || 'http://localhost:3000';
const DELAY_BETWEEN_MONTHS_MS = 2 * 60 * 1000; // 2 minutos entre meses

interface MonthResult {
    month: string;
    success: boolean;
    duration: number;
    data?: any;
    error?: string;
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    return { start, end };
}

function getMonthName(month: number): string {
    const names = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return names[month] || `Mês ${month}`;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrichMonth(year: number, month: number): Promise<MonthResult> {
    const { start, end } = getMonthRange(year, month);
    const monthName = `${getMonthName(month)}/${year}`;
    const startTime = Date.now();

    try {
        console.log(`\n📅 [${monthName}] Enriquecendo dados (${start} a ${end})...`);

        const response = await fetch(`${LOCAL_API_BASE}/api/admin/enrich-frete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'range',
                dataInicial: start,
                dataFinal: end,
                limit: 80,
                batchSize: 8,
                itensDelayMs: 800,
            }),
        });

        const duration = (Date.now() - startTime) / 1000;

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`❌ [${monthName}] Erro HTTP ${response.status}: ${errorText.slice(0, 200)}`);
            return {
                month: monthName,
                success: false,
                duration,
                error: `HTTP ${response.status}`,
            };
        }

        const result = await response.json().catch(() => ({}));
        console.log(`✅ [${monthName}] Concluído em ${duration.toFixed(2)}s`);

        if (result.data) {
            const data = result.data;
            if (data.itens) console.log(`   📦 Itens: ${data.itens.sincronizados ?? 0} sincronizados`);
            if (data.frete) console.log(`   🚚 Frete: ${data.frete.updated ?? 0} atualizados`);
            if (data.canais) console.log(`   📺 Canais: ${data.canais.updated ?? 0} normalizados`);
            if (data.cidadeUf) console.log(`   🌎 Cidade/UF: ${data.cidadeUf.updated ?? 0} preenchidos`);
        }

        return {
            month: monthName,
            success: true,
            duration,
            data: result.data,
        };
    } catch (error: any) {
        const duration = (Date.now() - startTime) / 1000;
        console.error(`❌ [${monthName}] Erro:`, error.message);

        if (error.code === 'ECONNREFUSED') {
            console.log(`   ⚠️  Servidor Next.js não está rodando. Execute 'npm run dev' primeiro.`);
        }

        return {
            month: monthName,
            success: false,
            duration,
            error: error.message,
        };
    }
}

function parseArg(name: string): number | undefined {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    if (!arg) return undefined;
    const val = parseInt(arg.split('=')[1]);
    return isNaN(val) ? undefined : val;
}

async function main() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    const startMonth = parseArg('start-month') ?? 1;
    const endMonth = parseArg('end-month') ?? (currentYear === 2025 ? currentMonth : 12);
    const year = 2025;

    console.log('╔═════════════════════════════════════════════════════════════════╗');
    console.log('║  📈 ENRIQUECIMENTO DE DADOS - 2025                              ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝\n');
    console.log(`📅 Período: ${getMonthName(startMonth)} a ${getMonthName(endMonth)} de ${year}`);
    console.log(`🌐 API Base: ${LOCAL_API_BASE}`);
    console.log(`⏰ Início: ${now.toLocaleString('pt-BR')}`);
    console.log(`⏳ Delay entre meses: ${DELAY_BETWEEN_MONTHS_MS / 60000} minutos\n`);

    const results: MonthResult[] = [];

    for (let month = startMonth; month <= endMonth; month++) {
        const result = await enrichMonth(year, month);
        results.push(result);

        // Delay entre meses (exceto no último)
        if (month < endMonth && result.success) {
            console.log(`\n⏳ Aguardando ${DELAY_BETWEEN_MONTHS_MS / 60000} minutos antes do próximo mês...`);
            await sleep(DELAY_BETWEEN_MONTHS_MS);
        }
    }

    // Resumo
    console.log('\n╔═════════════════════════════════════════════════════════════════╗');
    console.log('║  📊 RESUMO DO ENRIQUECIMENTO                                    ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝\n');

    let totalDuration = 0;
    let successCount = 0;
    let totalItens = 0;
    let totalFrete = 0;
    let totalCanais = 0;

    for (const r of results) {
        const status = r.success ? '✅' : '❌';
        console.log(`${status} ${r.month}: ${r.duration.toFixed(2)}s`);
        totalDuration += r.duration;
        if (r.success) {
            successCount++;
            if (r.data) {
                totalItens += r.data.itens?.sincronizados ?? 0;
                totalFrete += r.data.frete?.updated ?? 0;
                totalCanais += r.data.canais?.updated ?? 0;
            }
        }
        if (r.error) {
            console.log(`   Erro: ${r.error}`);
        }
    }

    console.log(`\n📊 Totais:`);
    console.log(`   📦 Itens sincronizados: ${totalItens}`);
    console.log(`   🚚 Fretes atualizados: ${totalFrete}`);
    console.log(`   📺 Canais normalizados: ${totalCanais}`);
    console.log(`\n⏱️  Tempo total: ${(totalDuration / 60).toFixed(2)} minutos`);
    console.log(`✅ Meses processados: ${successCount}/${results.length}`);
    console.log(`🏁 Finalizado: ${new Date().toLocaleString('pt-BR')}`);

    // Exit code
    const hasErrors = results.some(r => !r.success);
    process.exit(hasErrors ? 1 : 0);
}

main().catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
