#!/usr/bin/env node

/**
 * Script para enriquecer fretes dos últimos 30 dias
 * Chama diretamente a função de enriquecimento via API route
 */

const https = require('https');

// Tenta usar a URL de produção do Vercel
const VERCEL_URL = process.env.VERCEL_URL || 'gestor-tiny-git-main-vitorcastellos-projects.vercel.app';
const API_URL = `https://${VERCEL_URL}/api/admin/enrich-frete`;

console.log('🚀 Iniciando enriquecimento de fretes...');
console.log(`📡 URL: ${API_URL}\n`);

const req = https.request(
  API_URL,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  },
  (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log(`\n📊 Status: ${res.statusCode}`);
      
      try {
        const result = JSON.parse(data);
        console.log('\n✅ Resultado:');
        console.log(JSON.stringify(result, null, 2));
        
        if (result.enriched > 0) {
          console.log(`\n🎉 Sucesso! ${result.enriched} pedidos enriquecidos com frete.`);
        } else if (result.enriched === 0) {
          console.log('\n✓ Nenhum pedido precisava de enriquecimento.');
        }
        
        if (result.failed > 0) {
          console.log(`\n⚠️  ${result.failed} pedidos falharam no enriquecimento.`);
        }
      } catch (err) {
        console.log('\n❌ Resposta:', data);
      }
    });
  }
);

req.on('error', (err) => {
  console.error('\n❌ Erro na requisição:', err.message);
  console.log('\n💡 Dica: Verifique se o app está deployado no Vercel.');
  process.exit(1);
});

req.end();
