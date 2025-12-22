#!/usr/bin/env tsx
/**
 * Troca o código de autorização por access_token e refresh_token.
 * Salva os tokens no banco de dados.
 * 
 * Uso: npx tsx scripts/shopee-exchange-code.ts --code=SEU_CODIGO --shop_id=428171387
 */

import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env.vercel for Supabase credentials
const envVercelPath = path.resolve(process.cwd(), '.env.vercel');
if (fs.existsSync(envVercelPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envVercelPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

// Load .env.local for Shopee credentials (overrides .env.vercel)
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const partnerId = process.env.SHOPEE_PARTNER_ID!;
const partnerKey = process.env.SHOPEE_PARTNER_KEY!;

const PATH = '/api/v2/auth/token/get';

function generateSign(timestamp: number) {
    const base = `${partnerId}${PATH}${timestamp}`;
    return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

// Parse command line arguments
const args = process.argv.slice(2);
const codeArg = args.find(a => a.startsWith('--code='));
const shopIdArg = args.find(a => a.startsWith('--shop_id='));

const code = codeArg?.split('=')[1];
const shopId = shopIdArg?.split('=')[1] || '428171387';

if (!code) {
    console.error('❌ Uso: npx tsx scripts/shopee-exchange-code.ts --code=SEU_CODIGO [--shop_id=428171387]');
    process.exit(1);
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   🔐 SHOPEE OAUTH - Trocando código por tokens');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`   Code: ${code?.substring(0, 20)}...`);
    console.log(`   Shop ID: ${shopId}`);

    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSign(timestamp);

    const url = new URL(`https://partner.shopeemobile.com${PATH}`);
    url.searchParams.set('partner_id', partnerId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);

    const body = {
        code,
        shop_id: Number(shopId),
        partner_id: Number(partnerId),
    };

    console.log('\n📡 Enviando request...');

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || (data.error && data.error !== '0' && data.error !== 0)) {
        console.error('\n❌ Erro:', JSON.stringify(data, null, 2));
        process.exit(1);
    }

    console.log('\n✅ Tokens recebidos!');
    console.log(`   Access token: ${data.access_token?.substring(0, 30)}...`);
    console.log(`   Refresh token: ${data.refresh_token?.substring(0, 30)}...`);
    console.log(`   Expira em: ${(data.expire_in / 3600).toFixed(1)} horas`);

    // Salvar no banco
    const expiresAt = data.expire_in
        ? new Date(Date.now() + data.expire_in * 1000).toISOString()
        : null;

    const { error: updateError } = await supabase
        .from('shopee_tokens')
        .upsert({
            id: 1,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
        });

    if (updateError) {
        console.error('\n❌ Erro ao salvar no banco:', updateError.message);
        console.log('\n   Salve manualmente no .env.local:');
        console.log(`   SHOPEE_ACCESS_TOKEN=${data.access_token}`);
        console.log(`   SHOPEE_REFRESH_TOKEN=${data.refresh_token}`);
        process.exit(1);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('   ✅ TOKENS SALVOS NO BANCO COM SUCESSO!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n   Agora você pode rodar o backfill:');
    console.log('   npx tsx scripts/backfill-shopee-escrow.ts\n');
}

main().catch((err) => {
    console.error('❌ Erro inesperado:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
