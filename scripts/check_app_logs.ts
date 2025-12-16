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

async function checkLogs() {
    console.log('Checking for recent activity in compras_saved_orders...\n');

    // Check all orders from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentOrders, error } = await supabase
        .from('compras_saved_orders')
        .select('id, name, created_at, updated_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error querying recent orders:', error);
    } else {
        console.log(`Found ${recentOrders?.length || 0} orders in the last 7 days:`);
        recentOrders?.forEach(order => {
            console.log(`  - ${order.name} (Created: ${new Date(order.created_at).toLocaleString('pt-BR')})`);
        });
    }

    // Check if there's an error log table
    console.log('\n--- Checking for error/log tables ---');
    const { data: tables } = await supabase
        .from('pg_tables')
        .select('tablename')
        .like('tablename', '%log%')
        .or('tablename.like.%error%');

    if (tables && tables.length > 0) {
        console.log('Found log/error tables:', tables.map(t => t.tablename));
    } else {
        console.log('No dedicated error/log tables found in schema.');
    }
}

checkLogs();
