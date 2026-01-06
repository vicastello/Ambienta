/**
 * Diagnostic script to check marketplace_payments for adjustments
 * Usage: npx tsx scripts/check-adjustment-import.ts [ORDER_ID]
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const orderId = process.argv[2];

    if (!orderId) {
        console.log('Usage: npx tsx scripts/check-adjustment-import.ts [ORDER_ID]');
        console.log('\nBuscando últimos 20 registros de marketplace_payments...\n');

        const { data: recentPayments, error } = await supabase
            .from('marketplace_payments')
            .select('id, marketplace, marketplace_order_id, net_amount, is_expense, transaction_type, tiny_order_id, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Erro:', error.message);
            return;
        }

        console.log('Últimos pagamentos importados:');
        console.table(recentPayments?.map(p => ({
            id: p.id.slice(0, 8) + '...',
            marketplace: p.marketplace,
            order_id: p.marketplace_order_id,
            net_amount: p.net_amount,
            is_expense: p.is_expense ? '❌ DÉBITO' : '✅ CRÉDITO',
            transaction_type: p.transaction_type || '-',
            tiny_linked: p.tiny_order_id ? '✅ Sim' : '❌ Não',
        })));
        return;
    }

    console.log(`\n🔍 Buscando registros para Order ID: ${orderId}\n`);

    // 1. Check marketplace_payments for this order (including suffixed versions)
    const { data: payments, error: paymentError } = await supabase
        .from('marketplace_payments')
        .select('*')
        .or(`marketplace_order_id.eq.${orderId},marketplace_order_id.like.${orderId}_%`);

    if (paymentError) {
        console.error('Erro ao buscar payments:', paymentError.message);
        return;
    }

    console.log(`📦 marketplace_payments encontrados: ${payments?.length || 0}`);

    if (payments && payments.length > 0) {
        let totalCredito = 0;
        let totalDebito = 0;

        payments.forEach((p, i) => {
            const val = Number(p.net_amount || 0);
            const isExpense = p.is_expense;

            if (isExpense) {
                totalDebito += val;
            } else {
                totalCredito += val;
            }

            console.log(`\n  [${i + 1}] ID: ${p.marketplace_order_id}`);
            console.log(`      Tipo: ${isExpense ? '❌ DÉBITO/DESPESA' : '✅ CRÉDITO/RECEITA'}`);
            console.log(`      Valor: R$ ${val.toFixed(2)}`);
            console.log(`      transaction_type: ${p.transaction_type || '(vazio)'}`);
            console.log(`      tiny_order_id: ${p.tiny_order_id || '(não vinculado)'}`);
            console.log(`      is_expense: ${p.is_expense}`);
        });

        const saldo = totalCredito - totalDebito;
        console.log(`\n📊 RESUMO:`);
        console.log(`   Total Créditos: R$ ${totalCredito.toFixed(2)}`);
        console.log(`   Total Débitos:  R$ ${totalDebito.toFixed(2)}`);
        console.log(`   Saldo Final:    R$ ${saldo.toFixed(2)}`);
    } else {
        console.log('   ⚠️  Nenhum registro encontrado em marketplace_payments');
    }

    // 2. Check marketplace_order_links
    console.log(`\n🔗 Verificando marketplace_order_links...`);
    const { data: links } = await supabase
        .from('marketplace_order_links')
        .select('*')
        .eq('marketplace_order_id', orderId);

    if (links && links.length > 0) {
        console.log(`   ✅ Link encontrado: tiny_order_id = ${links[0].tiny_order_id}`);

        // 3. Check tiny_orders
        const { data: tinyOrder } = await supabase
            .from('tiny_orders')
            .select('id, tiny_id, numero_pedido, numero_pedido_ecommerce, valor, valor_total_pedido, payment_received')
            .eq('tiny_id', links[0].tiny_order_id)
            .single();

        if (tinyOrder) {
            console.log(`   📋 Tiny Order: #${tinyOrder.numero_pedido} (valor: R$ ${tinyOrder.valor || tinyOrder.valor_total_pedido})`);
            console.log(`      payment_received: ${tinyOrder.payment_received ? '✅ Sim' : '❌ Não'}`);
        }
    } else {
        console.log('   ⚠️  Nenhum link encontrado em marketplace_order_links');
    }
}

main().catch(console.error);
