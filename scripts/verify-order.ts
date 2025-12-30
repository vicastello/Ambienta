import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    const tinyId = 918486339;

    const { data } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido, numero_pedido_ecommerce, data_criacao, canal, cliente_nome')
        .eq('tiny_id', tinyId)
        .maybeSingle();

    console.log('Order in tiny_orders:', data);
}

check();
