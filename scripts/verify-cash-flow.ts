import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables if available
try {
    dotenv.config({ path: '.env.local' });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        dotenv.config({ path: '.env.vercel' });
    }
} catch (e) { }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing env vars.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
    console.log('Checking recent Cash Flow entries...');

    // Check entries created in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
        .from('cash_flow_entries')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
        .eq('source', 'tiny_order')
        .eq('amount', 0); // Check specifically for zero-value entries

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`✅ Zero-value Sales (Tiny Orders) added in last hour: ${count}`);
    }
}

main();
