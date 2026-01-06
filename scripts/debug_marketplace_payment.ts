
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

async function check() {
    console.log('Checking marketplace_payments for 251126Q1HWJ12K...');

    // Check marketplace_payments
    const { data: payments, error } = await supabase
        .from('marketplace_payments')
        .select('*')
        .eq('marketplace_order_id', '251126Q1HWJ12K');

    if (error) console.error('Error fetching payments:', error);

    console.log('Payments found:', payments?.length || 0);
    if (payments?.length) {
        payments.forEach(p => {
            console.log('Payment:', {
                id: p.id,
                marketplace_order_id: p.marketplace_order_id,
                net_amount: p.net_amount,
                date: p.payment_date,
                tiny_order_id: p.tiny_order_id
            });
        });
    }

    // Check tiny_orders to see if it was linked
    // We can use the tiny_order_id from payment if available, otherwise search by order_ecommerce
    const { data: tinyOrder } = await supabase
        .from('tiny_orders')
        .select('id, numero, numero_pedido_ecommerce, payment_received')
        .eq('numero_pedido_ecommerce', '251126Q1HWJ12K')
        .maybeSingle();

    console.log('Tiny Order:', tinyOrder || 'Not found');
}
check();
