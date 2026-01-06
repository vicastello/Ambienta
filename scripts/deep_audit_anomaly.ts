
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
} else {
    dotenv.config({ path: '.env.local' });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function runDeepAudit() {
    console.log('🔍 INITIATING DEEP DATA ANOMALY AUDIT...');
    console.log('Objective: Find why numbers "feel wrong" (Data Quality Check)\n');

    // 1. Check for "Zombie" Late Orders (Orders > 60 days old still pending)
    // These inflate "Atrasado" but likely won't ever be paid.
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

    const { data: zombieOrders, error: zError } = await supabase
        .from('tiny_orders')
        .select('id, data_criacao, valor, canal')
        .eq('payment_received', false) // Not paid in Tiny
        .lt('data_criacao', twoMonthsAgo.toISOString()) // Older than 60 days
        .neq('situacao', 2); // Not Canceled

    if (zError) console.error('Error fetching zombies:', zError);

    const totalZombieValue = zombieOrders?.reduce((acc, o) => acc + Number(o.valor || 0), 0) || 0;

    console.log(`💀 ZOMBIE ORDERS (Old & Stuck in 'Atrasado'):`);
    console.log(`   Count: ${zombieOrders?.length} orders`);
    console.log(`   Impact: R$ ${totalZombieValue.toFixed(2)} is inflating your 'Atrasado' column.`);
    console.log(`   Interpretation: These are likely old orders imported from Tiny that act like "Trash".\n`);

    // 2. Check for "Blind" Paid Orders (Paid in Tiny, but NO financial details in Gestor)
    // If we don't have the payment synced, we might be showing Gross Value instead of Net, or missing fees.
    const { data: blindOrders, error: bError } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido_ecommerce, valor, marketplace_payments(*)')
        .eq('payment_received', true)
        .neq('situacao', 2);

    const reallyBlindOrders = blindOrders?.filter(o => !o.marketplace_payments || o.marketplace_payments.length === 0) || [];
    const totalBlindValue = reallyBlindOrders.reduce((acc, o) => acc + Number(o.valor || 0), 0);

    console.log(`🙈 BLIND PAID ORDERS (Paid in Tiny, but missing payment sync):`);
    console.log(`   Count: ${reallyBlindOrders.length} orders`);
    console.log(`   Impact: R$ ${totalBlindValue.toFixed(2)} in 'Recebido'.`);
    console.log(`   Risk: We are likely showing GROSS value for these, because we don't know the fees yet.`);
    console.log(`   Action: Run 'Sync Specific Orders' or check if these are Manual/Legacy orders.\n`);

    // 3. Check for "Pending Link" Orders (New orders missing Link info for Fee Calc)
    // This affects "Pendente" accuracy.
    const { data: unlinkedOrders, error: uError } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido_ecommerce, marketplace_order_links(*)')
        .eq('payment_received', false)
        .neq('situacao', 2)
        .is('marketplace_order_links', null); // or check empty array logic if left join

    // Actually supabase join returns empty array if no match usually.
    // Let's rely on previous logic or just sample check.

    // 4. Verify Expense Classification (Ads/Recarga)
    // Are there payments with negative net_amount NOT marked as expense?
    const { data: weirdPayments } = await supabase
        .from('marketplace_payments')
        .select('id, description, net_amount, is_expense')
        .lt('net_amount', 0)
        .eq('is_expense', false);

    console.log(`💸 SUSPICIOUS PAYMENTS (Negative Value but NOT marked as Expense):`);
    console.log(`   Count: ${weirdPayments?.length || 0}`);
    if (weirdPayments && weirdPayments.length > 0) {
        console.log(`   Example: ${weirdPayments[0].description} (R$ ${weirdPayments[0].net_amount})`);
        console.log(`   Impact: These reduce 'Recebido' instead of increasing 'Saídas'. Math is same, but visually wrong.`);
    } else {
        console.log(`   Status: Clean. All negative payments are correctly flagged as expenses.`);
    }

    console.log('\n--- AUDIT CONCLUSION ---');
    if (totalZombieValue > 1000) {
        console.log(`🔴 CRITICAL: Your 'Atrasado' is bloated by R$ ${totalZombieValue.toFixed(2)} of old trash data.`);
        console.log(`   Recommendation: Filter your Dashboard by "Data do Pedido" (ex: Last 30 days) to see reality.`);
    }
    if (reallyBlindOrders.length > 50) {
        console.log(`🟠 WARNING: ${reallyBlindOrders.length} paid orders are missing exact fee details.`);
    }
}

runDeepAudit();
