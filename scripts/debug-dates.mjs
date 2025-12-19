#!/usr/bin/env node
/**
 * Debug script to check date values in database vs what Tiny sends
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '..', '.env.vercel.production.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl.trim(), supabaseServiceKey.trim());

async function main() {
    console.log('🔍 Checking recent orders for date discrepancies...\n');

    // Get most recent 20 orders
    const { data: orders, error } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_id, data_criacao, numero_pedido, raw')
        .order('data_criacao', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }

    console.log('Recent orders:\n');
    console.log('| Numero | DB data_criacao | Raw dataCriacao | Match? |');
    console.log('|--------|-----------------|-----------------|--------|');

    for (const order of orders) {
        const dbDate = order.data_criacao;
        const rawDate = order.raw?.dataCriacao || 'N/A';
        const match = dbDate === rawDate?.slice?.(0, 10) ? '✅' : '❌';
        console.log(`| ${order.numero_pedido || 'N/A'} | ${dbDate} | ${rawDate} | ${match} |`);
    }

    // Also check for today's date specifically
    console.log('\n\n📅 Checking for orders from TODAY (2025-12-18)...');

    const { data: todayOrders, error: todayError } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_id, data_criacao, numero_pedido')
        .eq('data_criacao', '2025-12-18')
        .limit(10);

    if (!todayError && todayOrders) {
        console.log(`Found ${todayOrders.length} orders with data_criacao = 2025-12-18`);
        todayOrders.forEach(o => console.log(`  - ${o.numero_pedido}`));
    }

    console.log('\n📅 Checking for orders from YESTERDAY (2025-12-17)...');

    const { data: yesterdayOrders, error: yesterdayError } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_id, data_criacao, numero_pedido')
        .eq('data_criacao', '2025-12-17')
        .limit(10);

    if (!yesterdayError && yesterdayOrders) {
        console.log(`Found ${yesterdayOrders.length} orders with data_criacao = 2025-12-17`);
        yesterdayOrders.forEach(o => console.log(`  - ${o.numero_pedido}`));
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
