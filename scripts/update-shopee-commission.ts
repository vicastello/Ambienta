import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env.vercel', 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // Get current config
    const { data: current, error: fetchError } = await supabase
        .from('marketplace_fee_config')
        .select('config')
        .eq('marketplace', 'shopee')
        .single();

    if (fetchError || !current) {
        console.log('Error fetching config:', fetchError?.message);
        return;
    }

    console.log('Current config:', JSON.stringify(current.config, null, 2));

    // Update base_commission to 20% since we participate in free shipping
    const newConfig = {
        ...current.config,
        base_commission: 20,
        free_shipping_commission: 20
    };

    const { error } = await supabase
        .from('marketplace_fee_config')
        .update({ config: newConfig, updated_at: new Date().toISOString() })
        .eq('marketplace', 'shopee');

    if (error) {
        console.log('Error updating:', error.message);
    } else {
        console.log('\n✅ Updated Shopee config to 20% commission');
        console.log('New config:', JSON.stringify(newConfig, null, 2));
    }
}

main();
