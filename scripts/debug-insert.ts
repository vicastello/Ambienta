import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugInsert() {
    console.log('Debugging manual insert...');

    const batchId = '26bc47a1-1b3a-421b-b2b2-05cdddd2f25e'; // From previous log
    const payment = {
        marketplace: 'shopee',
        marketplace_order_id: '250405E509KAT0',
        upload_batch_id: batchId,
        payment_date: '2025-04-14',
        settlement_date: '2025-04-14',
        gross_amount: 86.21,
        net_amount: 86.21,
        fees: 0,
        discount: 0,
        status: 'Transação completa',
        payment_method: 'shopee_pay',
        transaction_type: 'Renda do pedido',
        transaction_description: 'Renda do pedido  #250405E509KAT0',
        balance_after: 86.21,
        is_adjustment: false,
        is_refund: false,
        is_expense: false,
        expense_category: null,
        tiny_order_id: null, // Testing null to bypass FK error
        matched_at: new Date().toISOString(),
        match_confidence: 'exact',
        // raw_data: ..., // Skipping raw_data for simplicity or add dummy
        // fee_overrides: { source: 'parsed' }
    };

    console.log('Payload:', payment);

    // Manual check and insert implementation
    const { data: existing } = await supabase
        .from('marketplace_payments')
        .select('id')
        .eq('marketplace', payment.marketplace)
        .eq('marketplace_order_id', payment.marketplace_order_id)
        .maybeSingle();

    if (existing) {
        console.log('Record exists, would update ID:', existing.id);
        const { data, error } = await supabase
            .from('marketplace_payments')
            .update(payment)
            .eq('id', existing.id)
            .select()
            .single();
        if (error) console.error('UPDATE ERROR:', error);
        else console.log('Update Success:', data);
    } else {
        console.log('Record does not exist, inserting...');
        const { data, error } = await supabase
            .from('marketplace_payments')
            .insert(payment)
            .select()
            .single();

        if (error) console.error('INSERT ERROR:', error);
        else console.log('Insert Success:', data);
    }
}

debugInsert();
