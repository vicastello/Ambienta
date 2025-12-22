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

async function checkOrder() {
    const orderSn = '251211491BC33U';

    console.log('=== Checking Order Voucher Data ===\n');

    const { data: order } = await supabase
        .from('shopee_orders')
        .select('order_sn, voucher_from_seller, voucher_from_shopee, seller_voucher_code, escrow_amount, escrow_fetched_at')
        .eq('order_sn', orderSn)
        .single();

    console.log('Database Data:');
    console.log('  voucher_from_seller:', order?.voucher_from_seller);
    console.log('  voucher_from_shopee:', order?.voucher_from_shopee);
    console.log('  seller_voucher_code:', order?.seller_voucher_code);
    console.log('  escrow_amount:', order?.escrow_amount);
    console.log('  escrow_fetched_at:', order?.escrow_fetched_at);
}

checkOrder().catch(console.error);
