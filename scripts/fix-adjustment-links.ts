// Script to fix unlinked adjustment entries by stripping suffixes and re-matching
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

// Regex to strip suffixes (matches parser logic)
const stripSuffix = (id: string): string => {
    return id.replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA)(?:_\d+)?$|_\d+$/, '');
};

async function main() {
    console.log('='.repeat(60));
    console.log('Fixing unlinked adjustment entries');
    console.log('='.repeat(60));

    // Find payments without tiny_order_id
    const { data: unlinkedPayments, error: err1 } = await supabase
        .from('marketplace_payments')
        .select('id, marketplace, marketplace_order_id, net_amount, is_expense, transaction_type')
        .is('tiny_order_id', null)
        .order('created_at', { ascending: false })
        .limit(100);

    if (err1) {
        console.log('❌ Error fetching unlinked payments:', err1.message);
        return;
    }

    console.log(`\nFound ${unlinkedPayments?.length || 0} unlinked payments`);

    let fixed = 0;
    let notFound = 0;
    let skipped = 0;

    for (const payment of unlinkedPayments || []) {
        const baseId = stripSuffix(payment.marketplace_order_id);

        // Skip if no suffix was stripped (already base ID)
        if (baseId === payment.marketplace_order_id) {
            skipped++;
            continue;
        }

        console.log(`\nProcessing: ${payment.marketplace_order_id} -> ${baseId}`);

        // Try to find in marketplace_order_links
        const { data: linkData, error: linkErr } = await supabase
            .from('marketplace_order_links')
            .select('tiny_order_id')
            .eq('marketplace', payment.marketplace)
            .eq('marketplace_order_id', baseId)
            .maybeSingle();

        if (linkErr) {
            console.log(`  ❌ Error querying links: ${linkErr.message}`);
            continue;
        }

        if (!linkData?.tiny_order_id) {
            console.log(`  ⚠️ No link found for base ID: ${baseId}`);
            notFound++;
            continue;
        }

        console.log(`  ✓ Found link to order database id: ${linkData.tiny_order_id}`);

        // IMPORTANT: marketplace_order_links stores tiny_orders.id but 
        // marketplace_payments.tiny_order_id FK references tiny_orders.tiny_id
        // So we need to look up the actual tiny_id value
        const { data: tinyOrder, error: tinyErr } = await supabase
            .from('tiny_orders')
            .select('id, tiny_id')
            .eq('id', linkData.tiny_order_id)
            .maybeSingle();

        if (!tinyOrder) {
            console.log(`  ⚠️ tiny_order with id=${linkData.tiny_order_id} does not exist (orphan link)`);
            notFound++;
            continue;
        }

        console.log(`  ✓ Resolved tiny_id: ${tinyOrder.tiny_id}`);

        // Update the payment with the CORRECT tiny_id (not the database id)
        const { error: updateErr } = await supabase
            .from('marketplace_payments')
            .update({
                tiny_order_id: tinyOrder.tiny_id, // Use tiny_id, NOT database id!
                matched_at: new Date().toISOString(),
                match_confidence: 'suffix_stripped'
            })
            .eq('id', payment.id);

        if (updateErr) {
            console.log(`  ❌ Error updating payment: ${updateErr.message}`);
        } else {
            console.log(`  ✅ Updated payment ${payment.id} with tiny_id=${tinyOrder.tiny_id} (db_id=${tinyOrder.id})`);
            fixed++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Not Found: ${notFound}`);
    console.log(`  Skipped (no suffix): ${skipped}`);
    console.log('='.repeat(60));
}

main().catch(console.error);
