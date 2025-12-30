import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testInsert() {
    console.log('Testing direct insert with id=448483...');

    // Try with the INTERNAL id (448483)
    const { data: d1, error: e1 } = await supabase
        .from('marketplace_payments')
        .update({ tiny_order_id: 448483 })
        .eq('marketplace_order_id', '250405E509KAT0')
        .select('id, tiny_order_id');

    console.log('Update with internal id:', { data: d1, error: e1 });

    if (e1) {
        // Try with the EXTERNAL tiny_id (916392414)
        console.log('Trying with tiny_id instead...');
        const { data: d2, error: e2 } = await supabase
            .from('marketplace_payments')
            .update({ tiny_order_id: 916392414 })
            .eq('marketplace_order_id', '250405E509KAT0')
            .select('id, tiny_order_id');

        console.log('Update with tiny_id:', { data: d2, error: e2 });
    }
}

testInsert();
