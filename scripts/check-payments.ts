// Script to check marketplace_payments and their tiny_order_id linkage
const { createClient } = require('@supabase/supabase-js');

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line: string) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        envVars[match[1].trim()] = value;
    }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('='.repeat(60));
    console.log('Checking marketplace_payments with adjustments (suffix _N)');
    console.log('='.repeat(60));

    // Find payments with suffixed IDs (adjustments)
    const { data: suffixedPayments, error: err1 } = await supabase
        .from('marketplace_payments')
        .select('id, marketplace, marketplace_order_id, tiny_order_id, net_amount, is_expense, transaction_type, created_at')
        .like('marketplace_order_id', '%\\_%')
        .order('created_at', { ascending: false })
        .limit(20);

    if (err1) {
        console.log('❌ Error fetching suffixed payments:', err1.message);
    } else {
        console.log(`\n📦 Payments with suffixed IDs (${suffixedPayments?.length || 0}):`);
        if (suffixedPayments && suffixedPayments.length > 0) {
            suffixedPayments.forEach((p: any) => {
                console.log(`  ${p.marketplace_order_id}: tiny_order_id=${p.tiny_order_id || 'NULL'}, net=${p.net_amount}, expense=${p.is_expense}, type=${p.transaction_type}`);
            });
        } else {
            console.log('  No suffixed payments found');
        }
    }

    // Find recent payments with their tiny_order_id status
    console.log('\n' + '='.repeat(60));
    console.log('Recent marketplace_payments (last 20)');
    console.log('='.repeat(60));

    const { data: recentPayments, error: err2 } = await supabase
        .from('marketplace_payments')
        .select('id, marketplace, marketplace_order_id, tiny_order_id, net_amount, is_expense, transaction_type, transaction_description, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

    if (err2) {
        console.log('❌ Error:', err2.message);
    } else if (recentPayments) {
        console.log('\n');
        recentPayments.forEach((p: any) => {
            const linked = p.tiny_order_id ? '✅' : '❌';
            const expense = p.is_expense ? '💸' : '💰';
            console.log(`${linked}${expense} ${p.marketplace_order_id}: tiny=${p.tiny_order_id || 'NULL'}, net=R$${p.net_amount}, ${p.transaction_type || p.transaction_description || 'no-type'}`);
        });

        // Count linked vs unlinked
        const linked = recentPayments.filter((p: any) => p.tiny_order_id).length;
        const unlinked = recentPayments.filter((p: any) => !p.tiny_order_id).length;
        console.log(`\n📊 Summary: ${linked} linked, ${unlinked} unlinked`);
    }

    // Check if there are orders with multiple payments
    console.log('\n' + '='.repeat(60));
    console.log('Checking orders with multiple payments linked');
    console.log('='.repeat(60));

    const { data: multiPayments, error: err3 } = await supabase
        .from('marketplace_payments')
        .select('tiny_order_id, marketplace_order_id, net_amount, is_expense, transaction_type')
        .not('tiny_order_id', 'is', null)
        .order('tiny_order_id', { ascending: true })
        .limit(100);

    if (err3) {
        console.log('❌ Error:', err3.message);
    } else if (multiPayments) {
        // Group by tiny_order_id
        const grouped = multiPayments.reduce((acc: any, p: any) => {
            if (!acc[p.tiny_order_id]) acc[p.tiny_order_id] = [];
            acc[p.tiny_order_id].push(p);
            return acc;
        }, {});

        const multiEntryOrders = Object.entries(grouped).filter(([_, payments]: any) => payments.length > 1);

        if (multiEntryOrders.length > 0) {
            console.log(`\n📦 Orders with multiple payments (${multiEntryOrders.length}):`);
            multiEntryOrders.forEach(([tinyOrderId, payments]: any) => {
                const total = payments.reduce((sum: number, p: any) => {
                    return sum + (p.is_expense ? -p.net_amount : p.net_amount);
                }, 0);
                console.log(`  tiny_order_id=${tinyOrderId}: ${payments.length} payments, net total=R$${total.toFixed(2)}`);
                payments.forEach((p: any) => {
                    const sign = p.is_expense ? '-' : '+';
                    console.log(`    ${sign}R$${p.net_amount} (${p.marketplace_order_id}) - ${p.transaction_type || 'no-type'}`);
                });
            });
        } else {
            console.log('  No orders with multiple payments found');
        }
    }

    console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
