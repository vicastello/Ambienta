/**
 * Testa diferentes combinações de credenciais Magalu
 */

const MAGALU_BASE_URL = 'https://api.integracommerce.com.br/api';

const apiKey = '9832b5ef-3e6d-425f-9ae6-623522818d8f';
const apiKeyId = 'c4158267-a09f-49a5-8126-b37cdf6fe7ed';
const apiKeySecret = 'bff318b3-00eb-4e17-90a7-ec30991d7603';

console.log('🔑 Testando combinações de credenciais Magalu...\n');

async function testAuth(name: string, username: string, password: string) {
  console.log(`\n📡 Testando: ${name}`);
  console.log(`Username: ${username}`);
  console.log(`Password: ${password.substring(0, 10)}...`);

  const credentials = Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const url = `${MAGALU_BASE_URL}/Order?page=1&perPage=5`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json',
      },
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    const text = await res.text();

    if (res.ok) {
      console.log('✅ SUCESSO!');
      try {
        const json = JSON.parse(text);
        console.log('Resposta:', JSON.stringify(json, null, 2).substring(0, 500));
        return true;
      } catch {
        console.log('Resposta (texto):', text.substring(0, 300));
        return true;
      }
    } else {
      console.log('❌ FALHA');
      console.log('Erro:', text.substring(0, 200));
      return false;
    }
  } catch (error) {
    console.log('❌ ERRO:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function main() {
  // Combinação 1: API Key ID como username, API Secret como password
  if (await testAuth('API Key ID:Secret', apiKeyId, apiKeySecret)) return;

  // Combinação 2: API Key como username, API Secret como password
  if (await testAuth('API Key:Secret', apiKey, apiKeySecret)) return;

  // Combinação 3: API Key ID como username, API Key como password
  if (await testAuth('API Key ID:Key', apiKeyId, apiKey)) return;

  // Combinação 4: API Key como username e password
  if (await testAuth('API Key:Key', apiKey, apiKey)) return;

  // Combinação 5: API Secret como username, API Key como password
  if (await testAuth('Secret:Key', apiKeySecret, apiKey)) return;

  // Combinação 6: API Secret como username, API Key ID como password
  if (await testAuth('Secret:KeyID', apiKeySecret, apiKeyId)) return;

  console.log('\n\n❌ Nenhuma combinação funcionou.');
  console.log('\n💡 Possíveis próximos passos:');
  console.log('1. Verificar no painel Magalu/IntegraMcommerce se há username/password separados');
  console.log('2. Verificar se há um endpoint de token que precisa ser chamado primeiro');
  console.log('3. Confirmar se as credenciais estão ativas e para o ambiente correto (prod/sandbox)');
}

main().catch(console.error);
