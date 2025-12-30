import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env.development.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPatterns() {
    console.log('Checking ecommerce ID patterns for orders with NULL canal...');

    // Fetch orders with null canal
    const { data: orders } = await supabase
        .from('tiny_orders')
        .select('numero_pedido, numero_pedido_ecommerce')
        .is('canal', null)
        .limit(100);

    if (!orders || orders.length === 0) {
        console.log('No orders with NULL canal found?');
        return;
    }

    console.log(`Analyzing ${orders.length} orders...`);

    orders.forEach(o => {
        const id = o.numero_pedido_ecommerce || '';
        let type = 'Unknown';

        if (/^\d{15,}$/.test(id)) {
            type = 'Mercado Livre (Numeric >15)';
        } else if (/^[A-Z0-9]{10,}$/.test(id) && /\d/.test(id) && /[A-Z]/.test(id)) {
            type = 'Shopee (Alphanumeric)';
        } else if (id.length > 20) {
            type = 'Long ID (likely Shopee)';
        } else if (/^\d+$/.test(id)) {
            type = 'Numeric (ML or Other)';
        }

        console.log(`Order ${o.numero_pedido}: ID "${id}" -> ${type}`);
    });
}

checkPatterns().catch(console.error);
