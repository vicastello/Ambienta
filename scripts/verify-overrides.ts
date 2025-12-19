import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });

async function verify() {
    // Dynamically import dependencies after dotenv is configured
    const { createClient } = await import('@supabase/supabase-js');
    const { calculateMarketplaceFees } = await import('../lib/marketplace-fees');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const testOrderId = 126672; // ID for order 23993 (251206MK17CQ8R)
    console.log('Verifying order:', testOrderId);

    // 1. Set a manual override for Free Shipping Toggle
    const overrides = {
        usesFreeShipping: true
    };

    console.log('Setting manual overrides for Free Shipping:', overrides);
    const { error: updateError } = await supabase
        .from('tiny_orders')
        .update({ fee_overrides: overrides })
        .eq('id', testOrderId);

    if (updateError) {
        console.error('Error updating overrides:', updateError);
        return;
    }

    // 2. Simulate API logic
    const { data: order, error: fetchError } = await supabase
        .from('tiny_orders')
        .select('fee_overrides, valor, valor_total_pedido, valor_frete, canal, data_criacao')
        .eq('id', testOrderId)
        .single();

    if (fetchError) {
        console.error('Error fetching order:', fetchError);
        return;
    }

    const vTotal = Number(order.valor || order.valor_total_pedido || 0);
    const vFrete = Number(order.valor_frete || 0);
    const baseTaxas = Math.max(0, vTotal - vFrete);
    const overridesData = order.fee_overrides as any;

    console.log('--- Order Details ---');
    console.log('Canal:', order.canal);
    console.log('Base Value for Fees:', baseTaxas);

    const feeCalc = await calculateMarketplaceFees({
        marketplace: 'shopee',
        orderValue: baseTaxas,
        usesFreeShipping: overridesData.usesFreeShipping ?? false,
        orderDate: new Date(order.data_criacao || new Date()),
    });

    // Apply manual overrides (if any specific fee components were set)
    if (overridesData.commissionFee !== undefined) feeCalc.commissionFee = Number(overridesData.commissionFee);
    if (overridesData.fixedCost !== undefined) feeCalc.fixedCost = Number(overridesData.fixedCost);
    if (overridesData.campaignFee !== undefined) feeCalc.campaignFee = Number(overridesData.campaignFee);

    feeCalc.totalFees = feeCalc.commissionFee + (feeCalc.campaignFee || 0) + feeCalc.fixedCost;
    feeCalc.netValue = feeCalc.grossValue - feeCalc.totalFees;

    console.log('--- Calculation Verification ---');
    console.log('Commission Rate Applied:', feeCalc.breakdown.commissionRate + '%');
    console.log('Commission Fee:', feeCalc.commissionFee.toFixed(2));
    console.log('Total Fees:', feeCalc.totalFees.toFixed(2));
    console.log('Net Value (Expected):', feeCalc.netValue.toFixed(2));

    if (feeCalc.breakdown.commissionRate === 20) {
        console.log('✅ SUCCESS: 20% commission applied correctly due to Free Shipping Toggle.');
    } else {
        console.log('❌ FAILURE: Commission rate is not 20%.');
    }
}

verify().catch(console.error);
