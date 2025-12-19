
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

async function calculateFees(order: any, configMap: any) {
    const canal = order.canal?.toLowerCase() || '';
    let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;

    if (canal.includes('shopee')) marketplace = 'shopee';
    else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
    else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

    if (!marketplace) return null;

    const config = configMap[marketplace];
    if (!config) return null;

    const grossValue = Math.max(0, Number(order.valor || order.valor_total_pedido || 0) - Number(order.valor_frete || 0));

    let commissionFee = 0;
    let campaignFee = 0;
    let fixedCost = 0;
    let breakdown: any = {};

    if (marketplace === 'shopee') {
        const linkData = order.marketplace_order_links?.[0];
        const usesFreeShipping = linkData?.uses_free_shipping || false;
        const isCampaign = linkData?.is_campaign_order || false;
        const isKit = linkData?.is_kit || false;
        const productCount = linkData?.product_count || 1;
        const orderDate = new Date(order.data_criacao || new Date());

        const commissionRate = usesFreeShipping
            ? config.free_shipping_commission
            : config.base_commission;

        commissionFee = (grossValue * commissionRate) / 100;

        if (isCampaign) {
            const month = orderDate.getMonth();
            const campaignRate = (month === 10 || month === 11)
                ? config.campaign_fee_nov_dec
                : config.campaign_fee_default;
            campaignFee = (grossValue * campaignRate) / 100;
            breakdown.campaignRate = campaignRate;
        }

        const units = isKit ? 1 : productCount;
        fixedCost = config.fixed_cost_per_product * units;

        breakdown.commissionRate = commissionRate;
        breakdown.fixedCostPerUnit = config.fixed_cost_per_product;
        breakdown.units = units;

    } else if (marketplace === 'magalu') {
        const rate = config.commission || 14.5;
        commissionFee = (grossValue * rate) / 100;
        fixedCost = config.fixed_cost || 4.00;

        breakdown.commissionRate = rate;
        breakdown.fixedCost = fixedCost;

    } else if (marketplace === 'mercado_livre') {
        // Simplified Logic for Backfill (assuming standard)
        // Ideally should check listing type, but we default to premium if unknown
        const rate = config.premium_commission || 16.5;
        commissionFee = (grossValue * rate) / 100;

        // Fixed cost logic
        const tiers = config.fixed_cost_tiers || [];
        // Sort tiers by min desc? No, usually check ranges.
        // Simplified based on lib logic:
        /*
          {"max": 12.50, "cost": 3.125},
          {"min": 12.50, "max": 29, "cost": 6.25},
          ...
        */
        // Find tier
        const tier = tiers.find((t: any) => {
            if (t.min && grossValue < t.min) return false;
            if (t.max && grossValue >= t.max) return false;
            return true;
        });

        fixedCost = tier ? tier.cost : 0;

        breakdown.commissionRate = rate;
        breakdown.fixedCost = fixedCost;
    }

    const totalFees = commissionFee + campaignFee + fixedCost;
    const netValue = grossValue - totalFees;

    return {
        grossValue,
        commissionFee,
        campaignFee,
        fixedCost,
        totalFees,
        netValue,
        breakdown
    };
}

async function run() {
    console.log('Starting full backfill...');

    // 1. Fetch Configs
    const { data: configs } = await supabase.from('marketplace_fee_config').select('*');
    const configMap: any = {};
    configs?.forEach(c => configMap[c.marketplace] = c.config);

    console.log('Loaded configs for:', Object.keys(configMap).join(', '));

    let processed = 0;
    let errors = 0;
    let offset = 0;
    const batchSize = 100;

    while (true) {
        console.log(`Fetching batch offset ${offset}...`);

        const { data: orders, error } = await supabase
            .from('tiny_orders')
            .select(`
                id,
                numero_pedido,
                canal,
                valor_total_pedido,
                valor,
                valor_frete,
                data_criacao,
                marketplace_order_links(
                    product_count,
                    is_kit,
                    uses_free_shipping,
                    is_campaign_order
                ),
                marketplace_payments!tiny_orders_marketplace_payment_id_fkey(
                   net_amount
                )
            `)
            .not('canal', 'is', null)
            .order('data_criacao', { ascending: false })
            .range(offset, offset + batchSize - 1);

        if (error) {
            console.error('Error fetching orders:', error);
            break;
        }

        if (!orders || orders.length === 0) {
            console.log('No more orders.');
            break;
        }

        console.log(`Processing ${orders.length} orders...`);

        // Process batch in parallel chunks
        const promises = orders.map(async (order) => {
            try {
                const orderValue = Math.max(0, Number(order.valor || order.valor_total_pedido || 0) - Number(order.valor_frete || 0));
                if (orderValue <= 0) return;

                const feeCalc = await calculateFees(order, configMap);
                if (!feeCalc) return;

                const receivedValue = order.marketplace_payments?.[0]?.net_amount
                    ? Number(order.marketplace_payments[0].net_amount)
                    : null;

                const difference = receivedValue !== null
                    ? receivedValue - feeCalc.netValue
                    : null;

                const { error: updateError } = await supabase
                    .from('tiny_orders')
                    .update({
                        valor_esperado_liquido: feeCalc.netValue,
                        diferenca_valor: difference,
                        fees_breakdown: feeCalc
                    })
                    .eq('id', order.id);

                if (updateError) {
                    console.error(`Error updating order ${order.id}:`, updateError.message);
                    errors++;
                } else {
                    processed++;
                }
            } catch (err) {
                console.error(`Error processing order ${order.id}:`, err);
                errors++;
            }
        });

        await Promise.all(promises);

        offset += orders.length;
        console.log(`Progress: ${processed} processed, ${errors} errors`);

        // Safety break
        if (processed > 5000) {
            console.log('Processed 5000 items, stopping for safety.');
            break;
        }
    }

    console.log('Backfill complete.');
    console.log(`Total Processed: ${processed}`);
    console.log(`Total Errors: ${errors}`);
}

run();
