import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTinyColumns() {
    console.log('Checking tiny_orders columns...');

    const { data, error } = await supabase
        .from('tiny_orders')
        .select('*')
        .limit(1)
        .single();

    if (data) {
        console.log('Columns found:', Object.keys(data).sort());
        if (Object.keys(data).includes('fee_overrides')) {
            console.log('fee_overrides EXISTS in tiny_orders.');
        } else {
            console.log('fee_overrides MISSING in tiny_orders.');
        }
    } else {
        console.log('No data or error:', error);
    }
}

checkTinyColumns();
