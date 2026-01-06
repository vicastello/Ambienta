#!/usr/bin/env tsx
/**
 * Atualiza o access_token da Shopee usando o refresh_token do banco de dados.
 * Uso: npx tsx scripts/shopee-refresh-token-db.ts
 */

import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env.local (Supabase + Shopee)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const partnerId = process.env.SHOPEE_PARTNER_ID!;
const partnerKey = process.env.SHOPEE_PARTNER_KEY!;

const PATH = '/api/v2/auth/access_token/get';

function generateSign(timestamp: number) {
    const base = `${partnerId}${PATH}${timestamp}`;
    return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   🔄 SHOPEE TOKEN REFRESH (usando banco de dados)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // 1. Buscar tokens do banco
    const { data: tokens, error } = await supabase
        .from('shopee_tokens')
        .select('*')
        .eq('id', 1)
        .single();

    if (error || !tokens) {
        console.error('❌ Erro ao buscar tokens do banco:', error?.message);
        process.exit(1);
    }

    console.log('📊 Token atual:');
    console.log('   Access token:', tokens.access_token?.substring(0, 30) + '...');
    console.log('   Refresh token:', tokens.refresh_token?.substring(0, 30) + '...');
    console.log('   Expira em:', tokens.expires_at);
    console.log('   Atualizado:', tokens.updated_at);

    if (!tokens.refresh_token) {
        console.error('\n❌ Refresh token não encontrado no banco!');
        console.log('   Você precisa re-autorizar a loja no painel da Shopee.');
        process.exit(1);
    }

    // 2. Buscar shop_id real dos pedidos
    const { data: sampleOrder } = await supabase
        .from('shopee_orders')
        .select('shop_id')
        .not('shop_id', 'is', null)
        .limit(1)
        .single();

    const shopId = sampleOrder?.shop_id ? String(sampleOrder.shop_id) : process.env.SHOPEE_SHOP_ID!;
    console.log('\n   Shop ID:', shopId);

    // 3. Fazer refresh
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSign(timestamp);

    const url = new URL(`https://partner.shopeemobile.com${PATH}`);
    url.searchParams.set('partner_id', partnerId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);

    const body = {
        shop_id: Number(shopId),
        partner_id: Number(partnerId),
        refresh_token: tokens.refresh_token,
    };

    console.log('\n📡 Enviando refresh request...');

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        console.error(`❌ HTTP ${res.status}:`, JSON.stringify(data, null, 2));
        process.exit(1);
    }

    if (data.error && data.error !== '0' && data.error !== 0) {
        console.error('\n❌ Erro Shopee:', data.error, data.message ?? data.error_msg);
        console.log('\n   Se o refresh_token expirou, você precisa re-autorizar a loja.');
        process.exit(1);
    }

    // 4. Salvar novos tokens no banco
    const expiresAt = data.expire_in
        ? new Date(Date.now() + data.expire_in * 1000).toISOString()
        : null;

    const { error: updateError } = await supabase
        .from('shopee_tokens')
        .update({
            access_token: data.access_token,
            refresh_token: data.refresh_token || tokens.refresh_token,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

    if (updateError) {
        console.error('❌ Erro ao salvar tokens:', updateError.message);
        process.exit(1);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('   ✅ TOKEN RENOVADO COM SUCESSO!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   Novo access_token: ${data.access_token.substring(0, 30)}...`);
    console.log(`   Expira em: ${(data.expire_in / 3600).toFixed(1)} horas`);
    console.log(`   Salvo no banco: ✓`);
    console.log('\n   Agora você pode rodar o backfill novamente!');
}

main().catch((err) => {
    console.error('❌ Erro inesperado:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
