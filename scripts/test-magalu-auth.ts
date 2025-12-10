/**
 * Script para testar autenticação da API Magalu (IntegraMcommerce)
 * Testa diferentes formatos de autenticação
 */

const MAGALU_BASE_URL = 'https://api.integracommerce.com.br/api';

const apiKeyId = process.env.MAGALU_API_KEY_ID || 'da5cdc95-d672-4589-8e6f-f9bc021cf687';
const apiKeySecret = process.env.MAGALU_API_KEY_SECRET || '5c875a55-d727-402e-b243-e975a6e5fdd5';
const apiKey = process.env.MAGALU_API_KEY || 'b47ab809-9bae-4b91-8747-f28bc48973bf';

console.log('🔑 Testando autenticação Magalu...\n');
console.log('API Key ID:', apiKeyId);
console.log('API Key Secret:', apiKeySecret.substring(0, 10) + '...');
console.log('API Key:', apiKey.substring(0, 10) + '...\n');

async function testAuth(name: string, headers: Record<string, string>) {
  console.log(`\n📡 Testando: ${name}`);
  console.log('Headers:', JSON.stringify(headers, null, 2));

  try {
    const url = `${MAGALU_BASE_URL}/Order?page=1&perPage=5`;
    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    console.log(`Status: ${res.status} ${res.statusText}`);

    const contentType = res.headers.get('content-type');
    console.log('Content-Type:', contentType);

    const text = await res.text();
    console.log('Response (primeiros 500 caracteres):', text.substring(0, 500));

    if (res.ok) {
      console.log('✅ SUCESSO!');
      try {
        const json = JSON.parse(text);
        console.log('JSON válido:', JSON.stringify(json, null, 2).substring(0, 300));
      } catch {
        console.log('⚠️ Resposta não é JSON válido');
      }
    } else {
      console.log('❌ FALHA');
    }
  } catch (error) {
    console.log('❌ ERRO:', error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  // Teste 1: Basic Auth (apiKeyId:apiKeySecret)
  const basicAuth = Buffer.from(`${apiKeyId}:${apiKeySecret}`).toString('base64');
  await testAuth('Basic Auth (ID:Secret)', {
    'Authorization': `Basic ${basicAuth}`,
    'Accept': 'application/json',
  });

  // Teste 2: Bearer com API Key
  await testAuth('Bearer com API Key', {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
  });

  // Teste 3: X-Api-Key headers
  await testAuth('X-Api-Key headers', {
    'X-Api-Key': apiKeyId,
    'X-Api-Secret': apiKeySecret,
    'Accept': 'application/json',
  });

  // Teste 4: Token header
  await testAuth('Token header', {
    'Token': apiKey,
    'Accept': 'application/json',
  });

  // Teste 5: Apenas API Key no header
  await testAuth('API-Key header', {
    'api-key': apiKey,
    'Accept': 'application/json',
  });

  console.log('\n\n✅ Testes concluídos!');
}

main().catch(console.error);
