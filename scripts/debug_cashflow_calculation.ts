
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables manually since we are running a script
const envPath = path.resolve(process.cwd(), '.env.vercel');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
} else {
    // try .env.local
    dotenv.config({ path: '.env.local' });
}

// Setup Supabase
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Mock helpers from route.ts
const MARKETPLACE_DUE_DAYS: Record<string, number> = {
    'shopee': 14,
    'mercado': 15,
    'meli': 15,
    'magalu': 30,
    'magazine': 30,
    'default': 30,
};

function getDueDays(canal: string | null): number {
    if (!canal) return MARKETPLACE_DUE_DAYS.default;
    const lowerCanal = canal.toLowerCase();
    for (const [key, days] of Object.entries(MARKETPLACE_DUE_DAYS)) {
        if (key !== 'default' && lowerCanal.includes(key)) {
            return days;
        }
    }
    return MARKETPLACE_DUE_DAYS.default;
}

function calculateDueDate(orderDate: Date, canal: string | null): Date {
    const dueDays = getDueDays(canal);
    const dueDate = new Date(orderDate);
    dueDate.setDate(dueDate.getDate() + dueDays);
    return dueDate;
}

async function runDebug() {
    console.log('--- Starting Debug of Cash Flow Calculation ---');

    // Dynamic import to ensure env vars are loaded
    const { calculateMarketplaceFees } = await import('../lib/marketplace-fees');

    // 1. Fetch a few pending orders to test
    const { data: orders, error } = await supabase
        .from('tiny_orders')
        .select(`
            id,
            tiny_id,
            numero_pedido,
            valor_total_pedido, 
            valor, 
            payment_received, 
            data_criacao, 
            canal,
            marketplace_payment_id,
            marketplace_payments!marketplace_payments_tiny_order_id_fkey (
                net_amount,
                is_expense
            ),
            marketplace_order_links (
                product_count,
                is_kit,
                uses_free_shipping,
                is_campaign_order,
                marketplace_order_id
            ),
            valor_frete,
            fee_overrides
        `)
        .or('payment_received.is.null,payment_received.eq.false') // Pending
        .order('data_criacao', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Fetched ${orders.length} pending orders for verification.`);

    // Check links manually
    const tinyIds = orders.map(o => o.id);
    const { data: links, error: linkError } = await supabase
        .from('marketplace_order_links')
        .select('*')
        .in('tiny_order_id', tinyIds);

    if (linkError) {
        console.error('Error checking links:', linkError);
    }

    console.log('Manual check for marketplace_order_links:', links?.length || 0, 'links found for', tinyIds.length, 'orders.');
    if (!links || links.length === 0) {
        console.warn('WARNING: No links found! Is the sync running?');
    } else {
        console.log('Links found:', links);
    }

    for (const o of orders) {
        console.log(`\nProcessing Order #${o.numero_pedido} (${o.canal})`);
        console.log(`  - Tiny ID: ${o.id}`);
        console.log(`  - Original Value (Tiny): ${o.valor_total_pedido}`);
        console.log(`  - Valor Field: ${o.valor}`);
        console.log(`  - Freight: ${o.valor_frete}`);

        const vTotal = Number(o.valor || o.valor_total_pedido || 0);
        const vFrete = Number(o.valor_frete || 0);
        const valorOriginal = vTotal;
        const baseTaxas = Math.max(0, vTotal - vFrete);

        // Calculate
        const canal = o.canal?.toLowerCase() || '';
        let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;
        if (canal.includes('shopee')) marketplace = 'shopee';
        else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
        else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

        let calculatedNet = 0;
        let feeBreakdown = null;
        let usedEstimated = false;

        if (marketplace) {
            try {
                const linkData = o.marketplace_order_links?.[0] as any;
                console.log(`  - Marketplace detected: ${marketplace}`);
                console.log(`  - Link Data (from join):`, linkData);

                // If manual check found a link, print it
                const manualLink = links?.find(l => l.tiny_order_id === o.id);
                if (manualLink) {
                    console.log(`  - Link Data (manual check):`, manualLink);
                }

                const feeCalc = await calculateMarketplaceFees({
                    marketplace,
                    orderValue: baseTaxas,
                    productCount: linkData?.product_count || manualLink?.product_count || 1,
                    isKit: linkData?.is_kit || manualLink?.is_kit || false,
                    usesFreeShipping: (o.fee_overrides as any)?.usesFreeShipping ?? (linkData?.uses_free_shipping || manualLink?.uses_free_shipping || false),
                    isCampaignOrder: linkData?.is_campaign_order || manualLink?.is_campaign_order || false,
                    orderDate: new Date(o.data_criacao || new Date())
                });

                calculatedNet = feeCalc.netValue;
                feeBreakdown = feeCalc;
                usedEstimated = true;

                console.log(`  -> Calculated Net Value: ${calculatedNet.toFixed(2)}`);
                console.log(`  -> Commission: ${feeCalc.commissionFee.toFixed(2)} (${feeCalc.breakdown.commissionRate}%)`);
                console.log(`  -> Fixed Cost: ${feeCalc.fixedCost.toFixed(2)}`);
                console.log(`  -> Campaign Fee: ${feeCalc.campaignFee?.toFixed(2) || 0}`);
                console.log(`  -> Total Fees: ${feeCalc.totalFees.toFixed(2)}`);

            } catch (e) {
                console.error('  -> Error calculating fees:', e);
                calculatedNet = valorOriginal;
            }
        } else {
            console.log('  -> No marketplace detected, using Original Value');
            calculatedNet = valorOriginal;
        }

        console.log(`  => Final Summary Value: ${calculatedNet.toFixed(2)}`);
    }

    console.log('\n--- End of Debug ---');
}

runDebug();
