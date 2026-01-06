
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: any = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2].replace(/^[\"']|[\"']$/g, '');
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    // 1. Get ID from shopee_orders
    const { data: shopeeOrders, error: shopeeError } = await supabase
        .from('shopee_orders')
        .select('id, order_sn')
        .eq('order_sn', '251126Q1HWJ12K');

    if (shopeeError) console.error('Shopee lookup error:', shopeeError);

    if (!shopeeOrders || shopeeOrders.length === 0) {
        console.log('Order not found in shopee_orders');
        return;
    }

    console.log(`Found ${shopeeOrders.length} shopee orders`);
    const shopeeOrder = shopeeOrders[0];
    console.log('Using Shopee Order ID:', shopeeOrder.id);

    // 2. Check financeiro_fluxo_caixa
    const { data: fluxoEntries, error } = await supabase
        .from('financeiro_fluxo_caixa')
        .select('*')
        .eq('shopee_order_id', shopeeOrder.id);

    if (error) console.error('Error fetching fluxo:', error);

    console.log('Fluxo entries found via shopee_order_id:', fluxoEntries?.length || 0);
    if (fluxoEntries?.length) {
        fluxoEntries.forEach(entry => {
            console.log('Entry:', {
                id: entry.id,
                description: entry.description,
                amount: entry.amount,
                date: entry.transaction_date,
                type: entry.transaction_type
            });
        });
    }

    // Try searching by description just in case
    const { data: byDesc } = await supabase
        .from('financeiro_fluxo_caixa')
        .select('*')
        .ilike('description', `%251126Q1HWJ12K%`);

    console.log('Entries by description search:', byDesc?.length || 0);
    if (byDesc?.length) {
        byDesc.forEach(entry => console.log('Found by desc:', {
            id: entry.id,
            description: entry.description,
            amount: entry.amount,
            linked_shopee_id: entry.shopee_order_id
        }));
    }
}
check();
