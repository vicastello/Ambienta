import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkColumns() {
    console.log('Checking columns...');

    // Select one row
    const { data, error } = await supabase
        .from('marketplace_payments')
        .select('*')
        .limit(1)
        .single();

    if (data) {
        console.log('Columns found:', Object.keys(data).sort());
    } else {
        console.log('No data or error:', error);
    }
}

checkColumns();
