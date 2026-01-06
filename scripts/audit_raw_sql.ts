/**
 * AUDIT SCRIPT: Phase 2 - Raw SQL Verification
 * 
 * This script executes raw SQL queries against the database to establish
 * ground truth numbers for comparison with the API calculations.
 * 
 * Run with: npx tsx scripts/audit_raw_sql.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// --- Environment Setup ---
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
} else {
    dotenv.config({ path: '.env.local' });
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Helper Functions ---
const formatMoney = (val: number) => `R$ ${val.toFixed(2).replace('.', ',')}`;
const MARKETPLACE_DUE_DAYS: Record<string, number> = {
    'shopee': 14, 'mercado': 15, 'meli': 15, 'magalu': 30, 'magazine': 30, 'default': 30,
};

function getDueDays(canal: string | null): number {
    if (!canal) return MARKETPLACE_DUE_DAYS.default;
    const lowerCanal = canal.toLowerCase();
    for (const [key, days] of Object.entries(MARKETPLACE_DUE_DAYS)) {
        if (key !== 'default' && lowerCanal.includes(key)) return days;
    }
    return MARKETPLACE_DUE_DAYS.default;
}

// --- Main Audit Function ---
async function runRawSQLAudit() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   🔬 AUDITORIA FASE 2: VERIFICAÇÃO SQL DIRETA');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ══════════════════════════════════════════════════════════════════════════
    // QUERY A: Total Bruto de Todos os Pedidos (Não Cancelados)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📊 QUERY A: Total Bruto de Pedidos');
    console.log('───────────────────────────────────');

    const { data: ordersRaw, error: errA } = await supabase
        .from('tiny_orders')
        .select('id, valor, valor_total_pedido')
        .neq('situacao', 2);

    if (errA) {
        console.error('   ❌ Erro:', errA.message);
    } else {
        const totalBruto = ordersRaw?.reduce((sum, o) => {
            return sum + Number(o.valor || o.valor_total_pedido || 0);
        }, 0) || 0;
        console.log(`   Pedidos Válidos: ${ordersRaw?.length}`);
        console.log(`   Total Bruto: ${formatMoney(totalBruto)}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUERY B: Pagamentos Recebidos (marketplace_payments)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n📊 QUERY B: Pagamentos (marketplace_payments)');
    console.log('───────────────────────────────────────────────');

    const { data: paymentsRaw, error: errB } = await supabase
        .from('marketplace_payments')
        .select('id, net_amount, is_expense, tiny_order_id');

    if (errB) {
        console.error('   ❌ Erro:', errB.message);
    } else {
        let totalReceitas = 0;
        let totalDespesas = 0;
        let orphanCount = 0;
        let orphanValue = 0;

        paymentsRaw?.forEach(p => {
            const val = Math.abs(Number(p.net_amount || 0));
            if (p.is_expense) {
                totalDespesas += val;
            } else {
                totalReceitas += val;
            }
            if (!p.tiny_order_id) {
                orphanCount++;
                orphanValue += val;
            }
        });

        console.log(`   Total Pagamentos: ${paymentsRaw?.length}`);
        console.log(`   Receitas (is_expense=false): ${formatMoney(totalReceitas)}`);
        console.log(`   Despesas (is_expense=true): ${formatMoney(totalDespesas)}`);
        console.log(`   Líquido (Receitas - Despesas): ${formatMoney(totalReceitas - totalDespesas)}`);
        console.log(`   Órfãos (sem ordem vinculada): ${orphanCount} (${formatMoney(orphanValue)})`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUERY C: Classificação de Pedidos (PAGO vs PENDENTE vs ATRASADO)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n📊 QUERY C: Classificação de Pedidos');
    console.log('─────────────────────────────────────');

    const { data: ordersClassification, error: errC } = await supabase
        .from('tiny_orders')
        .select('id, valor, valor_total_pedido, payment_received, data_criacao, canal')
        .neq('situacao', 2);

    if (errC) {
        console.error('   ❌ Erro:', errC.message);
    } else {
        let pagos = { count: 0, valorBruto: 0 };
        let pendentes = { count: 0, valorBruto: 0 };
        let atrasados = { count: 0, valorBruto: 0 };

        ordersClassification?.forEach(o => {
            const valor = Number(o.valor || o.valor_total_pedido || 0);

            if (o.payment_received) {
                pagos.count++;
                pagos.valorBruto += valor;
            } else {
                const orderDate = new Date(o.data_criacao || new Date());
                const dueDays = getDueDays(o.canal);
                const dueDate = new Date(orderDate);
                dueDate.setDate(dueDate.getDate() + dueDays);

                if (today > dueDate) {
                    atrasados.count++;
                    atrasados.valorBruto += valor;
                } else {
                    pendentes.count++;
                    pendentes.valorBruto += valor;
                }
            }
        });

        console.log(`   PAGOS: ${pagos.count} pedidos | Bruto: ${formatMoney(pagos.valorBruto)}`);
        console.log(`   PENDENTES: ${pendentes.count} pedidos | Bruto: ${formatMoney(pendentes.valorBruto)}`);
        console.log(`   ATRASADOS: ${atrasados.count} pedidos | Bruto: ${formatMoney(atrasados.valorBruto)}`);
        console.log(`   ⚠️  Nota: Estes são valores BRUTOS. O Card mostra LÍQUIDO (após taxas).`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUERY D: Entradas Manuais (cash_flow_entries)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n📊 QUERY D: Entradas Manuais (cash_flow_entries)');
    console.log('─────────────────────────────────────────────────');

    const { data: manualEntries, error: errD } = await supabase
        .from('cash_flow_entries')
        .select('id, amount, type, status, due_date');

    if (errD) {
        console.error('   ❌ Erro:', errD.message);
    } else {
        let despesaConfirmada = 0;
        let despesaPendente = 0;
        let receitaConfirmada = 0;
        let receitaPendente = 0;

        manualEntries?.forEach(e => {
            const val = Number(e.amount || 0);
            if (e.type === 'expense') {
                if (e.status === 'confirmed') despesaConfirmada += val;
                else despesaPendente += val;
            } else {
                if (e.status === 'confirmed') receitaConfirmada += val;
                else receitaPendente += val;
            }
        });

        console.log(`   Total Entradas: ${manualEntries?.length}`);
        console.log(`   Despesas Confirmadas: ${formatMoney(despesaConfirmada)}`);
        console.log(`   Despesas Pendentes: ${formatMoney(despesaPendente)}`);
        console.log(`   Receitas Confirmadas: ${formatMoney(receitaConfirmada)}`);
        console.log(`   Receitas Pendentes: ${formatMoney(receitaPendente)}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUERY E: Verificação de Pedidos com Pagamentos Vinculados
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n📊 QUERY E: Pedidos com Pagamentos Vinculados');
    console.log('──────────────────────────────────────────────');

    const { data: ordersWithPayments, error: errE } = await supabase
        .from('tiny_orders')
        .select(`
            id, 
            valor, 
            valor_total_pedido,
            payment_received,
            marketplace_payments!marketplace_payments_tiny_order_id_fkey (
                net_amount,
                is_expense
            )
        `)
        .neq('situacao', 2);

    if (errE) {
        console.error('   ❌ Erro:', errE.message);
    } else {
        let pedidosComPagamento = 0;
        let pedidosSemPagamento = 0;
        let pagoComExtrato = 0;
        let pagoSemExtrato = 0;
        let pendenteComExtrato = 0;
        let pendenteSemExtrato = 0;

        let totalValorComExtrato = 0; // Sum of net_amounts for orders with payments

        ordersWithPayments?.forEach(o => {
            const payments = Array.isArray(o.marketplace_payments)
                ? o.marketplace_payments
                : (o.marketplace_payments ? [o.marketplace_payments] : []);

            const hasPayments = payments.length > 0;

            if (hasPayments) {
                pedidosComPagamento++;
                // Calculate sum of net_amounts
                const netSum = payments.reduce((sum: number, p: any) => {
                    const val = Math.abs(Number(p.net_amount || 0));
                    return sum + (p.is_expense ? -val : val);
                }, 0);
                totalValorComExtrato += netSum;

                if (o.payment_received) pagoComExtrato++;
                else pendenteComExtrato++;
            } else {
                pedidosSemPagamento++;
                if (o.payment_received) pagoSemExtrato++;
                else pendenteSemExtrato++;
            }
        });

        console.log(`   Pedidos COM extrato vinculado: ${pedidosComPagamento}`);
        console.log(`      ├─ Marcados Pago: ${pagoComExtrato}`);
        console.log(`      └─ Marcados Pendente: ${pendenteComExtrato}`);
        console.log(`   Pedidos SEM extrato vinculado: ${pedidosSemPagamento}`);
        console.log(`      ├─ Marcados Pago: ${pagoSemExtrato} (⚠️ Usando valor bruto!)`);
        console.log(`      └─ Marcados Pendente: ${pendenteSemExtrato}`);
        console.log(`   Soma de net_amount (pedidos com extrato): ${formatMoney(totalValorComExtrato)}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUERY F: Análise de Links de Marketplace (para cálculo de taxas)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n📊 QUERY F: Links de Marketplace');
    console.log('──────────────────────────────────');

    const { data: links, error: errF } = await supabase
        .from('marketplace_order_links')
        .select('id, tiny_order_id, product_count, is_kit, uses_free_shipping');

    if (errF) {
        console.error('   ❌ Erro:', errF.message);
    } else {
        const totalLinks = links?.length || 0;
        const withProductCount = links?.filter(l => l.product_count && l.product_count > 0).length || 0;
        const kits = links?.filter(l => l.is_kit === true).length || 0;
        const freeShipping = links?.filter(l => l.uses_free_shipping === true).length || 0;

        console.log(`   Total Links: ${totalLinks}`);
        console.log(`   Com product_count > 0: ${withProductCount}`);
        console.log(`   Marcados como Kit: ${kits}`);
        console.log(`   Com Frete Grátis: ${freeShipping}`);

        // Check coverage
        const { count: totalOrders } = await supabase
            .from('tiny_orders')
            .select('id', { count: 'exact', head: true })
            .neq('situacao', 2);

        const coverage = totalOrders ? ((totalLinks / totalOrders) * 100).toFixed(1) : 0;
        console.log(`   Cobertura de Links: ${coverage}% dos pedidos têm link`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('   📋 RESUMO DA AUDITORIA SQL');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   Este script mostra os DADOS BRUTOS do banco.');
    console.log('   O próximo passo é comparar com a resposta da API.');
    console.log('   Se os números não baterem, há erro no código de agregação.');
    console.log('═══════════════════════════════════════════════════════════════\n');
}

runRawSQLAudit().catch(console.error);
