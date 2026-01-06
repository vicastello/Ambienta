import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
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
    const { data: tokenData } = await supabase
        .from('shopee_tokens')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
    return {
        shop_id: Number(tokenData?.shop_id || process.env.SHOPEE_SHOP_ID),
        access_token: tokenData?.access_token
    };
}

function generateSign(path: string, timestamp: number, accessToken: string, shopId: number) {
    const baseStr = `${PARTNER_ID}${path}${timestamp}${accessToken}${shopId}`;
    return crypto.createHmac('sha256', PARTNER_KEY).update(baseStr).digest('hex');
}

async function shopeeRequest(path: string, params: any) {
    const config = await getShopeeConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSign(path, timestamp, config.access_token, config.shop_id);

    const url = new URL(SHOPEE_HOST + path);
    url.searchParams.set('partner_id', String(PARTNER_ID));
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('access_token', config.access_token);
    url.searchParams.set('shop_id', String(config.shop_id));
    url.searchParams.set('sign', sign);

    Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
    return (await fetch(url.toString())).json();
}

async function deepInvestigation(orderSn: string) {
    console.log('='.repeat(80));
    console.log(`🔎 INVESTIGAÇÃO PROFUNDA - PEDIDO: ${orderSn}`);
    console.log('='.repeat(80));

    // ==================== 1. DADOS DO BANCO DE DADOS ====================
    console.log('\n' + '='.repeat(40));
    console.log('📦 DADOS DO BANCO DE DADOS (Nosso App)');
    console.log('='.repeat(40));

    const { data: dbOrder } = await supabase.from('shopee_orders').select('*').eq('order_sn', orderSn).single();
    const { data: dbItems } = await supabase.from('shopee_order_items').select('*').eq('order_sn', orderSn);
    const { data: tinyOrder } = await supabase.from('tiny_orders').select('*').eq('numero_pedido_ecommerce', orderSn).single();

    console.log('\n[shopee_orders]');
    if (dbOrder) {
        console.log(`  order_sn: ${dbOrder.order_sn}`);
        console.log(`  order_status: ${dbOrder.order_status}`);
        console.log(`  total_amount: ${dbOrder.total_amount}`);
        console.log(`  order_selling_price: ${dbOrder.order_selling_price}`);
        console.log(`  order_discounted_price: ${dbOrder.order_discounted_price}`);
        console.log(`  seller_discount: ${dbOrder.seller_discount}`);
        console.log(`  voucher_from_seller: ${dbOrder.voucher_from_seller}`);
        console.log(`  voucher_from_shopee: ${dbOrder.voucher_from_shopee}`);
        console.log(`  escrow_amount: ${dbOrder.escrow_amount}`);
        console.log(`  commission_fee: ${dbOrder.commission_fee}`);
        console.log(`  service_fee: ${dbOrder.service_fee}`);
        console.log(`  ams_commission_fee: ${dbOrder.ams_commission_fee}`);
        console.log(`  escrow_fetched_at: ${dbOrder.escrow_fetched_at}`);
    } else {
        console.log('  ⚠️ Não encontrado no banco!');
    }

    console.log('\n[shopee_order_items]');
    if (dbItems && dbItems.length > 0) {
        dbItems.forEach((item: any, i: number) => {
            console.log(`  Item ${i + 1}:`);
            console.log(`    item_id: ${item.item_id}`);
            console.log(`    item_name: ${item.item_name?.substring(0, 40)}...`);
            console.log(`    quantity: ${item.quantity}`);
            console.log(`    original_price: ${item.original_price}`);
            console.log(`    discounted_price: ${item.discounted_price}`);
            console.log(`    promotion_type: ${item.raw_payload?.promotion_type || 'N/A'}`);
        });
    } else {
        console.log('  ⚠️ Nenhum item encontrado!');
    }

    console.log('\n[tiny_orders]');
    if (tinyOrder) {
        console.log(`  tiny_id: ${tinyOrder.tiny_id}`);
        console.log(`  numero_pedido: ${tinyOrder.numero_pedido}`);
        console.log(`  valor: ${tinyOrder.valor}`);
        console.log(`  valor_frete: ${tinyOrder.valor_frete}`);
        console.log(`  valor_total_pedido: ${tinyOrder.valor_total_pedido}`);
        console.log(`  situacao: ${tinyOrder.situacao}`);
        console.log(`  canal: ${tinyOrder.canal}`);
    } else {
        console.log('  ⚠️ Não encontrado no Tiny!');
    }

    // ==================== 2. API SHOPEE - GET_ESCROW_DETAIL ====================
    console.log('\n' + '='.repeat(40));
    console.log('🌐 API SHOPEE - get_escrow_detail');
    console.log('='.repeat(40));

    const escrowRes = await shopeeRequest('/api/v2/payment/get_escrow_detail', { order_sn: orderSn });

    if (escrowRes.error) {
        console.log(`  ❌ Erro: ${escrowRes.error} - ${escrowRes.message}`);
    } else if (escrowRes.response?.order_income) {
        const inc = escrowRes.response.order_income;
        console.log('\n[order_income]');
        console.log(`  escrow_amount: ${inc.escrow_amount}`);
        console.log(`  buyer_total_amount: ${inc.buyer_total_amount}`);
        console.log(`  order_selling_price: ${inc.order_selling_price}`);
        console.log(`  order_discounted_price: ${inc.order_discounted_price}`);
        console.log(`  seller_discount: ${inc.seller_discount}`);
        console.log(`  original_price: ${inc.original_price}`);
        console.log(`  buyer_paid_amount: ${inc.buyer_paid_amount}`);
        console.log(`  original_shopee_discount: ${inc.original_shopee_discount}`);
        console.log(`  seller_return_refund: ${inc.seller_return_refund}`);
        console.log(`  escrow_tax: ${inc.escrow_tax}`);
        console.log(`  final_escrow_product_gst: ${inc.final_escrow_product_gst}`);
        console.log(`  final_escrow_shipping_gst: ${inc.final_escrow_shipping_gst}`);
        console.log(`  voucher_from_seller: ${inc.voucher_from_seller}`);
        console.log(`  voucher_from_shopee: ${inc.voucher_from_shopee}`);
        console.log(`  coins: ${inc.coins}`);
        console.log(`  shopee_discount: ${inc.shopee_discount}`);
        console.log(`  seller_voucher_code: ${JSON.stringify(inc.seller_voucher_code)}`);
        console.log(`  drc_adjustable_refund: ${inc.drc_adjustable_refund}`);
        console.log(`  cross_border_tax: ${inc.cross_border_tax}`);
        console.log(`  commission_fee: ${inc.commission_fee}`);
        console.log(`  service_fee: ${inc.service_fee}`);
        console.log(`  seller_transaction_fee: ${inc.seller_transaction_fee}`);
        console.log(`  actual_shipping_fee: ${inc.actual_shipping_fee}`);
        console.log(`  buyer_shipping_fee: ${inc.buyer_shipping_fee}`);
        console.log(`  shopee_shipping_rebate: ${inc.shopee_shipping_rebate}`);
        console.log(`  seller_shipping_discount: ${inc.seller_shipping_discount}`);
        console.log(`  estimated_shipping_fee: ${inc.estimated_shipping_fee}`);
        console.log(`  seller_lost_compensation: ${inc.seller_lost_compensation}`);
        console.log(`  order_ams_commission_fee: ${inc.order_ams_commission_fee}`);
        console.log(`  order_chargeable_weight: ${inc.order_chargeable_weight}`);
        console.log(`  reverse_shipping_fee: ${inc.reverse_shipping_fee}`);
        console.log(`  final_shipping_fee: ${inc.final_shipping_fee}`);
        console.log(`  pay_by_credit_card: ${inc.pay_by_credit_card}`);

        // Items breakdown if available
        if (inc.items && inc.items.length > 0) {
            console.log('\n[order_income.items]');
            inc.items.forEach((item: any, i: number) => {
                console.log(`  Item ${i + 1}:`);
                console.log(`    item_id: ${item.item_id}`);
                console.log(`    item_name: ${item.item_name?.substring(0, 30)}...`);
                console.log(`    model_id: ${item.model_id}`);
                console.log(`    original_price: ${item.original_price}`);
                console.log(`    discounted_price: ${item.discounted_price}`);
                console.log(`    seller_discount: ${item.seller_discount}`);
                console.log(`    item_quantity: ${item.item_quantity}`);
                console.log(`    is_main_item: ${item.is_main_item}`);
                console.log(`    activity_type: ${item.activity_type}`);
                console.log(`    original_discount: ${item.original_discount}`);
                console.log(`    ams_commission_fee: ${item.ams_commission_fee}`);
            });
        }
    } else {
        console.log('  ⚠️ Resposta vazia ou inesperada:', JSON.stringify(escrowRes));
    }

    // ==================== 3. API SHOPEE - GET_ORDER_DETAIL ====================
    console.log('\n' + '='.repeat(40));
    console.log('🌐 API SHOPEE - get_order_detail');
    console.log('='.repeat(40));

    const orderRes = await shopeeRequest('/api/v2/order/get_order_detail', {
        order_sn_list: orderSn,
        response_optional_fields: 'buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,goods_to_declare,note,note_update_time,item_list,pay_time,dropshipper,dropshipper_phone,split_up,buyer_cancel_reason,cancel_by,cancel_reason,actual_shipping_fee_confirmed,buyer_cpf_id,fulfillment_flag,pickup_done_time,package_list,shipping_carrier,payment_method,total_amount,buyer_username,invoice_data,checkout_shipping_carrier,reverse_shipping_fee,estimated_shipping_fee_discount,order_chargeable_weight_gram'
    });

    if (orderRes.error) {
        console.log(`  ❌ Erro: ${orderRes.error} - ${orderRes.message}`);
    } else if (orderRes.response?.order_list?.[0]) {
        const ord = orderRes.response.order_list[0];
        console.log('\n[order_detail]');
        console.log(`  order_sn: ${ord.order_sn}`);
        console.log(`  order_status: ${ord.order_status}`);
        console.log(`  total_amount: ${ord.total_amount}`);
        console.log(`  actual_shipping_fee: ${ord.actual_shipping_fee}`);
        console.log(`  estimated_shipping_fee: ${ord.estimated_shipping_fee}`);
        console.log(`  payment_method: ${ord.payment_method}`);
        console.log(`  create_time: ${new Date(ord.create_time * 1000).toISOString()}`);
        console.log(`  update_time: ${new Date(ord.update_time * 1000).toISOString()}`);
        console.log(`  pay_time: ${ord.pay_time ? new Date(ord.pay_time * 1000).toISOString() : 'N/A'}`);

        if (ord.item_list && ord.item_list.length > 0) {
            console.log('\n[order_detail.item_list]');
            ord.item_list.forEach((item: any, i: number) => {
                console.log(`  Item ${i + 1}:`);
                console.log(`    item_id: ${item.item_id}`);
                console.log(`    item_name: ${item.item_name?.substring(0, 30)}...`);
                console.log(`    model_id: ${item.model_id}`);
                console.log(`    model_name: ${item.model_name}`);
                console.log(`    model_quantity_purchased: ${item.model_quantity_purchased}`);
                console.log(`    model_original_price: ${item.model_original_price}`);
                console.log(`    model_discounted_price: ${item.model_discounted_price}`);
                console.log(`    promotion_type: ${item.promotion_type}`);
                console.log(`    promotion_id: ${item.promotion_id}`);
                console.log(`    wholesale: ${item.wholesale}`);
            });
        }
    } else {
        console.log('  ⚠️ Resposta vazia ou inesperada:', JSON.stringify(orderRes));
    }

    // ==================== 4. ANÁLISE DAS DIVERGÊNCIAS ====================
    console.log('\n' + '='.repeat(40));
    console.log('📊 ANÁLISE DAS DIVERGÊNCIAS');
    console.log('='.repeat(40));

    if (dbOrder && escrowRes.response?.order_income) {
        const inc = escrowRes.response.order_income;

        console.log('\n[Comparação DB vs API]');
        const comparisons = [
            ['total_amount', dbOrder.total_amount, '--', 'N/A na escrow'],
            ['order_selling_price', dbOrder.order_selling_price, inc.order_selling_price],
            ['order_discounted_price', dbOrder.order_discounted_price, inc.order_discounted_price],
            ['seller_discount', dbOrder.seller_discount, inc.seller_discount],
            ['escrow_amount', dbOrder.escrow_amount, inc.escrow_amount],
            ['commission_fee', dbOrder.commission_fee, inc.commission_fee],
            ['service_fee', dbOrder.service_fee, inc.service_fee],
            ['voucher_from_seller', dbOrder.voucher_from_seller, inc.voucher_from_seller],
            ['voucher_from_shopee', dbOrder.voucher_from_shopee, inc.voucher_from_shopee],
            ['ams_commission_fee', dbOrder.ams_commission_fee, inc.order_ams_commission_fee],
        ];

        console.log('  Campo                    | DB          | API         | Match');
        console.log('  ' + '-'.repeat(60));
        comparisons.forEach(([field, db, api, note]) => {
            const dbVal = Number(db) || 0;
            const apiVal = Number(api) || 0;
            const match = note ? '⚠️' : (Math.abs(dbVal - apiVal) < 0.01 ? '✅' : '❌');
            console.log(`  ${String(field).padEnd(24)} | ${String(dbVal).padEnd(11)} | ${String(apiVal).padEnd(11)} | ${match} ${note || ''}`);
        });

        // Calculate what our app SHOULD show
        console.log('\n[Cálculo do App vs Realidade]');
        const appBase = Number(dbOrder.order_selling_price) || 0;
        const apiBase = Number(inc.order_selling_price) || 0;
        const appEscrow = Number(dbOrder.escrow_amount) || 0;
        const apiEscrow = Number(inc.escrow_amount) || 0;

        console.log(`  Base no App (order_selling_price): R$ ${appBase.toFixed(2)}`);
        console.log(`  Base na API: R$ ${apiBase.toFixed(2)}`);
        console.log(`  Escrow no App: R$ ${appEscrow.toFixed(2)}`);
        console.log(`  Escrow na API: R$ ${apiEscrow.toFixed(2)}`);
        console.log(`  Diferença Escrow: R$ ${(appEscrow - apiEscrow).toFixed(2)}`);

        // Calculate theoretical fees
        const commRate = 0.20;
        const campaignRate = 0.035;
        const fixedCost = 4.0;

        const theoreticalComm = appBase * commRate;
        const theoreticalCampaign = appBase * campaignRate;
        const theoreticalFees = theoreticalComm + theoreticalCampaign + fixedCost;
        const theoreticalNet = appBase - theoreticalFees;

        console.log(`\n[Cálculo Teórico com Base ${appBase.toFixed(2)}]`);
        console.log(`  Comissão (20%): R$ ${theoreticalComm.toFixed(2)}`);
        console.log(`  Campanha (3.5%): R$ ${theoreticalCampaign.toFixed(2)}`);
        console.log(`  Custo Fixo: R$ ${fixedCost.toFixed(2)}`);
        console.log(`  Total Taxas: R$ ${theoreticalFees.toFixed(2)}`);
        console.log(`  Líquido Teórico: R$ ${theoreticalNet.toFixed(2)}`);
        console.log(`  Escrow Real (API): R$ ${apiEscrow.toFixed(2)}`);
        console.log(`  DIFERENÇA: R$ ${(theoreticalNet - apiEscrow).toFixed(2)}`);

        // Real fees from API
        const realComm = Number(inc.commission_fee) || 0;
        const realService = Number(inc.service_fee) || 0;
        const realAms = Number(inc.order_ams_commission_fee) || 0;

        console.log(`\n[Taxas Reais (API)]`);
        console.log(`  commission_fee: R$ ${realComm.toFixed(2)}`);
        console.log(`  service_fee: R$ ${realService.toFixed(2)}`);
        console.log(`  order_ams_commission_fee: R$ ${realAms.toFixed(2)}`);
        console.log(`  Total Taxas Reais: R$ ${(realComm + realService + realAms).toFixed(2)}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('FIM DA INVESTIGAÇÃO');
    console.log('='.repeat(80));
}

deepInvestigation('2511304DEPQERG').catch(console.error);
