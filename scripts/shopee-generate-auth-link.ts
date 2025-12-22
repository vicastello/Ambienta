#!/usr/bin/env tsx
/**
 * Gera o link de autorização OAuth da Shopee.
 * Após autorizar, você será redirecionado para uma URL com o código.
 * Copie o código e use o script shopee-exchange-code.ts para trocar por tokens.
 * 
 * Uso: npx tsx scripts/shopee-generate-auth-link.ts
 */

import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.vercel
const envPath = path.resolve(process.cwd(), '.env.vercel');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const partnerId = process.env.SHOPEE_PARTNER_ID!;
const partnerKey = process.env.SHOPEE_PARTNER_KEY!;

const PATH = '/api/v2/shop/auth_partner';

function generateSign(timestamp: number) {
    const base = `${partnerId}${PATH}${timestamp}`;
    return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

const timestamp = Math.floor(Date.now() / 1000);
const sign = generateSign(timestamp);

// Use uma URL simples que mostrará os parâmetros
const redirectUrl = 'https://httpbin.org/anything';

const authUrl = new URL(`https://partner.shopeemobile.com${PATH}`);
authUrl.searchParams.set('partner_id', partnerId);
authUrl.searchParams.set('timestamp', String(timestamp));
authUrl.searchParams.set('sign', sign);
authUrl.searchParams.set('redirect', redirectUrl);

console.log('═══════════════════════════════════════════════════════════════');
console.log('   🔐 SHOPEE OAUTH - Link de Autorização');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('1. Abra este link no navegador:\n');
console.log(authUrl.toString());
console.log('\n');
console.log('2. Faça login na sua conta Shopee e autorize o app.');
console.log('\n');
console.log('3. Após autorizar, você será redirecionado para httpbin.org.');
console.log('   Procure na resposta JSON os parâmetros:');
console.log('   - code: xxxxxxxxxxxxxxxx');
console.log('   - shop_id: 428171387');
console.log('\n');
console.log('4. Execute o próximo script com o código:');
console.log('   npx tsx scripts/shopee-exchange-code.ts --code=SEU_CODIGO');
console.log('\n═══════════════════════════════════════════════════════════════\n');
