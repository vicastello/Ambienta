import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkOrder() {
    const orderId = '250405E509KAT0';
    console.log(`Checking order ${orderId}...`);

    // Check tiny_orders via ecommerce number
    const { data: tinyOrder, error } = await supabase
        .from('tiny_orders')
        .select('*')
        .eq('numero_pedido_ecommerce', orderId)
        .single();

    if (tinyOrder) {
        console.log('Found in tiny_orders:');
        console.log(`- ID: ${tinyOrder.id}`);
        console.log(`- Data Criacao: ${tinyOrder.data_criacao}`);
        console.log(`- Data Pagamento: ${tinyOrder.payment_received_at}`);
        console.log(`- Pago? ${tinyOrder.payment_received}`);
    } else {
        console.log('Not found in tiny_orders by ecommerce number.');
    }

    // Check marketplace_payments
    const { data: pay } = await supabase
        .from('marketplace_payments')
        .select('*')
        .eq('marketplace_order_id', orderId);

    console.log(`Found ${pay?.length} entries in marketplace_payments.`);
    if (pay && pay.length > 0) {
        pay.forEach(p => {
            console.log(`- Payment Date: ${p.payment_date} | Net: ${p.net_amount} | Linked Tiny ID: ${p.tiny_order_id}`);
        });
    }
}

checkOrder();
