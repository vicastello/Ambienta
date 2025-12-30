import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkShopeeOrders() {
    console.log('Checking shopee_orders table...\n');

    // Check if shopee_orders table exists and has data
    const { count } = await supabase
        .from('shopee_orders')
        .select('*', { count: 'exact', head: true });

    console.log(`Total shopee_orders: ${count}`);

    // Get sample
    const { data: sample } = await supabase
        .from('shopee_orders')
        .select('*')
        .limit(1);

    if (sample && sample[0]) {
        console.log('\nSample columns:');
        Object.keys(sample[0]).slice(0, 20).forEach(k => {
            console.log(`  ${k}: ${sample[0][k]}`);
        });
    }

    // Check date range
    const { data: dateRange } = await supabase
        .from('shopee_orders')
        .select('order_creation_date')
        .order('order_creation_date', { ascending: true })
        .limit(1);

    const { data: dateRangeEnd } = await supabase
        .from('shopee_orders')
        .select('order_creation_date')
        .order('order_creation_date', { ascending: false })
        .limit(1);

    console.log(`\nDate range in shopee_orders:`);
    console.log(`  Oldest: ${dateRange?.[0]?.order_creation_date}`);
    console.log(`  Newest: ${dateRangeEnd?.[0]?.order_creation_date}`);
}

checkShopeeOrders().catch(console.error);
