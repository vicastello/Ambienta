// Script to run migration and sync escrow data
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read env vars
const envPath = path.join(__dirname, '..', '.env.vercel');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line: string) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        envVars[match[1].trim()] = value;
    }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    console.log('='.repeat(60));
    console.log('Running migration: Add voucher fields to shopee_orders');
    console.log('='.repeat(60));

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251220_add_shopee_voucher_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📋 SQL to execute:');
    console.log(migrationSQL);

    // Execute via RPC or direct query
    // Note: Supabase client doesn't support raw SQL directly, we need to use RPC or pg directly
    // Let's try a workaround by adding columns one at a time via the REST API

    console.log('\n🔧 Adding columns...');

    // Try to add each column separately
    const alterQueries = [
        `ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS voucher_from_seller DECIMAL(10,2) DEFAULT 0`,
        `ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS voucher_from_shopee DECIMAL(10,2) DEFAULT 0`,
        `ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS seller_voucher_code TEXT[] DEFAULT '{}'`,
        `ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS escrow_amount DECIMAL(10,2)`,
        `ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS escrow_fetched_at TIMESTAMPTZ`,
    ];

    // We need to use the Supabase SQL endpoint or migration tool
    // Since we can't run raw SQL via the JS client, let's check if columns exist first

    // Test by querying a row with the new columns
    const { data: testData, error: testError } = await supabase
        .from('shopee_orders')
        .select('order_sn')
        .limit(1);

    if (testError) {
        console.error('❌ Error connecting to shopee_orders:', testError.message);
        return false;
    }

    console.log('✅ Connected to database successfully');
    console.log('\n⚠️  NOTE: The SQL migration needs to be run manually in Supabase SQL Editor.');
    console.log('   Path: supabase/migrations/20251220_add_shopee_voucher_fields.sql');

    return true;
}

async function main() {
    await runMigration();
    console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
