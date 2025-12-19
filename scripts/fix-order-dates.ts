#!/usr/bin/env npx ts-node
/**
 * Script to resync recent orders from Tiny to fix date issues.
 * The extrairDataISO bug was storing dates shifted by 1 day.
 * 
 * Run: npx ts-node --skip-project scripts/fix-order-dates.ts
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { listarPedidosTinyPorPeriodo } from '../lib/tinyApi';
import { mapPedidoToOrderRow } from '../lib/tinyMapping';

async function main() {
    console.log('🔄 Starting date fix resync...\n');

    // Get Tiny access token
    const accessToken = await getAccessTokenFromDbOrRefresh();
    console.log('✅ Got Tiny access token\n');

    // Calculate date range: last 7 days
    const now = new Date();
    const daysBack = 7;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);

    // Format as YYYY-MM-DD using local timezone
    const formatDate = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const dataInicial = formatDate(startDate);
    const dataFinal = formatDate(now);

    console.log(`📅 Fetching orders from ${dataInicial} to ${dataFinal}...\n`);

    // Fetch orders from Tiny
    const response = await listarPedidosTinyPorPeriodo(accessToken, {
        dataInicial,
        dataFinal,
        limit: 500
    });

    const pedidos = response?.itens || [];
    console.log(`📦 Found ${pedidos.length} orders from Tiny\n`);

    if (pedidos.length === 0) {
        console.log('No orders to update.');
        return;
    }

    // Update each order in the database
    let updated = 0;
    let errors = 0;

    for (const p of pedidos) {
        const row = mapPedidoToOrderRow(p);

        if (!row.tiny_id || !row.data_criacao) {
            console.log(`⏭️ Skipping order without tiny_id or date`);
            continue;
        }

        try {
            const { error } = await supabaseAdmin
                .from('tiny_orders')
                .update({
                    data_criacao: row.data_criacao,
                    // Also update raw to include correct mapping
                    raw: row.raw as any
                })
                .eq('tiny_id', row.tiny_id);

            if (error) {
                console.error(`❌ Error updating tiny_id ${row.tiny_id}:`, error.message);
                errors++;
            } else {
                console.log(`✅ Updated tiny_id ${row.tiny_id}: data_criacao = ${row.data_criacao}`);
                updated++;
            }
        } catch (e: any) {
            console.error(`❌ Exception updating tiny_id ${row.tiny_id}:`, e.message);
            errors++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${pedidos.length}`);
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
