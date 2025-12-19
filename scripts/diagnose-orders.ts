
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Running diagnostics...');

    const { count, error } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true });

    console.log('Total Orders:', count);

    const { count: validCount } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .gt('valor_total_pedido', 0);

    console.log('Orders with Value > 0:', validCount);

    const { count: marketplaceCount } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .gt('valor_total_pedido', 0)
        .or('canal.ilike.%shopee%,canal.ilike.%mercado%,canal.ilike.%magalu%');

    console.log('Orders with Value > 0 AND Valid Marketplace:', marketplaceCount);

    // Check distinct value columns
    const { count: valorCount } = await supabase
        .from('tiny_orders')
        .select('*', { count: 'exact', head: true })
        .gt('valor', 0);

    console.log('Orders with Valor > 0:', valorCount);

    // Check first 5 items to see what they look like
    const { data: sample } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido, canal, valor_total_pedido, valor')
        .order('data_pedido', { ascending: false })
        .limit(5);

    console.log('Sample Recent Orders:', sample);
}

run();

