import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMovements() {
    const orderId = '250405E509KAT0';

    console.log(`Checking ALL movements for order ${orderId}...`);

    // Check marketplace_payments for all entries with this order ID
    const { data: payments } = await supabase
        .from('marketplace_payments')
        .select('*')
        .ilike('marketplace_order_id', `%${orderId}%`);

    console.log(`Found ${payments?.length} entries in marketplace_payments:`);
    payments?.forEach((p, i) => {
        console.log(`\n[${i + 1}] ${p.marketplace_order_id}`);
        console.log(`   Type: ${p.transaction_type}`);
        console.log(`   Description: ${p.transaction_description}`);
        console.log(`   Net Amount: ${p.net_amount}`);
        console.log(`   Date: ${p.payment_date}`);
        console.log(`   Linked Tiny ID: ${p.tiny_order_id}`);
    });

    // Also check session data for raw movements
    const { data: sessions } = await supabase
        .from('payment_import_sessions')
        .select('id, parsed_data')
        .order('created_at', { ascending: false })
        .limit(1);

    if (sessions && sessions[0]) {
        const parsed = sessions[0].parsed_data as any[];
        const related = parsed.filter(p =>
            p.marketplaceOrderId?.includes(orderId) ||
            p.transactionDescription?.includes(orderId)
        );
        console.log(`\nFound ${related.length} related entries in session data:`);
        related.forEach((r, i) => {
            console.log(`\n[Session ${i + 1}] ${r.marketplaceOrderId}`);
            console.log(`   Type: ${r.transactionType}`);
            console.log(`   Net: ${r.netAmount}`);
            console.log(`   Is Refund: ${r.isRefund}`);
            console.log(`   Is Adjustment: ${r.isAdjustment}`);
        });
    }
}

checkMovements();
