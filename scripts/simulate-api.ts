import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function simulateApiQuery() {
    const orderId = '250405E509KAT0';

    console.log(`Simulating API query for order containing ${orderId}...`);

    // This mimics the API's listQuery JOIN
    const { data: orders } = await supabase
        .from('tiny_orders')
        .select(`
            id,
            tiny_id,
            numero_pedido_ecommerce,
            valor_total_pedido,
            marketplace_payments!marketplace_payments_tiny_order_id_fkey (
                net_amount,
                gross_amount,
                transaction_type,
                is_expense,
                marketplace_order_id
            )
        `)
        .ilike('numero_pedido_ecommerce', `%${orderId}%`)
        .limit(1);

    if (orders && orders[0]) {
        const o = orders[0];
        console.log(`\nOrder found: ${o.numero_pedido_ecommerce}`);
        console.log(`DB id: ${o.id}, tiny_id: ${o.tiny_id}`);

        const payments = Array.isArray(o.marketplace_payments)
            ? o.marketplace_payments
            : (o.marketplace_payments ? [o.marketplace_payments] : []);

        console.log(`\nPayments linked (via JOIN): ${payments.length}`);
        payments.forEach((p, i) => {
            console.log(`  [${i + 1}] ${p.marketplace_order_id}: net=${p.net_amount}, is_expense=${p.is_expense}`);
        });

        // Calculate like the API does
        const valor = payments.reduce((sum: number, p: any) => {
            const val = Number(p.net_amount || 0);
            return sum + (p.is_expense ? -Math.abs(val) : Math.abs(val));
        }, 0);

        console.log(`\nCalculated valor: R$ ${valor.toFixed(2)}`);
    } else {
        console.log('Order not found');
    }
}

simulateApiQuery();
