#!/usr/bin/env tsx
/**
 * Atualiza o access_token da Shopee usando o refresh_token v2.
 * Uso:
 *   NODE_OPTIONS='-r dotenv/config' DOTENV_CONFIG_PATH=.env.local npx tsx scripts/shopee-refresh-token.ts
 */

import crypto from 'node:crypto';
import { config } from 'dotenv';

config({ path: '.env.local' });

const partnerId = process.env.SHOPEE_PARTNER_ID;
const partnerKey = process.env.SHOPEE_PARTNER_KEY;
const shopId = process.env.SHOPEE_SHOP_ID;
const refreshToken = process.env.SHOPEE_REFRESH_TOKEN;

if (!partnerId || !partnerKey || !shopId || !refreshToken) {
  console.error('❌ Faltam variáveis: SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_SHOP_ID, SHOPEE_REFRESH_TOKEN');
  process.exit(1);
}

const PATH = '/api/v2/auth/access_token/get';

function generateSign(timestamp: number) {
  const base = `${partnerId}${PATH}${timestamp}`;
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

async function main() {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSign(timestamp);

  const url = new URL(`https://partner.shopeemobile.com${PATH}`);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);

  const body = {
    shop_id: Number(shopId),
    partner_id: Number(partnerId),
    refresh_token: refreshToken,
  };

  console.log('📡 Refreshing Shopee token...');
  console.log('URL:', url.toString());

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}:`, data);
    process.exit(1);
  }

  if (data.error && data.error !== '0') {
    console.error('❌ Erro Shopee:', data.error, data.message ?? data.error_msg);
    process.exit(1);
  }

  console.log('\n✅ Token renovado com sucesso!\n');
  console.log(`SHOPEE_ACCESS_TOKEN=${data.access_token}`);
  console.log(`SHOPEE_REFRESH_TOKEN=${data.refresh_token ?? refreshToken}`);
  console.log(`expire_in: ${data.expire_in} segundos (~${(data.expire_in / 3600).toFixed(1)}h)`);
  console.log(`refresh_token_expire_in: ${data.refresh_token_expire_in ?? 'N/A'}`);
}

main().catch((err) => {
  console.error('❌ Erro inesperado:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
