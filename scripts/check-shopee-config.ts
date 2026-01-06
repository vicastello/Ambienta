import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    const { data: tokens } = await supabase
        .from('shopee_tokens')
        .select('*')
        .eq('id', 1)
        .single();

    console.log('Token exists:', !!tokens?.access_token);
    console.log('Token length:', tokens?.access_token?.length);

    const { data: orders } = await supabase
        .from('shopee_orders')
        .select('order_sn, shop_id')
        .gt('order_selling_price', 0)
        .limit(3);

    console.log('Shop IDs from orders:', orders?.map(o => o.shop_id));
    console.log('Env SHOPEE_SHOP_ID:', process.env.SHOPEE_SHOP_ID);
}
check();
