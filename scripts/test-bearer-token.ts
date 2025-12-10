/**
 * Testa autenticação Bearer com API Key do Magalu
 */

const MAGALU_BASE_URL = 'https://api.integracommerce.com.br/api';
const apiKey = process.env.MAGALU_API_KEY || '9832b5ef-3e6d-425f-9ae6-623522818d8f';

console.log('🔑 Testando Bearer Token com API Key...\n');
console.log('API Key:', apiKey.substring(0, 15) + '...\n');

async function testBearerAuth() {
  console.log('📡 Fazendo requisição com Bearer token...');

  try {
    const url = `${MAGALU_BASE_URL}/Order?page=1&perPage=5`;

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    console.log('Headers:', JSON.stringify(headers, null, 2));

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    console.log(`\nStatus: ${res.status} ${res.statusText}`);
    console.log('Content-Type:', res.headers.get('content-type'));

    const text = await res.text();

    if (res.ok) {
      console.log('\n✅ ✅ ✅ SUCESSO! ✅ ✅ ✅\n');
      try {
        const json = JSON.parse(text);
        console.log('Resposta JSON:');
        console.log(JSON.stringify(json, null, 2).substring(0, 1000));

        if (json.Orders) {
          console.log(`\n📦 Total de pedidos retornados: ${json.Orders.length}`);
        }
      } catch {
        console.log('Resposta (texto):', text.substring(0, 500));
      }
    } else {
      console.log('\n❌ FALHA');
      console.log('Resposta:', text.substring(0, 500));
    }
  } catch (error) {
    console.log('❌ ERRO:', error instanceof Error ? error.message : String(error));
  }
}

testBearerAuth().catch(console.error);
