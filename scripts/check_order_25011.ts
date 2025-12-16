
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

async function checkOrder() {
    console.log('Checking tiny_orders for numero_pedido 25011...');
    const { data: tinyOrder, error: tinyError } = await supabase
        .from('tiny_orders')
        .select('*')
        .or(`numero_pedido.eq.25011,tiny_id.eq.25011`)
        .limit(1);

    if (tinyError) {
        console.error('Error querying tiny_orders:', tinyError);
    } else if (tinyOrder && tinyOrder.length > 0) {
        console.log('Found in tiny_orders:', JSON.stringify(tinyOrder[0], null, 2));
    } else {
        console.log('Not found in tiny_orders.');

        // Check most recent to see context
        const { data: recent, error: recentError } = await supabase
            .from('tiny_orders')
            .select('tiny_id, numero_pedido, data_criacao, cliente_nome')
            .order('data_criacao', { ascending: false })
            .limit(5);
        console.log('Most recent tiny_orders:', recent);
    }

    console.log('\nChecking compras_saved_orders for references...');
    const { data: savedOrder, error: savedError } = await supabase
        .from('compras_saved_orders')
        .select('*')
        .ilike('name', '%25011%')
        .limit(1);

    if (savedError) {
        console.error('Error querying compras_saved_orders:', savedError);
    } else if (savedOrder && savedOrder.length > 0) {
        console.log('Found in compras_saved_orders (by name):', JSON.stringify(savedOrder[0], null, 2));
    } else {
        console.log('Not found in compras_saved_orders by name.');
        // Check most recent saved
        const { data: recentSaved } = await supabase
            .from('compras_saved_orders')
            .select('id, name, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
        console.log('Most recent saved_orders:', recentSaved);
    }
}

checkOrder();
