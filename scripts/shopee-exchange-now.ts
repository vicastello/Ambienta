import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import crypto from 'crypto';

const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID;
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY;
const SHOPEE_SHOP_ID = process.env.SHOPEE_SHOP_ID;
const AUTH_CODE = '4466524569527062676671487348766f';

console.log('Partner ID:', SHOPEE_PARTNER_ID);
console.log('Shop ID:', SHOPEE_SHOP_ID);
console.log('Key length:', SHOPEE_PARTNER_KEY?.length);

if (!SHOPEE_PARTNER_ID || !SHOPEE_PARTNER_KEY || !SHOPEE_SHOP_ID) {
  console.error('Missing config');
  process.exit(1);
}

const path = '/api/v2/auth/token/get';
const timestamp = Math.floor(Date.now() / 1000);

const baseString = SHOPEE_PARTNER_ID + path + timestamp + SHOPEE_SHOP_ID;
const sign = crypto.createHmac('sha256', SHOPEE_PARTNER_KEY).update(baseString).digest('hex');

const url = 'https://partner.shopeemobile.com' + path + '?' + new URLSearchParams({
  partner_id: SHOPEE_PARTNER_ID,
  timestamp: timestamp.toString(),
  sign: sign,
}).toString();

const body = {
  code: AUTH_CODE,
  shop_id: parseInt(SHOPEE_SHOP_ID),
  partner_id: parseInt(SHOPEE_PARTNER_ID),
};

console.log('\nChamando API Shopee...');
console.log('URL:', url);

async function main() {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    console.log('\nResposta:', JSON.stringify(data, null, 2));
    
    if (data.access_token) {
      console.log('\n✅ Sucesso! Atualize o .env.local:');
      console.log('SHOPEE_ACCESS_TOKEN=' + data.access_token);
      console.log('SHOPEE_REFRESH_TOKEN=' + data.refresh_token);
    } else if (data.error) {
      console.error('\n❌ Erro:', data.error, data.message);
    }
  } catch (err) {
    console.error('Erro:', err);
  }
}

main();
