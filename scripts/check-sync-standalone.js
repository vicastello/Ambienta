#!/usr/bin/env node

// Script standalone para consultar logs do Supabase sem depender do servidor dev
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Carregar .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Variáveis de ambiente não encontradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
});

async function checkSyncStatus() {
    console.log('\n🔍 Análise de Sincronização do Tiny\n');
    console.log('='.repeat(60));

    // 1. Erros recentes
    console.log('\n📌 ERROS DE SINCRONIZAÇÃO (desde 15/11/2025)\n');
    const { data: errors, error: errorsErr } = await supabase
        .from('sync_logs')
        .select('created_at, message, meta')
        .eq('level', 'error')
        .gte('created_at', '2025-11-15T00:00:00')
        .order('created_at', { ascending: false })
        .limit(15);

    if (errorsErr) {
        console.error('❌ Erro ao buscar logs:', errorsErr.message);
    } else if (errors && errors.length > 0) {
        console.log(`❌ Encontrados ${errors.length} erros:\n`);

        // Agrupar por tipo de erro
        const errorTypes = {};
        errors.forEach((err) => {
            const msg = err.message;
            errorTypes[msg] = (errorTypes[msg] || 0) + 1;
        });

        console.log('Tipos de erros encontrados:');
        Object.entries(errorTypes).forEach(([msg, count]) => {
            console.log(`  • "${msg}": ${count}x`);
        });

        console.log('\nDetalhes dos primeiros erros:\n');
        errors.slice(0, 3).forEach((err, idx) => {
            console.log(`${idx + 1}. ${err.created_at}`);
            console.log(`   Mensagem: ${err.message}`);
            if (err.meta) {
                const metaStr = JSON.stringify(err.meta, null, 2);
                console.log(`   Meta: ${metaStr.substring(0, 200)}${metaStr.length > 200 ? '...' : ''}`);
            }
            console.log('');
        });
    } else {
        console.log('✅ Nenhum erro encontrado');
    }

    // 2. Últimos jobs
    console.log('\n' + '='.repeat(60));
    console.log('\n📌 ÚLTIMOS JOBS DE SINCRONIZAÇÃO\n');
    const { data: jobs, error: jobsErr } = await supabase
        .from('sync_jobs')
        .select('started_at, finished_at, status, params, error, total_orders')
        .order('started_at', { ascending: false })
        .limit(5);

    if (jobsErr) {
        console.error('❌ Erro ao buscar jobs:', jobsErr.message);
    } else if (jobs && jobs.length > 0) {
        jobs.forEach((job, idx) => {
            console.log(`${idx + 1}. ${job.started_at}`);
            console.log(`   Status: ${job.status} | Pedidos: ${job.total_orders || 0}`);
            if (job.params) {
                console.log(`   Params: ${JSON.stringify(job.params)}`);
            }
            if (job.error) {
                console.log(`   ❌ Erro: ${job.error}`);
            }
            console.log('');
        });
    } else {
        console.log('⚠️  Nenhum job encontrado');
    }

    // 3. Últimos pedidos importados
    console.log('\n' + '='.repeat(60));
    console.log('\n📌 ÚLTIMOS 10 PEDIDOS IMPORTADOS (por inserted_at)\n');
    const { data: orders, error: ordersErr } = await supabase
        .from('tiny_orders')
        .select('tiny_id, numero_pedido, data_criacao, canal, inserted_at')
        .order('inserted_at', { ascending: false })
        .limit(10);

    if (ordersErr) {
        console.error('❌ Erro ao buscar pedidos:', ordersErr.message);
    } else if (orders && orders.length > 0) {
        orders.forEach((order, idx) => {
            console.log(`${idx + 1}. Inserido em: ${order.inserted_at}`);
            console.log(`   Data Pedido: ${order.data_criacao} | Canal: ${order.canal || 'N/A'}`);
            console.log(`   Tiny ID: ${order.tiny_id} | Num: ${order.numero_pedido || 'N/A'}`);
            console.log('');
        });
    } else {
        console.log('❌ Nenhum pedido encontrado');
    }

    // 4. Pedidos por data desde 15/11
    console.log('\n' + '='.repeat(60));
    console.log('\n📌 PEDIDOS INSERIDOS NO BANCO (desde 15/11)\n');
    const { data: ordersByCreated, error: ordersByCreatedErr } = await supabase
        .from('tiny_orders')
        .select('inserted_at')
        .gte('inserted_at', '2025-11-15T00:00:00')
        .order('inserted_at', { ascending: false });

    if (ordersByCreatedErr) {
        console.error('❌ Erro:', ordersByCreatedErr.message);
    } else if (ordersByCreated) {
        const countsByDate = {};
        ordersByCreated.forEach((order) => {
            const date = order.inserted_at.substring(0, 10);
            countsByDate[date] = (countsByDate[date] || 0) + 1;
        });

        const entries = Object.entries(countsByDate).sort((a, b) => b[0].localeCompare(a[0]));

        if (entries.length > 0) {
            console.log(`Total: ${ordersByCreated.length} pedidos importados desde 15/11\n`);
            console.log('Pedidos por data de inserção:\n');
            entries.forEach(([date, count]) => {
                console.log(`  ${date}: ${count} pedidos`);
            });
        } else {
            console.log('⚠️  NENHUM PEDIDO FOI IMPORTADO DESDE 15/11/2025!');
        }
    }

    // 5. Verificar status do token
    console.log('\n' + '='.repeat(60));
    console.log('\n📌 STATUS DO TOKEN TINY\n');
    const { data: tokenData, error: tokenErr } = await supabase
        .from('tiny_tokens')
        .select('expires_at, updated_at, scope')
        .eq('id', 1)
        .single();

    if (tokenErr) {
        console.error('❌ Erro ao buscar token:', tokenErr.message);
    } else if (tokenData) {
        const expiresAt = tokenData.expires_at;
        const now = Date.now();
        const expired = expiresAt && expiresAt < now;

        console.log(`Última atualização: ${tokenData.updated_at}`);
        console.log(`Expira em: ${expiresAt ? new Date(expiresAt).toISOString() : 'N/A'}`);
        console.log(`Status: ${expired ? '❌ EXPIRADO' : '✅ Válido'}`);
        if (expired) {
            const daysAgo = Math.floor((now - expiresAt) / (1000 * 60 * 60 * 24));
            console.log(`⚠️  Token expirou há ${daysAgo} dias!`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n🎯 CONCLUSÃO DA ANÁLISE\n');

    let hasIssues = false;

    if (errors && errors.length > 0) {
        console.log('❌ PROBLEMA: Erros de autenticação encontrados');
        console.log('   → O token do Tiny está com problemas (invalid_client)');
        hasIssues = true;
    }

    if (!ordersByCreated || ordersByCreated.length === 0) {
        console.log('❌ PROBLEMA: Nenhum pedido importado desde 15/11');
        console.log('   → A sincronização não está funcionando');
        hasIssues = true;
    }

    if (tokenData && tokenData.expires_at && tokenData.expires_at < Date.now()) {
        console.log('❌ PROBLEMA: Token do Tiny está expirado');
        console.log('   → É necessário reconectar o Tiny');
        hasIssues = true;
    }

    if (!hasIssues) {
        console.log('✅ Nenhum problema detectado');
    } else {
        console.log('\n💡 PRÓXIMOS PASSOS:');
        console.log('   1. Reconectar integração com o Tiny');
        console.log('   2. Executar sincronização manual para recuperar pedidos');
    }

    console.log('\n' + '='.repeat(60) + '\n');
}

checkSyncStatus().catch((err) => {
    console.error('\n❌ Erro fatal:', err);
    process.exit(1);
});
