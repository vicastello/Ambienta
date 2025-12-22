import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    // Check available_tags
    const { data: available, error: e1 } = await supabase.from('available_tags').select('*').limit(10);
    console.log('🏷️ available_tags:', available, e1);

    // Check order_tags
    const { data: orderTags, error: e2 } = await supabase.from('order_tags').select('*').limit(10);
    console.log('📋 order_tags:', orderTags, e2);

    // Check marketplace_payments tags
    const { data: mpTags, error: e3 } = await supabase
        .from('marketplace_payments')
        .select('marketplace_order_id, tags')
        .not('tags', 'is', null)
        .limit(10);
    console.log('💳 marketplace_payments tags:', mpTags, e3);
}

main().catch(console.error);
