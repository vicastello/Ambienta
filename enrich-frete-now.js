#!/usr/bin/env node

/**
 * Script para enriquecer fretes dos últimos 30 dias
 * Executa em loop até não haver mais pedidos para enriquecer
 */

const http = require('http');

const API_URL = 'http://localhost:3000/api/admin/enrich-frete';
let totalEnriched = 0;
let totalFailed = 0;
let round = 0;

console.log('🚀 Iniciando enriquecimento em lote de fretes...\n');

async function enrichBatch() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error('Failed to parse response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runEnrichment() {
  try {
    round++;
    console.log(`📦 Rodada ${round}...`);
    
    const result = await enrichBatch();
    
    totalEnriched += result.enriched || 0;
    totalFailed += result.failed || 0;
    
    console.log(`   ✅ Enriquecidos: ${result.enriched || 0}`);
    console.log(`   ❌ Falhados: ${result.failed || 0}`);
    console.log(`   📊 Total acumulado: ${totalEnriched} enriquecidos, ${totalFailed} falhados\n`);
    
    // Continue if there were orders processed
    if (result.total > 0 && result.enriched > 0) {
      // Wait 3 seconds between batches
      await new Promise(resolve => setTimeout(resolve, 3000));
      await runEnrichment();
    } else if (result.total === 0) {
      console.log('🎉 Concluído! Não há mais pedidos para enriquecer.');
      console.log(`\n📊 Resumo final:`);
      console.log(`   Total enriquecido: ${totalEnriched}`);
      console.log(`   Total falhado: ${totalFailed}`);
      console.log(`   Rodadas: ${round}`);
    } else {
      console.log('⚠️  Última rodada não teve sucesso. Finalizando...');
      console.log(`\n📊 Resumo final:`);
      console.log(`   Total enriquecido: ${totalEnriched}`);
      console.log(`   Total falhado: ${totalFailed}`);
      console.log(`   Rodadas: ${round}`);
    }
  } catch (err) {
    console.error('\n❌ Erro:', err.message);
    console.log('\n📊 Parcial até o erro:');
    console.log(`   Total enriquecido: ${totalEnriched}`);
    console.log(`   Total falhado: ${totalFailed}`);
    console.log(`   Rodadas: ${round}`);
    process.exit(1);
  }
}

runEnrichment();
