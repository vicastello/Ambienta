import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Load envs
const envVercelPath = path.resolve(process.cwd(), '.env.vercel');
if (fs.existsSync(envVercelPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envVercelPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOPEE_HOST = 'https://partner.shopeemobile.com';
const PARTNER_ID = Number(process.env.SHOPEE_PARTNER_ID);
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY!;

async function getShopeeConfig() {
    const { data: tokenData } = await supabase.from('shopee_tokens').select('*').order('updated_at', { ascending: false }).limit(1).single();

    // Fallback: get shop_id from existing orders if token doesn't have it
    let shopId = Number(tokenData?.shop_id);
    if (!shopId || isNaN(shopId)) {
        const { data: orderData } = await supabase.from('shopee_orders').select('shop_id').limit(1).single();
        shopId = Number(orderData?.shop_id) || 428171387; // Hardcoded fallback
    }

    return { shop_id: shopId, access_token: tokenData?.access_token };
}

function generateSign(pathStr: string, timestamp: number, accessToken: string, shopId: number) {
    const baseStr = `${PARTNER_ID}${pathStr}${timestamp}${accessToken}${shopId}`;
    return crypto.createHmac('sha256', PARTNER_KEY).update(baseStr).digest('hex');
}

async function shopeeRequest(pathStr: string, params: any) {
    const config = await getShopeeConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSign(pathStr, timestamp, config.access_token, config.shop_id);
    const url = new URL(SHOPEE_HOST + pathStr);
    url.searchParams.set('partner_id', String(PARTNER_ID));
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('access_token', config.access_token);
    url.searchParams.set('shop_id', String(config.shop_id));
    url.searchParams.set('sign', sign);
    Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
    return (await fetch(url.toString())).json();
}

async function analyzeEscrow() {
    const escrowRes = await shopeeRequest('/api/v2/payment/get_escrow_detail', { order_sn: '2511304DEPQERG' });
    const inc = escrowRes.response?.order_income;

    if (!inc) {
        console.log('Erro ao buscar escrow:', escrowRes);
        return;
    }

    console.log('='.repeat(60));
    console.log('🔍 ANÁLISE DETALHADA DO ESCROW');
    console.log('='.repeat(60));

    // Print ALL numeric fields
    console.log('\n📋 TODOS OS CAMPOS NUMÉRICOS:');
    const numericFields: { [key: string]: number } = {};
    Object.keys(inc).forEach(k => {
        const v = inc[k];
        if (typeof v === 'number') {
            console.log(`  ${k}: ${v}`);
            numericFields[k] = v;
        }
    });

    console.log('\n📐 TENTATIVAS DE FÓRMULA:');

    const selling = numericFields['order_selling_price'] || 0;
    const comm = numericFields['commission_fee'] || 0;
    const service = numericFields['service_fee'] || 0;
    const escrow = numericFields['escrow_amount'] || 0;
    const sellerReturnRefund = numericFields['seller_return_refund'] || 0;
    const finalShip = numericFields['final_shipping_fee'] || 0;
    const reverseShip = numericFields['reverse_shipping_fee'] || 0;
    const actualShip = numericFields['actual_shipping_fee'] || 0;

    console.log(`\n[Fórmula 1] selling - comm - service`);
    console.log(`  ${selling} - ${comm} - ${service} = ${selling - comm - service}`);
    console.log(`  Escrow Real: ${escrow}`);
    console.log(`  Diff: ${(selling - comm - service) - escrow}`);

    console.log(`\n[Fórmula 2] selling - comm - service + sellerReturnRefund`);
    console.log(`  ${selling} - ${comm} - ${service} + (${sellerReturnRefund}) = ${selling - comm - service + sellerReturnRefund}`);
    console.log(`  Escrow Real: ${escrow}`);
    console.log(`  Diff: ${(selling - comm - service + sellerReturnRefund) - escrow}`);

    console.log(`\n[Fórmula 3] selling - comm - service + finalShip`);
    console.log(`  ${selling} - ${comm} - ${service} + (${finalShip}) = ${selling - comm - service + finalShip}`);
    console.log(`  Escrow Real: ${escrow}`);
    console.log(`  Diff: ${(selling - comm - service + finalShip) - escrow}`);

    console.log(`\n[Fórmula 4] selling - comm - service + finalShip + sellerReturnRefund`);
    const f4 = selling - comm - service + finalShip + sellerReturnRefund;
    console.log(`  ${selling} - ${comm} - ${service} + (${finalShip}) + (${sellerReturnRefund}) = ${f4}`);
    console.log(`  Escrow Real: ${escrow}`);
    console.log(`  Diff: ${f4 - escrow}`);

    // Try to find which fields add up to escrow
    console.log('\n🎯 SOMA REVERSA (O que faz escrow = 22.89):');
    console.log(`  selling (${selling}) - X = ${escrow}`);
    console.log(`  X = ${selling} - ${escrow} = ${selling - escrow}`);
    console.log('  Portanto, as deduções totais são: R$', (selling - escrow).toFixed(2));

    console.log('\n  Deduções conhecidas:');
    console.log(`    commission_fee: ${comm}`);
    console.log(`    service_fee: ${service}`);
    console.log(`    Total conhecidas: ${comm + service}`);
    console.log(`    Faltando explicar: ${(selling - escrow) - (comm + service)}`);

    // Check "escrow_details" sub-field if exists
    if (escrowRes.response?.escrow_details) {
        console.log('\n📄 ESCROW DETAILS:');
        console.log(JSON.stringify(escrowRes.response.escrow_details, null, 2));
    }
}

analyzeEscrow().catch(console.error);
