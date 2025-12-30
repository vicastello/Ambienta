import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function linkAdjustment() {
    const baseOrderId = '250405E509KAT0';
    const adjustmentOrderId = '250405E509KAT0_AJUSTE';
    const tinyId = 916392414; // The correct tiny_id from parent order

    console.log('Linking adjustment to parent order...');

    const { data, error } = await supabase
        .from('marketplace_payments')
        .update({
            tiny_order_id: tinyId,
            matched_at: new Date().toISOString(),
            match_confidence: 'derived' // Marked as derived from parent
        })
        .eq('marketplace_order_id', adjustmentOrderId)
        .select();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Linked successfully:', data);
    }

    // Verify final balance
    const { data: payments } = await supabase
        .from('marketplace_payments')
        .select('net_amount, transaction_type')
        .eq('tiny_order_id', tinyId);

    if (payments) {
        const total = payments.reduce((sum, p) => sum + Number(p.net_amount || 0), 0);
        console.log(`\nTotal balance for order: R$ ${total.toFixed(2)}`);
        payments.forEach(p => {
            console.log(`  - ${p.transaction_type}: R$ ${p.net_amount}`);
        });
    }
}

linkAdjustment();
