
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Fee Calculation Logic (Duplicated from lib/marketplace-fees.ts to avoid import issues in standalone script)
async function calculateFees(order: any) {
    const canal = order.canal?.toLowerCase() || '';
    let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;

    if (canal.includes('shopee')) marketplace = 'shopee';
    else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
    else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

    if (!marketplace) return null;

    // Fetch config (Mocking for test simplicity or fetching raw)
    const { data: configData } = await supabase
        .from('marketplace_fee_config')
        .select('config')
        .eq('marketplace', marketplace)
        .single();

    const config = configData?.config || {};
    const grossValue = Math.max(0, Number(order.valor || order.valor_total_pedido || 0) - Number(order.valor_frete || 0));

    let fee = 0;

    // Simplistic calculation for test verification
    if (marketplace === 'shopee') {
        const rate = (order.marketplace_order_links?.[0]?.uses_free_shipping
            ? config.free_shipping_commission
            : config.base_commission) || 14;
        fee = (grossValue * rate) / 100 + (config.fixed_cost_per_product || 3);
    } else if (marketplace === 'magalu') {
        fee = (grossValue * (config.commission_rate || 16)) / 100 + (config.fixed_cost || 3);
    } else {
        fee = (grossValue * (config.premium_commission || 16)) / 100 + (config.fixed_cost || 5);
    }

    return {
        grossValue,
        totalFees: fee,
        netValue: grossValue - fee
    };
}

async function run() {
    console.log('Starting backfill test...');

    // Fetch 5 recent orders
    const { data: orders, error } = await supabase
        .from('tiny_orders')
        .select(`
            id,
            numero_pedido,
            canal,
            valor_total_pedido,
            valor,
            valor_frete,
            marketplace_order_links(
                uses_free_shipping
            )
        `)
        .not('canal', 'is', null)
        .order('data_criacao', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Found ${orders.length} orders to test.`);

    for (const order of orders) {
        console.log(`Testing Order #${order.numero_pedido} (${order.canal}) - Valor: ${order.valor_total_pedido}`);
        const result = await calculateFees(order);
        if (result) {
            console.log(`  -> Calculated Fees: ${result.totalFees.toFixed(2)}`);
            console.log(`  -> Net Value: ${result.netValue.toFixed(2)}`);
        } else {
            console.log('  -> Skipped (Not marketplace)');
        }
    }
}

run();
