
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Inspecting tiny_orders schema...');
    const { data: tinySample } = await supabase.from('tiny_orders').select('*').limit(1).single();
    if (tinySample) {
        console.log('tiny_orders columns:', Object.keys(tinySample));
        console.log('Sample tiny_order:', JSON.stringify(tinySample, null, 2));
    }

    console.log('\nInspecting marketplace_order_links schema...');
    const { data: linkSample } = await supabase.from('marketplace_order_links').select('*').limit(1).single();
    if (linkSample) {
        console.log('marketplace_order_links columns:', Object.keys(linkSample));
        console.log('Sample link:', JSON.stringify(linkSample, null, 2));
    }

    // Try to find the specific order using marketplace_order_id
    console.log('\nSearching for marketplace order ID: 251206MK17CQ8R');
    const { data: linkMatch } = await supabase
        .from('marketplace_order_links')
        .select('*, tiny_orders(*)')
        .eq('marketplace_order_id', '251206MK17CQ8R')
        .maybeSingle();

    if (linkMatch) {
        console.log('Match found in marketplace_order_links!');
        console.log(JSON.stringify(linkMatch, null, 2));
    }
}

run();
