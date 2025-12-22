/**
 * BACKFILL SCRIPT: Preencher order_selling_price para pedidos Shopee antigos
 * 
 * Este script busca pedidos sem order_selling_price e chama a API get_escrow_detail
 * da Shopee para obter os valores corretos.
 * 
 * Uso: npx tsx scripts/backfill-shopee-escrow.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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

// --- Shopee API Setup ---
const SHOPEE_BASE_URL = 'https://partner.shopeemobile.com';
const partnerId = process.env.SHOPEE_PARTNER_ID!;
const partnerKey = process.env.SHOPEE_PARTNER_KEY!;

// Will be set dynamically
let shopId: string = '';
let accessToken: string = '';

async function initShopeeCredentials(): Promise<void> {
    // Get access token from database
    const { data: tokens } = await supabase
        .from('shopee_tokens')
        .select('access_token')
        .eq('id', 1)
        .single();

    if (!tokens?.access_token) {
        throw new Error('Shopee tokens not found in database.');
    }
    accessToken = tokens.access_token;

    // Get the REAL shop_id from existing orders (env might be wrong)
    const { data: sampleOrder } = await supabase
        .from('shopee_orders')
        .select('shop_id')
        .not('shop_id', 'is', null)
        .limit(1)
        .single();

    shopId = sampleOrder?.shop_id ? String(sampleOrder.shop_id) : process.env.SHOPEE_SHOP_ID!;
    console.log(`   ℹ️  Usando shop_id: ${shopId}`);
}

function generateSignature(apiPath: string, timestamp: number): string {
    const baseString = `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`;
    return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

async function shopeeRequest<T>(apiPath: string, params: Record<string, string | number>): Promise<T> {
    const fullPath = `/api/v2${apiPath}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSignature(fullPath, timestamp);

    const url = new URL(SHOPEE_BASE_URL + fullPath);
    url.searchParams.set('partner_id', partnerId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('shop_id', shopId);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
    }

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.error && data.error !== '' && data.error !== 0) {
        throw new Error(`Shopee error: ${data.message || data.error}`);
    }

    return data as T;
}

interface EscrowResponse {
    response?: {
        order_sn: string;
        order_income?: {
            order_selling_price?: number;
            order_discounted_price?: number;
            seller_discount?: number;
            escrow_amount?: number;
            voucher_from_seller?: number;
            voucher_from_shopee?: number;
            commission_fee?: number;
            service_fee?: number;
            order_ams_commission_fee?: number;
            actual_shipping_fee?: number;
        };
    };
}

async function getEscrowDetail(orderSn: string) {
    try {
        const data = await shopeeRequest<EscrowResponse>('/payment/get_escrow_detail', {
            order_sn: orderSn
        });

        const income = data.response?.order_income;
        if (!income) return null;

        return {
            order_selling_price: income.order_selling_price || 0,
            order_discounted_price: income.order_discounted_price || 0,
            seller_discount: income.seller_discount || 0,
            escrow_amount: income.escrow_amount || 0,
            voucher_from_seller: income.voucher_from_seller || 0,
            voucher_from_shopee: income.voucher_from_shopee || 0,
            commission_fee: income.commission_fee || 0,
            service_fee: income.service_fee || 0,
            ams_commission_fee: income.order_ams_commission_fee || 0,
            actual_shipping_fee: income.actual_shipping_fee || 0,
        };
    } catch (err: any) {
        console.log(`   ❌ ${orderSn}: ${err.message}`);
        return null;
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main Backfill Function ---
async function runBackfill() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   🔄 BACKFILL: Escrow Data para Pedidos Shopee');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Initialize Shopee credentials
    await initShopeeCredentials();

    // 1. Buscar pedidos recentes (últimos 90 dias) para garantir dados corretos
    console.log('\n📊 Buscando pedidos recentes para atualizar dados financeiros...');

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: ordersToFill, error } = await supabase
        .from('shopee_orders')
        .select('order_sn')
        .gte('create_time', ninetyDaysAgo.toISOString())
        .order('create_time', { ascending: false });

    if (error) {
        console.error('❌ Erro ao buscar pedidos:', error.message);
        return;
    }

    console.log(`   ✓ ${ordersToFill?.length || 0} pedidos encontrados para backfill\n`);

    if (!ordersToFill?.length) {
        console.log('✅ Nenhum pedido precisa de backfill!');
        return;
    }

    let success = 0;
    let errors = 0;
    let skipped = 0;

    // 2. Processar em lotes
    const batchSize = 10;
    const totalBatches = Math.ceil(ordersToFill.length / batchSize);

    for (let batch = 0; batch < totalBatches; batch++) {
        const start = batch * batchSize;
        const end = Math.min(start + batchSize, ordersToFill.length);
        const batchOrders = ordersToFill.slice(start, end);

        console.log(`\n📦 Lote ${batch + 1}/${totalBatches} (${start + 1}-${end} de ${ordersToFill.length})`);

        for (const order of batchOrders) {
            const orderSn = order.order_sn;
            const escrow = await getEscrowDetail(orderSn);

            if (!escrow) {
                skipped++;
                continue;
            }

            // Atualizar no banco
            const { error: updateError } = await supabase
                .from('shopee_orders')
                .update({
                    order_selling_price: escrow.order_selling_price,
                    order_discounted_price: escrow.order_discounted_price,
                    seller_discount: escrow.seller_discount,
                    escrow_amount: escrow.escrow_amount,
                    voucher_from_seller: escrow.voucher_from_seller,
                    voucher_from_shopee: escrow.voucher_from_shopee,
                    commission_fee: escrow.commission_fee,
                    service_fee: escrow.service_fee,
                    ams_commission_fee: escrow.ams_commission_fee,
                    actual_shipping_fee: escrow.actual_shipping_fee,
                    escrow_fetched_at: new Date().toISOString()
                })
                .eq('order_sn', orderSn);

            if (updateError) {
                console.log(`   ❌ ${orderSn}: Erro ao salvar - ${updateError.message}`);
                errors++;
            } else {
                console.log(`   ✓ ${orderSn}: OSP=${escrow.order_selling_price}, SD=${escrow.seller_discount}, Escrow=${escrow.escrow_amount}`);
                success++;
            }

            // Rate limiting
            await sleep(300);
        }

        // Pausa entre lotes
        if (batch < totalBatches - 1) {
            console.log('\n   ⏳ Aguardando 2s antes do próximo lote...');
            await sleep(2000);
        }
    }

    // 3. Resumo final
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('   📋 RESUMO DO BACKFILL');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   ✅ Atualizados com sucesso: ${success}`);
    console.log(`   ⏭️  Pulados (sem dados): ${skipped}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`   📊 Total processado: ${ordersToFill.length}\n`);

    if (success > 0) {
        console.log('✅ Backfill concluído!');
    }
}

runBackfill().catch(console.error);
