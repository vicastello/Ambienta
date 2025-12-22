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

// Set env vars for the marketplace-fees module
process.env.NEXT_PUBLIC_SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
    envVars.NEXT_PUBLIC_SUPABASE_URL,
    envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function testCalcDirect() {
    const orderSn = '251211491BC33U';

    console.log('=== Direct Fee Calculation Test ===\n');

    // Get order items
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

    // Get voucher from seller
    const { data: shopeeOrderData } = await supabase
        .from('shopee_orders')
        .select('voucher_from_seller, voucher_from_shopee, data_criacao')
        .eq('order_sn', orderSn)
        .single();

    const voucherFromSeller = Number((shopeeOrderData as any)?.voucher_from_seller) || 0;

    console.log('Input data:');
    console.log('  orderValue:', orderValue);
    console.log('  productCount:', productCount);
    console.log('  voucherFromSeller:', voucherFromSeller);

    // Now call the fee calculation API
    const response = await fetch('http://localhost:3000/api/financeiro/pagamentos/test-fee-calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            marketplace: 'shopee',
            orderValue,
            productCount,
            sellerVoucher: voucherFromSeller,
            orderDate: new Date('2025-12-11').toISOString(),
        })
    });

    if (!response.ok) {
        console.log('API not available, doing direct calculation...\n');

        // Get config
        const { data: configData } = await supabase
            .from('marketplace_fee_config')
            .select('config')
            .eq('marketplace', 'shopee')
            .single();

        const config = configData?.config || {};

        const usesFreeShipping = config.participates_in_free_shipping || false;
        const commissionRate = usesFreeShipping
            ? (config.free_shipping_commission || 20)
            : (config.base_commission || 14);
        const campaignRate = config.campaign_fee_nov_dec || 3.5;
        const fixedCostPerProduct = config.fixed_cost_per_product || 4;

        const commissionFee = (orderValue * commissionRate) / 100;
        const campaignFee = (orderValue * campaignRate) / 100;
        const fixedCost = fixedCostPerProduct * productCount;
        const totalFees = commissionFee + campaignFee + fixedCost;
        const netValueWithoutVoucher = orderValue - totalFees;
        const netValueWithVoucher = orderValue - totalFees - voucherFromSeller;

        console.log('\nCalculation breakdown:');
        console.log('  Commission Rate:', commissionRate, '%');
        console.log('  Campaign Rate:', campaignRate, '%');
        console.log('  Fixed Cost/Product:', fixedCostPerProduct);
        console.log('');
        console.log('  Commission Fee:', commissionFee.toFixed(2));
        console.log('  Campaign Fee:', campaignFee.toFixed(2));
        console.log('  Fixed Cost:', fixedCost.toFixed(2));
        console.log('  Total Fees (before voucher):', totalFees.toFixed(2));
        console.log('  Seller Voucher:', voucherFromSeller);
        console.log('');
        console.log('  Net Value WITHOUT voucher:', netValueWithoutVoucher.toFixed(2));
        console.log('  Net Value WITH voucher:', netValueWithVoucher.toFixed(2), '← This should be shown in preview');
        console.log('');
        console.log('  Shopee escrow_amount: 99.96');
        console.log('  Difference from calculated:', (netValueWithVoucher - 99.96).toFixed(2));
    }
}

testCalcDirect().catch(console.error);
