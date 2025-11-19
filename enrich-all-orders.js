#!/usr/bin/env node

const http = require('http');

const API_URL = 'http://localhost:3000/api/tiny/sync/enrich-frete';

function makeRequest(batch) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      dataInicial: '2025-11-01',
      dataFinal: '2025-11-19',
      maxToProcess: 20,
      forceUpdate: false,
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/tiny/sync/enrich-frete',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function enrichAll() {
  let totalSuccess = 0;
  let totalErrors = 0;
  let batchNum = 0;

  console.log('Iniciando enriquecimento massivo...\n');

  for (let i = 0; i < 150; i++) {
    batchNum++;
    try {
      const result = await makeRequest(i);
      totalSuccess += result.successCount || 0;
      totalErrors += result.errorCount || 0;

      if (batchNum % 10 === 0 || batchNum === 1) {
        console.log(`[Batch ${batchNum}] Successo acumulado: ${totalSuccess} | Erros acumulados: ${totalErrors}`);
      }

      // Esperar 2 segundos entre requisições
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[Batch ${batchNum}] Erro:`, err.message);
    }
  }

  console.log(`\n✓ Enriquecimento completo!`);
  console.log(`Total enriquecidos: ${totalSuccess}`);
  console.log(`Total erros: ${totalErrors}`);
}

enrichAll().catch(console.error);
