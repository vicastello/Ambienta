import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env.local');
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

async function checkAffiliateOrder() {
    const orderSn = '251206NBQVBF56';

    console.log('=== Affiliate Order Check ===\n');
    console.log(`Order: ${orderSn}\n`);

    // Get all data from shopee_orders
    const { data: orderData } = await supabase
        .from('shopee_orders')
        .select('*')
        .eq('order_sn', orderSn)
        .single();

    if (!orderData) {
        console.log('Order not found in database');
        return;
    }

    // Remove large raw_payload for display
    const displayData = { ...orderData };
    delete displayData.raw_payload;

    console.log('=== Shopee Order Data (without raw_payload) ===');
    console.log(JSON.stringify(displayData, null, 2));

    // Check raw_payload for affiliate info
    const rawPayload = orderData.raw_payload as any;
    if (rawPayload) {
        console.log('\n=== Checking raw_payload for affiliate info ===');

        // Look for any affiliate-related fields
        const affiliateFields = ['affiliate', 'kol', 'commission', 'referral', 'partner'];

        function findFields(obj: any, path = ''): void {
            if (!obj || typeof obj !== 'object') return;

            for (const key of Object.keys(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                const value = obj[key];

                // Check if key name contains affiliate-related terms
                const isAffiliateField = affiliateFields.some(term =>
                    key.toLowerCase().includes(term)
                );

                if (isAffiliateField) {
                    console.log(`  Found: ${currentPath} =`, value);
                }

                // Recurse into objects
                if (value && typeof value === 'object') {
                    findFields(value, currentPath);
                }
            }
        }

        findFields(rawPayload);

        // Also check for escrow_detail if present
        if (rawPayload.escrow_detail) {
            console.log('\n=== Escrow Detail ===');
            console.log(JSON.stringify(rawPayload.escrow_detail, null, 2));
        }

        // Check order_income specifically
        if (rawPayload.order_income) {
            console.log('\n=== Order Income ===');
            console.log(JSON.stringify(rawPayload.order_income, null, 2));
        }
    }

    // Get items
    const { data: itemsData } = await supabase
        .from('shopee_order_items')
        .select('*')
        .eq('order_sn', orderSn);

    if (itemsData && itemsData.length > 0) {
        console.log('\n=== Shopee Order Items ===');
        itemsData.forEach((item: any, idx: number) => {
            console.log(`Item ${idx + 1}:`, {
                item_name: item.item_name,
                quantity: item.quantity,
                original_price: item.original_price,
                discounted_price: item.discounted_price,
            });
        });
    }
}

checkAffiliateOrder().catch(console.error);
