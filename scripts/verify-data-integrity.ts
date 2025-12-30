import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyIntegrity() {
    // Dynamic import to allow dotenv to load first
    const { calculateMarketplaceFees } = await import('../lib/marketplace-fees');

    console.log('=== 1. Completeness Check (Orders by Month) ===');

    // Fetch all dates (pagination to bypass 1000 limit)
    const allDates: string[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('tiny_orders')
            .select('data_criacao')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error || !data || data.length === 0) {
            hasMore = false;
        } else {
            data.forEach(d => allDates.push(d.data_criacao));
            page++;
            // Safety break
            if (page > 100) hasMore = false;
        }
    }

    const byMonth: Record<string, number> = {};
    allDates.forEach(dateStr => {
        if (!dateStr) return;
        const date = new Date(dateStr);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
    });

    Object.keys(byMonth).sort().forEach(m => {
        console.log(`  ${m}: ${byMonth[m]} orders`);
    });

    console.log('\n=== 2. Product Coverage Check ===');
    const { count: totalOrders } = await supabase.from('tiny_orders').select('*', { count: 'exact', head: true });

    // Check distinct orders in tiny_pedido_itens
    // Since distinct count is hard in simple query without raw, we'll estimate or just count rows
    // Better: Select count of items
    const { count: totalItems } = await supabase.from('tiny_pedido_itens').select('*', { count: 'exact', head: true });

    // Check how many orders have enriched=true
    const { count: enrichedOrders } = await supabase.from('tiny_orders').select('*', { count: 'exact', head: true }).eq('is_enriched', true);

    console.log(`  Total Orders: ${totalOrders}`);
    console.log(`  Total Item Rows: ${totalItems}`);
    console.log(`  Enriched Orders (Processing Complete): ${enrichedOrders} (${((enrichedOrders || 0) / (totalOrders || 1) * 100).toFixed(1)}%)`);

    console.log('\n=== 3. Link Coverage Check ===');
    const { count: linkedOrders } = await supabase.from('marketplace_order_links').select('*', { count: 'exact', head: true });
    const { count: ecommerceIdPopulated } = await supabase.from('tiny_orders').select('*', { count: 'exact', head: true }).not('numero_pedido_ecommerce', 'is', null);

    console.log(`  Orders with Ecommerce ID: ${ecommerceIdPopulated}`);
    console.log(`  Marketplace Links Table Rows: ${linkedOrders}`);

    // Check missing links
    const { count: missingLinks } = await supabase.from('tiny_orders').select('*', { count: 'exact', head: true }).is('numero_pedido_ecommerce', null);
    console.log(`  Missing Ecommerce IDs: ${missingLinks} (Should be 0)`);


    console.log('\n=== 4. Fee Calculation Sampling (Expected Values) ===');
    // Sample 5 random Shopee orders from August 2025 to verify historical data
    const { data: sampleOrders } = await supabase
        .from('tiny_orders')
        .select(`
            *,
            tiny_pedido_itens (
                quantidade
            )
        `)
        .ilike('canal', '%shopee%') // Filter for Shopee
        .gte('data_criacao', '2025-08-01')
        .lte('data_criacao', '2025-08-31')
        .limit(5);

    if (sampleOrders) {
        for (const order of sampleOrders) {
            console.log(`\n  Order #${order.numero_pedido} (${order.data_criacao})`);
            console.log(`    Channel: ${order.canal}`);
            console.log(`    Value: ${order.valor_total_pedido}`);
            // @ts-ignore
            console.log(`    Items: ${order.tiny_pedido_itens?.length} rows`);

            // Calculate item count
            // @ts-ignore
            const productCount = order.tiny_pedido_itens?.reduce((acc: number, item: any) => acc + (item.quantidade || 1), 0) || 1;
            console.log(`    Total Units: ${productCount}`);

            const normalizedChannel = (order.canal || '').toLowerCase();
            let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | null = null;

            if (normalizedChannel.includes('shopee')) marketplace = 'shopee';
            else if (normalizedChannel.includes('mercado')) marketplace = 'mercado_livre';
            else if (normalizedChannel.includes('magalu')) marketplace = 'magalu';

            if (marketplace) {
                try {
                    const fees = await calculateMarketplaceFees({
                        marketplace,
                        orderValue: order.valor_total_pedido,
                        productCount: productCount,
                        orderDate: new Date(order.data_criacao)
                    });

                    console.log(`    [Calculation] Gross: ${fees.grossValue.toFixed(2)}`);
                    console.log(`    [Calculation] Fees: -${fees.totalFees.toFixed(2)} (Comm: ${fees.commissionFee.toFixed(2)}, Fixed: ${fees.fixedCost.toFixed(2)})`);
                    console.log(`    [Calculation] Expected Net: ${fees.netValue.toFixed(2)}`);

                    // Try to find actual payment
                    const { data: payment } = await supabase
                        .from('marketplace_payments')
                        .select('net_amount, gross_amount')
                        .eq('marketplace_order_id', order.numero_pedido_ecommerce)
                        .maybeSingle();

                    if (payment) {
                        console.log(`    [Actual Payment] Gross: ${payment.gross_amount}, Net: ${payment.net_amount}`);
                        const diff = Math.abs(fees.netValue - payment.net_amount);
                        if (diff < 0.1) console.log(`    ✅ MATCH (Diff: ${diff.toFixed(2)})`);
                        else console.log(`    ⚠️ MISMATCH (Diff: ${diff.toFixed(2)})`);
                    } else {
                        console.log(`    [Actual Payment] Not found for this order ID yet`);
                    }

                } catch (e: any) {
                    console.log(`    Calculation Error: ${e.message}`);
                }
            } else {
                console.log('    Skipping calculation (unknown marketplace)');
            }
        }
    }
}

verifyIntegrity().catch(console.error);
