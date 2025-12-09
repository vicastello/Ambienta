/**
 * Script para gerar a URL de autorização OAuth da Shopee
 *
 * Uso:
 * npx tsx scripts/shopee-generate-auth-url.ts
 *
 * O script irá gerar a URL completa que você deve abrir no navegador
 * para autorizar a aplicação e receber o código OAuth
 */

import crypto from 'crypto';

const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID;
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY;
const REDIRECT_URI = 'https://gestao.ambientautilidades.com.br/api/shopee/oauth/callback';

if (!SHOPEE_PARTNER_ID || !SHOPEE_PARTNER_KEY) {
  console.error('❌ SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY devem estar configurados no .env.local');
  process.exit(1);
}

function generateSign(path: string, timestamp: number): string {
  const partnerId = SHOPEE_PARTNER_ID!;
  const partnerKey = SHOPEE_PARTNER_KEY!;

  const baseString = `${partnerId}${path}${timestamp}`;

  const sign = crypto
    .createHmac('sha256', partnerKey)
    .update(baseString)
    .digest('hex');

  return sign;
}

function generateAuthUrl(): string {
  const path = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSign(path, timestamp);

  const params = new URLSearchParams({
    partner_id: SHOPEE_PARTNER_ID!,
    timestamp: timestamp.toString(),
    sign: sign,
    redirect: REDIRECT_URI,
  });

  return `https://partner.shopeemobile.com${path}?${params.toString()}`;
}

function main() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  🛍️  SHOPEE - Gerar URL de autorização OAuth     ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  console.log('📋 Configuração:');
  console.log(`   Partner ID: ${SHOPEE_PARTNER_ID}`);
  console.log(`   Redirect URI: ${REDIRECT_URI}`);
  console.log('\n🔗 URL de autorização:\n');

  const authUrl = generateAuthUrl();
  console.log(authUrl);

  console.log('\n📝 Próximos passos:');
  console.log('   1. Abra a URL acima no navegador');
  console.log('   2. Faça login na sua conta Shopee de vendedor');
  console.log('   3. Autorize a aplicação');
  console.log('   4. Você será redirecionado para a página de callback');
  console.log('   5. Copie o código que aparece na página');
  console.log('   6. Execute: npx tsx scripts/shopee-exchange-token.ts');
  console.log('   7. Cole o código quando solicitado\n');
}

main();
