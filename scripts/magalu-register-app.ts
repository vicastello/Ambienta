/**
 * Script para registrar aplicação OAuth no Magalu via API
 * Cria ou atualiza o redirect_uri da aplicação
 */

const MAGALU_API_KEY_ID = process.env.MAGALU_API_KEY_ID || 'c4158267-a09f-49a5-8126-b37cdf6fe7ed';
const MAGALU_API_KEY_SECRET = process.env.MAGALU_API_KEY_SECRET || 'bff318b3-00eb-4e17-90a7-ec30991d7603';
const MAGALU_CLIENT_ID = process.env.MAGALU_CLIENT_ID || 'c4158267-a09f-49a5-8126-b37cdf6fe7ed';

async function registerMagaluApp() {
  console.log('\n🔧 Registrando aplicação OAuth no Magalu...\n');

  // URLs de callback (localhost para dev e produção)
  const redirectUris = [
    'http://localhost:3000/api/magalu/oauth/callback',
    'https://gestao.ambientautilidades.com.br/api/magalu/oauth/callback',
  ];

  const appData = {
    name: 'Gestor Tiny - Ambienta Utilidades',
    description: 'Sistema de gestão integrado com múltiplos marketplaces',
    redirect_uris: redirectUris,
  };

  console.log('📋 Dados da aplicação:');
  console.log(JSON.stringify(appData, null, 2));
  console.log('\n🔑 Usando credenciais:');
  console.log(`API Key ID: ${MAGALU_API_KEY_ID}`);
  console.log(`API Key Secret: ${MAGALU_API_KEY_SECRET?.substring(0, 10)}...`);
  console.log(`Client ID: ${MAGALU_CLIENT_ID}\n`);

  // Tentar com diferentes endpoints e métodos de autenticação
  const endpoints = [
    'https://api.integracommerce.com.br/api/oauth/clients',
    'https://id.magalu.com/api/clients',
    'https://api.magalu.com/oauth/clients',
  ];

  const authMethods = [
    {
      name: 'Basic Auth (API Key ID:Secret)',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${MAGALU_API_KEY_ID}:${MAGALU_API_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    },
    {
      name: 'Bearer Token (API Key ID)',
      headers: {
        'Authorization': `Bearer ${MAGALU_API_KEY_ID}`,
        'Content-Type': 'application/json',
      },
    },
    {
      name: 'X-Api-Key (API Key ID)',
      headers: {
        'X-Api-Key': MAGALU_API_KEY_ID,
        'Content-Type': 'application/json',
      },
    },
  ];

  for (const endpoint of endpoints) {
    for (const authMethod of authMethods) {
      console.log(`\n🔄 Tentando: ${endpoint}`);
      console.log(`   Método: ${authMethod.name}`);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: authMethod.headers,
          body: JSON.stringify(appData),
        });

        const responseText = await response.text();

        if (response.ok) {
          console.log('\n✅ SUCESSO! Aplicação registrada:');
          try {
            const data = JSON.parse(responseText);
            console.log(JSON.stringify(data, null, 2));
            console.log('\n📝 Atualize seu .env.local com:');
            if (data.client_id) {
              console.log(`MAGALU_CLIENT_ID=${data.client_id}`);
            }
            if (data.client_secret) {
              console.log(`MAGALU_CLIENT_SECRET=${data.client_secret}`);
            }
            return;
          } catch {
            console.log(responseText);
            return;
          }
        }

        console.log(`   ❌ Status ${response.status}: ${responseText.substring(0, 200)}`);

      } catch (error) {
        console.log(`   ❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }
  }

  console.log('\n\n❌ Não foi possível registrar a aplicação com nenhum método.');
  console.log('\n💡 Alternativas:');
  console.log('1. Use a CLI oficial do Magalu:');
  console.log('   npm install -g @magalu/mgc');
  console.log('   mgc auth login');
  console.log('   mgc auth clients create --name "Gestor Tiny" --redirect-uri "https://gestao.ambientautilidades.com.br/api/magalu/oauth/callback"');
  console.log('\n2. Entre em contato com o suporte do Magalu para configurar o redirect_uri manualmente');
  console.log('\n3. Verifique a documentação atualizada em: https://developers.magalu.com/');
}

registerMagaluApp().catch(console.error);
