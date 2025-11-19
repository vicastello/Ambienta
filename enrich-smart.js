#!/usr/bin/env node

/**
 * DEPRECATED: Este script foi descontinuado
 * 
 * O enriquecimento agora é feito via:
 * - POST /api/tiny/pedidos (sincroniza todos os pedidos com frete)
 * - Automático a cada 30 minutos via cron
 * 
 * Para sincronizar manualmente: bash sync-full.sh
 */

console.log('⚠️  Script descontinuado!');
console.log('');
console.log('O enriquecimento de frete agora é feito automaticamente via:');
console.log('  - POST /api/tiny/pedidos (sincroniza todos os pedidos com frete)');
console.log('  - Cron: a cada 30 minutos');
console.log('');
console.log('Para sincronizar manualmente, use:');
console.log('  bash sync-full.sh');
process.exit(0);

// === CÓDIGO ANTIGO (DESABILITADO) ===

/**
 * Script inteligente de enriquecimento
 * - Verifica quantos pedidos NÃO têm valorFrete
 * - Enriquece gradualmente com delays longos (10-20s entre requests)
 * - Evita rate limiting completamente
 */

const fetch = require('node-fetch');
const readline = require('readline');

const API_BASE = 'http://localhost:3000';
const DELAY_MS = 15000; // 15 segundos entre requests
const MAX_BATCH = 50; // Max de pedidos para enriquecer por rodada

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function checkUnenrichedCount() {
  try {
    console.log('📊 Verificando quantos pedidos precisam enriquecimento...');
    const response = await fetch(
      `${API_BASE}/api/tiny/pedidos?limit=1000&fields=raw->>valorFrete`
    );
    const data = await response.json();

    const unenriched = (data.pedidos || []).filter((p) => !p.raw?.valorFrete);
    console.log(
      `  ✓ Total: ${data.pedidos?.length || 0}`
    );
    console.log(`  📍 Sem frete: ${unenriched.length}`);
    console.log(`  ✓ Com frete: ${(data.pedidos?.length || 0) - unenriched.length}`);

    return unenriched.length;
  } catch (err) {
    console.error('❌ Erro ao verificar:', err.message);
    return 0;
  }
}

async function enrichBatch(maxToProcess = MAX_BATCH) {
  try {
    console.log(
      `\n⏳ Enriquecendo até ${maxToProcess} pedidos (delay: ${DELAY_MS}ms entre)...`
    );

    const response = await fetch(
      `${API_BASE}/api/tiny/sync/enrich-slow`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      return 0;
    }

    const result = await response.json();

    if (result.enriched) {
      console.log(`  ✅ Enriquecido: ${result.tinyId} (frete: R$ ${result.valorFrete})`);
      return 1;
    } else if (result.message === 'Nenhum pedido para enriquecer') {
      console.log('  ✓ Todos os pedidos já estão enriquecidos!');
      return 0;
    } else {
      console.log(`  ⚠️ ${result.error || result.message}`);
      return 0;
    }
  } catch (err) {
    console.error(`  ❌ Erro: ${err.message}`);
    return 0;
  }
}

async function runContinuous() {
  console.log('🚀 MODO CONTÍNUO: Enriquecendo pedidos...');
  console.log('   (Pressione Ctrl+C para parar)\n');

  let totalEnriched = 0;
  let cycleNum = 1;

  while (true) {
    console.log(`[${new Date().toLocaleTimeString()}] Ciclo ${cycleNum}:`);

    const enriched = await enrichBatch();
    totalEnriched += enriched;

    if (enriched === 0) {
      console.log('✅ Nenhum pedido enriquecido - todos já estão prontos!');
      break;
    }

    console.log(
      `   Total até agora: ${totalEnriched} | Próximo em ${DELAY_MS / 1000}s...`
    );
    cycleNum++;

    // Wait before next batch
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(
    `\n✨ CONCLUÍDO! Total enriquecido: ${totalEnriched} pedidos`
  );
  rl.close();
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('📦 ENRIQUECEDOR DE FRETES - Tiny API');
  console.log('═══════════════════════════════════════════════════\n');

  const unenriched = await checkUnenrichedCount();

  if (unenriched === 0) {
    console.log('\n✅ Todos os pedidos já têm frete! Nada a fazer.');
    rl.close();
    process.exit(0);
  }

  console.log(
    `\n⚠️  ${unenriched} pedidos precisam enriquecimento`
  );
  console.log(
    `    Tempo estimado: ~${Math.ceil(unenriched * DELAY_MS / 1000 / 60)} minutos\n`
  );

  const answer = await prompt('Iniciar enriquecimento contínuo? (s/n): ');

  if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'y') {
    await runContinuous();
  } else {
    console.log('Cancelado.');
    rl.close();
  }
}

main().catch(console.error);
