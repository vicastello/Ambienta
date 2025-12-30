import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMissingMonths() {
    console.log('Checking which months have orders missing ecommerce ID...\n');

    // Query count grouped by month using raw SQL or client-side aggregation with pagination
    // Since we have many rows, let's fetch in chunks

    const monthCounts: Record<string, number> = {};
    let totalMissing = 0;

    let from = 0;
    const batchSize = 1000;
    let keepFetching = true;

    while (keepFetching) {
        const { data: orders, error } = await supabase
            .from('tiny_orders')
            .select('data_criacao')
            .is('numero_pedido_ecommerce', null)
            .order('data_criacao', { ascending: true })
            .range(from, from + batchSize - 1);

        if (error || !orders || orders.length === 0) {
            keepFetching = false;
        } else {
            orders.forEach(o => {
                if (o.data_criacao) {
                    const month = o.data_criacao.substring(0, 7); // YYYY-MM
                    monthCounts[month] = (monthCounts[month] || 0) + 1;
                    totalMissing++;
                }
            });

            if (orders.length < batchSize) keepFetching = false;
            from += batchSize;
        }
    }

    console.log('Months with missing ecommerce IDs:\n');
    Object.entries(monthCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([month, count]) => {
            console.log(`  ${month}: ${count} pedidos`);
        });

    console.log(`\nTotal: ${totalMissing} pedidos sem ecommerce ID`);
}

checkMissingMonths().catch(console.error);
