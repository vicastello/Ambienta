import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.development.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixNullCanals() {
    console.log('Fixing NULL canals based on ID patterns...');

    let processedTotal = 0;

    while (true) {
        const { data: orders, error } = await supabase
            .from('tiny_orders')
            .select('id, numero_pedido, numero_pedido_ecommerce')
            .is('canal', null)
            .limit(1000); // explicit limit

        if (error) {
            console.error('Error fetching orders:', error);
            break;
        }

        if (!orders || orders.length === 0) {
            console.log('No more orders with NULL canal found. Finished.');
            break;
        }

        console.log(`Processing batch of ${orders.length} orders...`);

        const shopeeIds: number[] = [];
        const magaluIds: number[] = [];
        const mlIds: number[] = [];

        orders.forEach(o => {
            const id = o.numero_pedido_ecommerce || '';
            if (!id) return; // Should not happen given previous backfills

            if (id.startsWith('LU-')) {
                magaluIds.push(o.id);
            } else if (id.startsWith('200')) {
                mlIds.push(o.id);
            } else {
                // User instruction: "Shopee are the others"
                shopeeIds.push(o.id);
            }
        });

        console.log(`Identified in batch: Shopee=${shopeeIds.length}, Magalu=${magaluIds.length}, ML=${mlIds.length}`);

        // Update Shopee
        if (shopeeIds.length > 0) {
            for (let i = 0; i < shopeeIds.length; i += 500) {
                const chunk = shopeeIds.slice(i, i + 500);
                const { error: upErr } = await supabase
                    .from('tiny_orders')
                    .update({ canal: 'Shopee' })
                    .in('id', chunk);
                if (upErr) console.error('Error updating Shopee chunk:', upErr);
            }
            console.log(`Updated ${shopeeIds.length} Shopee orders`);
        }

        // Update Magalu
        if (magaluIds.length > 0) {
            const { error: upErr } = await supabase
                .from('tiny_orders')
                .update({ canal: 'Magalu' })
                .in('id', magaluIds);
            if (upErr) console.error('Error updating Magalu:', upErr);
            else console.log(`Updated ${magaluIds.length} Magalu orders`);
        }

        // Update Mercado Livre
        if (mlIds.length > 0) {
            const { error: upErr } = await supabase
                .from('tiny_orders')
                .update({ canal: 'Mercado Livre' })
                .in('id', mlIds);
            if (upErr) console.error('Error updating ML:', upErr);
            else console.log(`Updated ${mlIds.length} ML orders`);
        }

        processedTotal += orders.length;
        console.log(`Total processed so far: ${processedTotal}`);
    }
    console.log('Done.');
}

fixNullCanals().catch(console.error);
