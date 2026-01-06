
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: any = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2].replace(/^[\"']|[\"']$/g, '');
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function repair() {
    console.log('Finding inconsistencies (tiny_orders linked, but payment unlinked)...');

    // Fetch tiny_orders that claim to be paid linked to a payment
    const { data: linkedOrders, error } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido, numero_pedido_ecommerce, marketplace_payment_id')
        .not('marketplace_payment_id', 'is', null);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Checking ${linkedOrders.length} potentially linked orders...`);

    let repairedCount = 0;

    for (const order of linkedOrders) {
        const { data: payment } = await supabase
            .from('marketplace_payments')
            .select('id, tiny_order_id, marketplace_order_id')
            .eq('id', order.marketplace_payment_id)
            .single();

        if (payment && !payment.tiny_order_id) {
            console.log(`Fixing broken link for Order ${order.numero_pedido} (${order.numero_pedido_ecommerce}) -> Payment ${payment.marketplace_order_id}`);

            // Try first with standard ID
            let { error: updateError } = await supabase
                .from('marketplace_payments')
                .update({
                    tiny_order_id: order.id,
                    matched_at: new Date().toISOString(),
                    match_confidence: 'exact'
                })
                .eq('id', payment.id);

            if (updateError) {
                console.error('  Failed with internal ID:', updateError.message);

                // If FK points to tiny_id instead of id, try that
                if (order.tiny_id) {
                    const { error: retryError } = await supabase
                        .from('marketplace_payments')
                        .update({
                            tiny_order_id: order.tiny_id,
                            matched_at: new Date().toISOString(),
                            match_confidence: 'exact'
                        })
                        .eq('id', payment.id);

                    if (retryError) {
                        console.error('  Failed with tiny_id too:', retryError.message);
                    } else {
                        repairedCount++;
                        console.log('  Fixed using tiny_id!');
                    }
                }
            } else {
                repairedCount++;
                console.log('  Fixed!');
            }
        }
    }

    console.log(`Done! Repaired ${repairedCount} broken links.`);
}

repair();
