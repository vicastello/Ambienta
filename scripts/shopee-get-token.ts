/**
 * Script one-shot para obter o primeiro access_token/refresh_token da Shopee v2.
 * Use somente para bootstrap; depois grave os tokens em uma tabela (ex.: shopee_tokens no Supabase).
 *
 * Executar: npx ts-node scripts/shopee-get-token.ts  (ou ts-node -r dotenv/config ...)
 */
import dotenv from 'dotenv';
import crypto from 'node:crypto';

const path = '/api/v2/auth/token/get';

// Tenta carregar .env.local primeiro; se não existir, carrega .env
dotenv.config({ path: '.env.local' });
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

async function main() {
  const partnerId = requireEnv('SHOPEE_PARTNER_ID');
  const partnerKey = requireEnv('SHOPEE_PARTNER_KEY');
  const shopId = requireEnv('SHOPEE_SHOP_ID');
  const authCode = requireEnv('SHOPEE_AUTH_CODE');

  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${partnerId}${path}${timestamp}`;
  const sign = crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');

  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);

  const payload = {
    code: authCode,
    shop_id: Number(shopId),
    partner_id: Number(partnerId),
  };

  console.log('[Shopee] Enviando requisição para obter token...');
  console.log('URL:', url.toString());

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('Falha na requisição', res.status, res.statusText, data);
    process.exit(1);
  }

  if (data.error && data.error !== '0') {
    console.error('Erro Shopee:', data.error, data.message ?? data.error_msg);
    process.exit(1);
  }

  console.log('--- Resposta Shopee ---');
  console.log(JSON.stringify(data, null, 2));
  console.log('-----------------------');

  console.log('access_token:', data.access_token ?? 'N/A');
  console.log('refresh_token:', data.refresh_token ?? 'N/A');
  console.log('expire_in (s):', data.expire_in ?? 'N/A');
  console.log('refresh_token_expire_in (s):', data.refresh_token_expire_in ?? 'N/A');
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
