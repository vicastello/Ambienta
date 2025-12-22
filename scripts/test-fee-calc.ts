import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env.vercel');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
});

const supabase = createClient(
    envVars.NEXT_PUBLIC_SUPABASE_URL,
    envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function testFeeCalculation() {
    const orderSn = '251211491BC33U';

    console.log('=== Fee Calculation Test ===\n');
    console.log(`Order: ${orderSn}\n`);

    // 1. Get order data from shopee_orders
    const { data: orderData } = await supabase
        .from('shopee_orders')
        .select('order_sn, total_amount, voucher_from_seller, voucher_from_shopee, seller_voucher_code, escrow_amount')
        .eq('order_sn', orderSn)
        .single();

    console.log('Shopee Order Data:');
    console.log('  total_amount:', orderData?.total_amount);
    console.log('  voucher_from_seller:', orderData?.voucher_from_seller);
    console.log('  voucher_from_shopee:', orderData?.voucher_from_shopee);
    console.log('  seller_voucher_code:', orderData?.seller_voucher_code);
    console.log('  escrow_amount (from Shopee API):', orderData?.escrow_amount);

    // 2. Get items data from shopee_order_items
    const { data: itemsData } = await supabase
        .from('shopee_order_items')
        .select('item_name, quantity, original_price, discounted_price')
        .eq('order_sn', orderSn);

    console.log('\nShopee Order Items:');
    let orderValue = 0;
    let productCount = 0;
    itemsData?.forEach((item: any, idx: number) => {
        const price = item.discounted_price || item.original_price || 0;
        const qty = item.quantity || 1;
        orderValue += price * qty;
        productCount += qty;
        console.log(`  Item ${idx + 1}: ${item.item_name} - qty: ${qty}, price: ${price}`);
    });
    console.log(`  Total Order Value (from items): R$ ${orderValue.toFixed(2)}`);
    console.log(`  Total Product Count: ${productCount}`);

    // 3. Get Shopee config
    const { data: configData } = await supabase
        .from('marketplace_fee_config')
        .select('config')
        .eq('marketplace', 'shopee')
        .single();

    const config = configData?.config || {};
    console.log('\nShopee Config:');
    console.log('  base_commission:', config.base_commission, '%');
    console.log('  free_shipping_commission:', config.free_shipping_commission, '%');
    console.log('  participates_in_free_shipping:', config.participates_in_free_shipping);
    console.log('  fixed_cost_per_product:', config.fixed_cost_per_product);
    console.log('  campaign_fee_default:', config.campaign_fee_default, '%');
    console.log('  campaign_fee_nov_dec:', config.campaign_fee_nov_dec, '%');

    // 4. Calculate fees manually
    const usesFreeShipping = config.participates_in_free_shipping || false;
    const commissionRate = usesFreeShipping
        ? (config.free_shipping_commission || 14)
        : (config.base_commission || 12);
    const campaignRate = config.campaign_fee_nov_dec || 3.5; // December = Nov/Dec period
    const fixedCostPerProduct = config.fixed_cost_per_product || 4;
    const sellerVoucher = Number(orderData?.voucher_from_seller) || 0;

    console.log('\n=== Fee Calculation ===');
    console.log(`Order Value (base): R$ ${orderValue.toFixed(2)}`);
    console.log(`Uses Free Shipping: ${usesFreeShipping}`);
    console.log(`Commission Rate: ${commissionRate}%`);
    console.log(`Campaign Rate (Dec): ${campaignRate}%`);

    const commissionFee = (orderValue * commissionRate) / 100;
    const campaignFee = (orderValue * campaignRate) / 100;
    const fixedCost = fixedCostPerProduct * productCount;

    console.log(`\nCommission Fee: R$ ${commissionFee.toFixed(2)} (${commissionRate}% of ${orderValue.toFixed(2)})`);
    console.log(`Campaign Fee: R$ ${campaignFee.toFixed(2)} (${campaignRate}% of ${orderValue.toFixed(2)})`);
    console.log(`Fixed Cost: R$ ${fixedCost.toFixed(2)} (${fixedCostPerProduct} x ${productCount})`);
    console.log(`Seller Voucher: R$ ${sellerVoucher.toFixed(2)}`);

    const totalFees = commissionFee + campaignFee + fixedCost + sellerVoucher;
    const expectedNet = orderValue - totalFees;

    console.log(`\nTotal Fees: R$ ${totalFees.toFixed(2)}`);
    console.log(`Expected Net Value: R$ ${expectedNet.toFixed(2)}`);
    console.log(`\nShopee Escrow Amount: R$ ${(orderData?.escrow_amount || 'N/A')}`);

    // Compare with Shopee's escrow amount
    if (orderData?.escrow_amount) {
        const diff = expectedNet - orderData.escrow_amount;
        console.log(`\nDifference (calculated - escrow): R$ ${diff.toFixed(2)}`);
        if (Math.abs(diff) < 0.10) {
            console.log('✅ Calculation matches Shopee escrow amount!');
        } else {
            console.log('⚠️ Calculation differs from Shopee escrow amount');
        }
    }
}

testFeeCalculation().catch(console.error);
