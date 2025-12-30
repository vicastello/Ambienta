import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkLastBatch() {
    console.log('Checking last upload batch...');

    const { data: batch } = await supabase
        .from('payment_upload_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!batch) {
        console.log('No batches found.');
        return;
    }

    console.log('Last Batch:', batch);

    // Check payments in this batch
    const { data: payments } = await supabase
        .from('marketplace_payments')
        .select('marketplace_order_id, net_amount, payment_date')
        .eq('upload_batch_id', batch.id)
        .limit(20);

    console.log(`Payments in batch (first 20 of ${batch.rows_processed}):`);
    payments?.forEach(p => console.log(JSON.stringify(p)));

    // Search specifically for similar IDs
    const { data: similar } = await supabase
        .from('marketplace_payments')
        .select('*')
        .eq('upload_batch_id', batch.id)
        .ilike('marketplace_order_id', '%250405E509KAT0%');

    if (similar && similar.length > 0) {
        console.log('Found similar IDs:', similar);
    } else {
        console.log('No similar IDs found in this batch.');
    }
}

checkLastBatch();
