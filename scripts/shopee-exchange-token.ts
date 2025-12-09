/**
 * Script para trocar o authorization code da Shopee por access_token
 *
 * Uso:
 * 1. Acesse a URL de autorização da Shopee (você deve gerar via painel de parceiros)
 * 2. Após autorizar, copie o 'code' que aparece na página de callback
 * 3. Execute: npx tsx scripts/shopee-exchange-token.ts
 * 4. Cole o código quando solicitado
 * 5. O script irá trocar o código por um access_token e refresh_token
 * 6. Atualize o .env.local com os tokens retornados
 */

import crypto from 'crypto';
import readline from 'readline';

const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID;
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY;
const SHOPEE_SHOP_ID = process.env.SHOPEE_SHOP_ID;

if (!SHOPEE_PARTNER_ID || !SHOPEE_PARTNER_KEY) {
  console.error('❌ SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY devem estar configurados no .env.local');
  process.exit(1);
}

function generateSign(path: string, timestamp: number, accessToken: string = '', shopId: string = ''): string {
  const partnerId = SHOPEE_PARTNER_ID!;
  const partnerKey = SHOPEE_PARTNER_KEY!;

  let baseString = `${partnerId}${path}${timestamp}`;

  if (accessToken) {
    baseString += accessToken;
  }

  if (shopId) {
    baseString += shopId;
  }

  const sign = crypto
    .createHmac('sha256', partnerKey)
    .update(baseString)
    .digest('hex');

  return sign;
}

async function exchangeCodeForToken(code: string, shopId: string): Promise<void> {
  const path = '/api/v2/auth/token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSign(path, timestamp, '', shopId);

  const url = `https://partner.shopeemobile.com${path}`;

  const params = new URLSearchParams({
    partner_id: SHOPEE_PARTNER_ID!,
    timestamp: timestamp.toString(),
    sign: sign,
  });

  const body = {
    code: code,
    shop_id: parseInt(shopId),
    partner_id: parseInt(SHOPEE_PARTNER_ID!),
  };

  console.log('\n📡 Chamando Shopee API para trocar código por token...');
  console.log(`URL: ${url}?${params.toString()}`);
  console.log('Body:', JSON.stringify(body, null, 2));

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Erro HTTP ${response.status}:`, data);
      return;
    }

    if (data.error) {
      console.error('❌ Erro da API Shopee:', data.error, data.message);
      return;
    }

    console.log('\n✅ Token obtido com sucesso!\n');
    console.log('📋 Atualize o .env.local com os seguintes valores:\n');
    console.log(`SHOPEE_ACCESS_TOKEN=${data.access_token}`);
    console.log(`SHOPEE_REFRESH_TOKEN=${data.refresh_token}`);
    console.log(`\n⏰ Access Token expira em: ${data.expire_in} segundos (${(data.expire_in / 3600).toFixed(1)} horas)`);
    console.log(`🔄 Refresh Token válido por: ~30 dias`);
    console.log(`🏪 Shop ID: ${shopId}`);

  } catch (error: any) {
    console.error('❌ Erro ao trocar código:', error.message);
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  🛍️  SHOPEE - Trocar código OAuth por token      ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  try {
    const code = await askQuestion('Cole o authorization code recebido no callback: ');

    if (!code) {
      console.error('❌ Código não fornecido');
      rl.close();
      return;
    }

    const shopIdInput = await askQuestion(`Shop ID (deixe em branco para usar ${SHOPEE_SHOP_ID}): `);
    const shopId = shopIdInput || SHOPEE_SHOP_ID;

    if (!shopId) {
      console.error('❌ Shop ID não fornecido e SHOPEE_SHOP_ID não está configurado');
      rl.close();
      return;
    }

    rl.close();

    await exchangeCodeForToken(code, shopId);

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    rl.close();
  }
}

main().catch(console.error);
