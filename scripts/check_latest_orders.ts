
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLatestOrders() {
    console.log('--- Latest Sales Order (tiny_orders) ---');
    const { data: tinyOrder, error: tinyError } = await supabase
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido, data_criacao, cliente_nome, canal, situacao, val:valor')
        .order('data_criacao', { ascending: false })
        .order('id', { ascending: false }) // Tie-breaker
        .limit(1);

    if (tinyError) console.error(tinyError);
    else console.log(JSON.stringify(tinyOrder?.[0] ?? 'No sales orders found', null, 2));

    console.log('\n--- Latest Purchase Draft (compras_saved_orders) ---');
    const { data: savedOrder, error: savedError } = await supabase
        .from('compras_saved_orders')
        .select('id, name, created_at, updated_at, periodo:period_days, itens:produtos')
        .order('created_at', { ascending: false })
        .limit(1);

    if (savedError) console.error(savedError);
    else {
        const order = savedOrder?.[0];
        if (order) {
            console.log({
                ...order,
                itens_count: Array.isArray(order.itens) ? order.itens.length : 0,
                itens: undefined // hide huge array
            });
        } else {
            console.log('No saved orders found');
        }
    }
}

checkLatestOrders();
