import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function syncOrphanPayments() {
    const { fetchAndSaveTinyOrder } = await import('../lib/tinyClient');

    console.log('Finding orphan payments (tiny_order_id is null)...\n');

    // Get all orphan Shopee payments from April
    const { data: orphans } = await supabase
        .from('marketplace_payments')
        .select('marketplace_order_id, payment_date, net_amount')
        .is('tiny_order_id', null)
        .eq('marketplace', 'shopee')
        .not('is_expense', 'eq', true)
        .order('payment_date', { ascending: false })
        .limit(50); // Process in batches

    console.log(`Found ${orphans?.length || 0} orphan payments to process.\n`);

    let synced = 0;
    let failed = 0;

    for (const payment of (orphans || [])) {
        // Skip adjustment entries (they have suffixes)
        if (payment.marketplace_order_id.includes('_')) {
            console.log(`[SKIP] ${payment.marketplace_order_id} (adjustment/suffix)`);
            continue;
        }

        console.log(`[SYNC] ${payment.marketplace_order_id}...`);

        try {
            // Sync from Tiny
            const result = await fetchAndSaveTinyOrder(payment.marketplace_order_id, 'shopee');

            if (result.success && result.tinyOrderId) {
                // Link the payment
                await supabase
                    .from('marketplace_payments')
                    .update({
                        tiny_order_id: result.tinyOrderId,
                        matched_at: new Date().toISOString(),
                        match_confidence: 'exact'
                    })
                    .eq('marketplace_order_id', payment.marketplace_order_id);

                // Mark Tiny order as paid
                await supabase
                    .from('tiny_orders')
                    .update({
                        payment_received: true,
                        payment_received_at: new Date().toISOString()
                    })
                    .eq('tiny_id', result.tinyOrderId);

                console.log(`       ✅ Synced! tiny_id: ${result.tinyOrderId}`);
                synced++;
            } else {
                console.log(`       ❌ Failed: ${result.error}`);
                failed++;
            }
        } catch (e: any) {
            console.log(`       ❌ Error: ${e.message}`);
            failed++;
        }

        // Rate limit protection
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n=== Summary ===`);
    console.log(`Synced: ${synced}`);
    console.log(`Failed: ${failed}`);
}

syncOrphanPayments().catch(console.error);
