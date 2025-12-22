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

async function testCorrectCalc() {
    const orderSn = '251211491BC33U';

    console.log('=== Correct Fee Calculation Test ===\n');
    console.log(`Order: ${orderSn}\n`);

    // Get order data
    const { data: orderData } = await supabase
        .from('shopee_orders')
        .select('total_amount, voucher_from_seller, escrow_amount')
        .eq('order_sn', orderSn)
        .single();

    // Get items data
    const { data: itemsData } = await supabase
        .from('shopee_order_items')
        .select('quantity, discounted_price, original_price')
        .eq('order_sn', orderSn);

    let orderValue = 0;
    let productCount = 0;
    itemsData?.forEach((item: any) => {
        const price = item.discounted_price || item.original_price || 0;
        const qty = item.quantity || 1;
        orderValue += price * qty;
        productCount += qty;
    });

    const sellerVoucher = Number((orderData as any)?.voucher_from_seller) || 0;
    const escrowAmount = Number((orderData as any)?.escrow_amount) || 0;

    // Get config
    const { data: configData } = await supabase
        .from('marketplace_fee_config')
        .select('config')
        .eq('marketplace', 'shopee')
        .single();

    const config = configData?.config || {};

    console.log('Input data:');
    console.log('  Order Value (gross):', orderValue);
    console.log('  Seller Voucher:', sellerVoucher);
    console.log('  Shopee Escrow Amount:', escrowAmount);
    console.log('');

    // CORRECT calculation (matching Shopee's logic)
    // Step 1: Deduct voucher first
    const valueAfterVoucher = orderValue - sellerVoucher;
    console.log('Step 1: Value after voucher:', valueAfterVoucher);

    // Step 2: Calculate percentage fees on reduced value
    const usesFreeShipping = config.participates_in_free_shipping || false;
    const commissionRate = usesFreeShipping
        ? (config.free_shipping_commission || 20)
        : (config.base_commission || 14);
    const campaignRate = config.campaign_fee_nov_dec || 3.5;
    const totalPercentageRate = commissionRate + campaignRate;
    const percentageFees = (valueAfterVoucher * totalPercentageRate) / 100;
    console.log(`Step 2: Percentage fees (${totalPercentageRate}% of ${valueAfterVoucher}):`, percentageFees.toFixed(2));

    // Step 3: Subtract fixed cost
    const fixedCostPerProduct = config.fixed_cost_per_product || 4;
    const fixedCost = fixedCostPerProduct * productCount;
    console.log('Step 3: Fixed cost:', fixedCost);

    // Step 4: Calculate net
    const netValue = valueAfterVoucher - percentageFees - fixedCost;
    console.log('Step 4: Net value:', netValue.toFixed(2));

    console.log('');
    console.log('=== Results ===');
    console.log('  Our calculated net:', netValue.toFixed(2));
    console.log('  Shopee escrow amount:', escrowAmount);
    console.log('  Difference:', (netValue - escrowAmount).toFixed(2));

    if (Math.abs(netValue - escrowAmount) < 0.05) {
        console.log('  ✅ MATCH! Calculation is correct.');
    } else {
        console.log('  ⚠️ Still different, investigating...');
    }

    console.log('');
    console.log('=== Breakdown ===');
    console.log(`  ${orderValue} (gross)`);
    console.log(`  - ${sellerVoucher} (voucher)`);
    console.log(`  = ${valueAfterVoucher} (after voucher)`);
    console.log(`  - ${percentageFees.toFixed(2)} (${totalPercentageRate}% fees)`);
    console.log(`  - ${fixedCost} (fixed)`);
    console.log(`  = ${netValue.toFixed(2)} (net)`);
}

testCorrectCalc().catch(console.error);
