
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables first
dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });

async function runVerification() {
    console.log('--- Shopee Global Config Verification ---\n');

    // Dynamic imports to ensure env vars are loaded
    const { createClient } = await import('@supabase/supabase-js');
    const { calculateMarketplaceFees, clearFeeConfigCache } = await import('../lib/marketplace-fees');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Prepare Test Config
    const testConfig = {
        base_commission: 14,
        free_shipping_commission: 20,
        participates_in_free_shipping: true, // Global toggle ON
        campaign_fee_default: 2,
        campaign_fee_nov_dec: 3,
        campaign_start_date: '2024-12-01T00:00',
        campaign_end_date: '2024-12-31T23:59',
        fixed_cost_per_product: 4
    };

    console.log('Updating Shopee global config for testing...');
    const { error: updateError } = await supabase
        .from('marketplace_fee_config')
        .update({ config: testConfig })
        .eq('marketplace', 'shopee');

    if (updateError) {
        console.error('Failed to update test config:', updateError);
        return;
    }

    clearFeeConfigCache('shopee'); // Ensure fresh config

    // 2. Test Case 1: Global Free Shipping ACTIVE, no manual override
    console.log('\nCase 1: Global Free Shipping ON (Expected: 20%)');
    const result1 = await calculateMarketplaceFees({
        marketplace: 'shopee',
        orderValue: 100,
        productCount: 1,
        orderDate: new Date('2024-10-15T12:00:00') // Non-campaign date
    });
    console.log(`Commission Rate: ${result1.breakdown.commissionRate}%`);
    if (result1.breakdown.commissionRate === 20) {
        console.log('✅ OK');
    } else {
        console.error('❌ FAILED: Expected 20%');
    }

    // 3. Test Case 2: Campaign Date Range (Inside range)
    console.log('\nCase 2: Inside Campaign Range (Expected: 3%)');
    const result2 = await calculateMarketplaceFees({
        marketplace: 'shopee',
        orderValue: 100,
        productCount: 1,
        isCampaignOrder: true,
        orderDate: new Date('2024-12-15T12:00:00') // Inside campaign range
    });
    console.log(`Campaign Rate: ${result2.breakdown.campaignRate}%`);
    if (result2.breakdown.campaignRate === 3) {
        console.log('✅ OK');
    } else {
        console.error('❌ FAILED: Expected 3%');
    }

    // 4. Test Case 3: Outside Campaign Range (Outside range)
    console.log('\nCase 3: Outside Campaign Range (Expected: 2%)');
    const result3 = await calculateMarketplaceFees({
        marketplace: 'shopee',
        orderValue: 100,
        productCount: 1,
        isCampaignOrder: true,
        orderDate: new Date('2024-11-15T12:00:00') // Outside campaign range
    });
    console.log(`Campaign Rate: ${result3.breakdown.campaignRate}%`);
    if (result3.breakdown.campaignRate === 2) {
        console.log('✅ OK');
    } else {
        console.error('❌ FAILED: Expected 2%');
    }

    // 5. Test Case 4: Manual Override (Force 14% even if global is 20%)
    console.log('\nCase 4: Manual Override (usesFreeShipping: false) -> Expected: 14%');
    const result4 = await calculateMarketplaceFees({
        marketplace: 'shopee',
        orderValue: 100,
        productCount: 1,
        usesFreeShipping: false,
        orderDate: new Date('2024-10-15T12:00:00')
    });
    console.log(`Commission Rate: ${result4.breakdown.commissionRate}%`);
    if (result4.breakdown.commissionRate === 14) {
        console.log('✅ OK');
    } else {
        console.error('❌ FAILED: Expected 14%');
    }

    console.log('\n--- Verification Finished ---');
}

runVerification().catch(console.error);
