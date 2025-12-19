#!/usr/bin/env node
/**
 * Script to resync recent orders from Tiny to fix date issues.
 * The extrairDataISO bug was storing dates shifted by 1 day.
 * 
 * Run: node scripts/fix-order-dates.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.vercel.production.local from project root (has Supabase credentials)
config({ path: resolve(__dirname, '..', '.env.vercel.production.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE env vars');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Format as YYYY-MM-DD using local timezone
function formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Extract date without timezone conversion (the fix!)
function extrairDataISOFixed(dataStr) {
    if (!dataStr) return null;
    const raw = String(dataStr).trim();
    if (!raw) return null;

    // ISO-like: extract directly
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        return raw.slice(0, 10);
    }

    // dd/MM/yyyy format
    const m = raw.match(/^([0-3]?\d)\/([0-1]?\d)\/(\d{4})/);
    if (m) {
        const dd = m[1].padStart(2, '0');
        const MM = m[2].padStart(2, '0');
        const yyyy = m[3];
        return `${yyyy}-${MM}-${dd}`;
    }

    return null;
}

async function main() {
    console.log('🔄 Starting date fix...\n');

    // Calculate date range: last 7 days
    const now = new Date();
    const daysBack = 7;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);

    const dataInicial = formatDate(startDate);
    const dataFinal = formatDate(now);

    console.log(`📅 Fixing orders from ${dataInicial} to ${dataFinal}...\n`);

    // Fetch orders that might need fixing (with raw data)
    const { data: orders, error } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_id, data_criacao, raw')
        .gte('data_criacao', dataInicial)
        .lte('data_criacao', dataFinal)
        .limit(500);

    if (error) {
        console.error('❌ Error fetching orders:', error.message);
        process.exit(1);
    }

    console.log(`📦 Found ${orders?.length || 0} orders to check\n`);

    if (!orders?.length) {
        console.log('No orders to update.');
        return;
    }

    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    for (const order of orders) {
        if (!order.raw?.dataCriacao) {
            unchanged++;
            continue;
        }

        // Extract correct date from raw data
        const correctDate = extrairDataISOFixed(order.raw.dataCriacao);

        if (!correctDate) {
            unchanged++;
            continue;
        }

        // Check if different
        if (correctDate === order.data_criacao) {
            unchanged++;
            continue;
        }

        // Update with correct date
        try {
            const { error: updateError } = await supabaseAdmin
                .from('tiny_orders')
                .update({ data_criacao: correctDate })
                .eq('id', order.id);

            if (updateError) {
                console.error(`❌ Error updating id ${order.id}:`, updateError.message);
                errors++;
            } else {
                console.log(`✅ Fixed id ${order.id}: ${order.data_criacao} → ${correctDate}`);
                updated++;
            }
        } catch (e) {
            console.error(`❌ Exception updating id ${order.id}:`, e.message);
            errors++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Unchanged: ${unchanged}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${orders.length}`);
}

main()
    .then(() => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Fatal error:', err);
        process.exit(1);
    });
