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

async function checkEscrowDetails() {
    const orderSn = '2512112JCVABGT';

    console.log('=== Escrow Details Check ===\n');
    console.log(`Order: ${orderSn}\n`);

    // Get all escrow-related fields from shopee_orders
    const { data: orderData } = await supabase
        .from('shopee_orders')
        .select(`
            order_sn,
            total_amount,
            escrow_amount,
            commission_fee,
            service_fee,
            order_selling_price,
            order_discounted_price,
            seller_discount,
            voucher_from_seller,
            voucher_from_shopee,
            seller_voucher_code,
            escrow_fetched_at,
            raw_payload
        `)
        .eq('order_sn', orderSn)
        .single();

    if (!orderData) {
        console.log('Order not found');
        return;
    }

    console.log('=== Shopee Order Data ===');
    console.log('  total_amount:', orderData.total_amount);
    console.log('  escrow_amount:', orderData.escrow_amount);
    console.log('  commission_fee:', orderData.commission_fee);
    console.log('  service_fee:', orderData.service_fee);
    console.log('  order_selling_price:', orderData.order_selling_price);
    console.log('  order_discounted_price:', orderData.order_discounted_price);
    console.log('  seller_discount:', orderData.seller_discount);
    console.log('  voucher_from_seller:', orderData.voucher_from_seller);
    console.log('  voucher_from_shopee:', orderData.voucher_from_shopee);
    console.log('  seller_voucher_code:', orderData.seller_voucher_code);
    console.log('  escrow_fetched_at:', orderData.escrow_fetched_at);

    // Check if there's escrow info in raw_payload
    const rawPayload = orderData.raw_payload as any;
    if (rawPayload?.escrow_detail) {
        console.log('\n=== Raw Escrow Detail from Payload ===');
        console.log(JSON.stringify(rawPayload.escrow_detail, null, 2));
    }

    // Calculate based on Shopee's actual fees
    if (orderData.commission_fee !== null && orderData.service_fee !== null) {
        const totalShopeeDeductions =
            (orderData.commission_fee || 0) +
            (orderData.service_fee || 0) +
            (orderData.voucher_from_seller || 0);

        console.log('\n=== Shopee Fee Analysis ===');
        console.log('  Commission Fee:', orderData.commission_fee);
        console.log('  Service Fee:', orderData.service_fee);
        console.log('  Seller Voucher:', orderData.voucher_from_seller);
        console.log('  Total Deductions:', totalShopeeDeductions);
        console.log('  Expected Net (total - deductions):', orderData.total_amount - totalShopeeDeductions);
    }
}

checkEscrowDetails().catch(console.error);
