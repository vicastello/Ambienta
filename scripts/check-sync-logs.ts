import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.vercel manually
const envPath = join(process.cwd(), '.env.vercel');
const envContent = readFileSync(envPath, 'utf-8');
const lines = envContent.split('\n');

for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
            const [, key, value] = match;
            const cleanValue = value.replace(/^["']|["']$/g, '');
            process.env[key.trim()] = cleanValue;
        }
    }
}

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkSyncLogs() {
    console.log('🔍 Verificando logs de sync desde 15/11/2025...\n');

    // 1. Verificar erros nos logs
    const { data: errorLogs, error: errorLogsErr } = await supabaseAdmin
        .from('sync_logs')
        .select('*')
        .eq('level', 'error')
        .gte('created_at', '2025-11-15T00:00:00')
        .order('created_at', { ascending: false })
        .limit(20);

    if (errorLogsErr) {
        console.error('❌ Erro ao buscar logs de erro:', errorLogsErr);
    } else if (errorLogs && errorLogs.length > 0) {
        console.log(`❌ Encontrados ${errorLogs.length} erros desde 15/11:`);
        errorLogs.forEach((log) => {
            console.log(`  📅 ${log.created_at}`);
            console.log(`  📝 ${log.message}`);
            console.log(`  🔍 Meta:`, JSON.stringify(log.meta, null, 2));
            console.log('  ---');
        });
    } else {
        console.log('✅ Nenhum erro encontrado nos logs desde 15/11');
    }

    console.log('\n---\n');

    // 2. Verificar últimos jobs de sync
    const { data: syncJobs, error: syncJobsErr } = await supabaseAdmin
        .from('sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (syncJobsErr) {
        console.error('❌ Erro ao buscar jobs:', syncJobsErr);
    } else if (syncJobs && syncJobs.length > 0) {
        console.log(`📊 Últimos ${syncJobs.length} jobs de sync:`);
        syncJobs.forEach((job) => {
            console.log(`  📅 ${job.created_at} - Status: ${job.status}`);
            console.log(`  🔧 Params:`, JSON.stringify(job.params, null, 2));
            if (job.error) {
                console.log(`  ❌ Erro: ${job.error}`);
            }
            console.log(`  📈 Total orders: ${job.total_orders}, Requests: ${job.total_requests}`);
            console.log('  ---');
        });
    } else {
        console.log('❌ Nenhum job de sync encontrado');
    }

    console.log('\n---\n');

    // 3. Verificar últimos pedidos importados
    const { data: lastOrders, error: lastOrdersErr } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, dataPedido, dataCriacao, dataAtualizacao, numeroEcommerce, canal, created_at')
        .order('dataPedido', { ascending: false })
        .limit(10);

    if (lastOrdersErr) {
        console.error('❌ Erro ao buscar pedidos:', lastOrdersErr);
    } else if (lastOrders && lastOrders.length > 0) {
        console.log(`📦 Últimos ${lastOrders.length} pedidos no banco:`);
        lastOrders.forEach((order) => {
            console.log(`  📅 Data Pedido: ${order.dataPedido} | Canal: ${order.canal || 'N/A'}`);
            console.log(`  🆔 ID: ${order.id} | E-commerce: ${order.numeroEcommerce || 'N/A'}`);
            console.log(`  📆 Criado em: ${order.created_at}`);
            console.log('  ---');
        });
    } else {
        console.log('❌ Nenhum pedido encontrado na tabela tiny_orders');
    }

    console.log('\n---\n');

    // 4. Verificar contagem de pedidos por data
    const { data: ordersByDate, error: ordersByDateErr } = await supabaseAdmin
        .from('tiny_orders')
        .select('dataPedido')
        .gte('dataPedido', '2025-11-15')
        .order('dataPedido', { ascending: false });

    if (ordersByDateErr) {
        console.error('❌ Erro ao contar pedidos por data:', ordersByDateErr);
    } else if (ordersByDate) {
        const counts: Record<string, number> = {};
        ordersByDate.forEach((order) => {
            const date = order.dataPedido?.substring(0, 10) || 'unknown';
            counts[date] = (counts[date] || 0) + 1;
        });

        console.log('📊 Contagem de pedidos por data desde 15/11:');
        Object.entries(counts)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .forEach(([date, count]) => {
                console.log(`  ${date}: ${count} pedidos`);
            });
    }
}

checkSyncLogs().catch(console.error);
