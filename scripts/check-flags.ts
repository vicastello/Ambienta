import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkFlags() {
    const tinyId = 916392414;

    console.log(`Checking payment flags for tiny_order_id=${tinyId}...`);

    const { data: payments } = await supabase
        .from('marketplace_payments')
        .select('marketplace_order_id, net_amount, is_expense, is_refund, is_adjustment, transaction_type')
        .eq('tiny_order_id', tinyId);

    if (payments) {
        payments.forEach((p, i) => {
            console.log(`\n[${i + 1}] ${p.marketplace_order_id}`);
            console.log(`   net_amount: ${p.net_amount}`);
            console.log(`   is_expense: ${p.is_expense}`);
            console.log(`   is_refund: ${p.is_refund}`);
            console.log(`   is_adjustment: ${p.is_adjustment}`);
            console.log(`   transaction_type: ${p.transaction_type}`);
        });

        // Simulate the calculation
        const result = payments.reduce((sum, p) => {
            const val = Number(p.net_amount || 0);
            // Current logic:
            const contribution = p.is_expense ? -Math.abs(val) : Math.abs(val);
            console.log(`\n   Calculation for ${p.marketplace_order_id}:`);
            console.log(`   val=${val}, is_expense=${p.is_expense}, contribution=${contribution}`);
            return sum + contribution;
        }, 0);

        console.log(`\nFinal calculated value: R$ ${result.toFixed(2)}`);
    }
}

checkFlags();
