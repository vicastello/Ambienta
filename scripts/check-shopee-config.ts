import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase
        .from('marketplace_fee_config')
        .select('*')
        .eq('marketplace', 'shopee')
        .single();

    if (error) {
        console.error('Error fetching config:', error);
    } else {
        console.log('Shopee Config:', JSON.stringify(data.config, null, 2));
    }
}

run();
