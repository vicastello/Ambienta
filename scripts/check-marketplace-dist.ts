import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMarketplace() {
    console.log('Checking marketplace column distribution...');

    // Pagination again
    const allMarketplaces: string[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('tiny_orders')
            .select('canal')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) console.log('Error:', error);

        if (error || !data || data.length === 0) {
            hasMore = false;
        } else {
            // console.log(`Page ${page}: ${data.length} rows`);
            // @ts-ignore
            data.forEach(d => allMarketplaces.push(d.canal || 'NULL'));
            page++;
            if (page > 300) hasMore = false;
        }
    }

    const counts: Record<string, number> = {};
    allMarketplaces.forEach(m => {
        counts[m] = (counts[m] || 0) + 1;
    });

    console.log('Distribution:');
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
        console.log(`  ${k}: ${v}`);
    });
}

checkMarketplace().catch(console.error);
