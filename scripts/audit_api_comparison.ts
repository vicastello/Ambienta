/**
 * AUDIT SCRIPT: Phase 3 - API Comparison
 * 
 * This script compares the raw SQL numbers with the API response
 * to identify any calculation discrepancies.
 * 
 * Run with: npx tsx scripts/audit_api_comparison.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// --- Environment Setup ---
const envPath = path.resolve(process.cwd(), '.env.vercel');
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
async function runAPIComparisonAudit() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   🔬 AUDITORIA FASE 3: COMPARAÇÃO SQL vs API/CÁLCULO');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Dynamically import the fee calculator
    const { calculateMarketplaceFees } = await import('../lib/marketplace-fees');

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 1: Fetch all orders with full data
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📊 STEP 1: Fetching all orders with payments and links...');

    const { data: orders, error } = await supabase
        .from('tiny_orders')
        .select(`
            id, 
            valor, 
            valor_total_pedido,
            valor_frete,
            payment_received,
            data_criacao,
            canal,
            fee_overrides,
            numero_pedido_ecommerce,
            marketplace_payments!marketplace_payments_tiny_order_id_fkey (
                net_amount,
                is_expense
            ),
            marketplace_order_links (
                product_count,
                is_kit,
                uses_free_shipping,
                is_campaign_order
            )
        `)
        .neq('situacao', 2);

    if (error) {
        console.error('   ❌ Erro ao buscar pedidos:', error.message);
        return;
    }

    console.log(`   ✓ ${orders?.length} pedidos carregados\n`);

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 2: Fetch Shopee items for fallback
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📊 STEP 2: Fetching Shopee items for fallback...');

    const shopeeOrderIds = orders
        ?.filter(o => o.canal?.toLowerCase().includes('shopee') && o.numero_pedido_ecommerce)
        .map(o => o.numero_pedido_ecommerce) || [];

    const { data: shopeeItems } = await supabase
        .from('shopee_order_items')
        .select('order_sn, quantity')
        .in('order_sn', shopeeOrderIds.slice(0, 500)); // Limit for performance

    const shopeeItemsMap = new Map<string, any[]>();
    shopeeItems?.forEach(item => {
        const existing = shopeeItemsMap.get(item.order_sn) || [];
        existing.push(item);
        shopeeItemsMap.set(item.order_sn, existing);
    });

    console.log(`   ✓ ${shopeeItems?.length || 0} items Shopee carregados\n`);

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 3: Process each order and calculate summary
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📊 STEP 3: Processando pedidos e calculando valores...\n');

    let summary = {
        recebido: 0,
        pendente: 0,
        atrasado: 0,
        recebidoCount: 0,
        pendenteCount: 0,
        atrasadoCount: 0,
    };

    let discrepancies: any[] = [];

    for (const o of orders || []) {
        const valorBruto = Number(o.valor || o.valor_total_pedido || 0);
        const valorFrete = Number(o.valor_frete || 0);
        const baseTaxas = Math.max(0, valorBruto - valorFrete);

        const payments = Array.isArray(o.marketplace_payments)
            ? o.marketplace_payments
            : (o.marketplace_payments ? [o.marketplace_payments] : []);

        let valorCalculado = 0;
        let calculationMethod = '';

        // Determine value based on payment status
        if (payments.length > 0) {
            // Has payment records - use actual net amount
            valorCalculado = payments.reduce((sum: number, p: any) => {
                const val = Math.abs(Number(p.net_amount || 0));
                return sum + (p.is_expense ? -val : val);
            }, 0);
            calculationMethod = 'EXTRATO';
        } else if (o.payment_received) {
            // Marked as paid but no payment records - use gross (fallback)
            valorCalculado = valorBruto;
            calculationMethod = 'BRUTO_FALLBACK';
        } else {
            // Pending - calculate expected net value
            const canal = o.canal?.toLowerCase() || '';
            let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;
            if (canal.includes('shopee')) marketplace = 'shopee';
            else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
            else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

            if (marketplace) {
                try {
                    const linkData = o.marketplace_order_links?.[0] as any;
                    let productCount = linkData?.product_count || 1;
                    let isKit = linkData?.is_kit || false;

                    // Fallback to Shopee items if link missing
                    if (marketplace === 'shopee' && (!linkData || !linkData.product_count)) {
                        const sItems = shopeeItemsMap.get(o.numero_pedido_ecommerce);
                        if (sItems && sItems.length > 0) {
                            productCount = sItems.reduce((acc: number, i: any) => acc + (i.quantity || 1), 0);
                        }
                    }

                    const feeCalc = await calculateMarketplaceFees({
                        marketplace,
                        orderValue: baseTaxas,
                        productCount,
                        isKit,
                        usesFreeShipping: (o.fee_overrides as any)?.usesFreeShipping ?? (linkData?.uses_free_shipping || false),
                        isCampaignOrder: linkData?.is_campaign_order || false,
                        orderDate: new Date(o.data_criacao || new Date())
                    });

                    valorCalculado = feeCalc.netValue;
                    calculationMethod = `FEE_CALC (${productCount} items)`;
                } catch (e) {
                    valorCalculado = valorBruto;
                    calculationMethod = 'BRUTO_ERROR';
                }
            } else {
                valorCalculado = valorBruto;
                calculationMethod = 'BRUTO_NO_MARKETPLACE';
            }
        }

        // Classify into summary buckets
        if (o.payment_received || payments.length > 0) {
            summary.recebido += valorCalculado;
            summary.recebidoCount++;
        } else {
            const orderDate = new Date(o.data_criacao || new Date());
            const dueDays = getDueDays(o.canal);
            const dueDate = new Date(orderDate);
            dueDate.setDate(dueDate.getDate() + dueDays);

            if (today > dueDate) {
                summary.atrasado += valorCalculado;
                summary.atrasadoCount++;
            } else {
                summary.pendente += valorCalculado;
                summary.pendenteCount++;
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 4: Add orphan payments (not linked to orders)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📊 STEP 4: Processando pagamentos órfãos...');

    const { data: orphanPayments } = await supabase
        .from('marketplace_payments')
        .select('id, net_amount, is_expense, transaction_description')
        .is('tiny_order_id', null);

    let orphanExpenses = 0;
    let orphanRevenue = 0;

    orphanPayments?.forEach(p => {
        const val = Math.abs(Number(p.net_amount || 0));
        const desc = (p.transaction_description || '').toLowerCase();
        const isAds = desc.match(/recarga|ads|publicidade/) && !desc.match(/reembolso|estorno|cancelamento/);
        const isExpense = p.is_expense === true || (p.net_amount || 0) < 0 || !!isAds;

        if (isExpense) {
            orphanExpenses += val;
        } else {
            orphanRevenue += val;
            summary.recebido += val;
        }
    });

    console.log(`   ✓ Órfãos: ${orphanPayments?.length || 0} (Receita: ${formatMoney(orphanRevenue)}, Despesa: ${formatMoney(orphanExpenses)})\n`);

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 5: Add manual entries
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📊 STEP 5: Processando entradas manuais...');

    const { data: manualEntries } = await supabase
        .from('cash_flow_entries')
        .select('*');

    let manualExpenses = 0;
    let manualRevenue = 0;

    manualEntries?.forEach(e => {
        const val = Number(e.amount || 0);
        if (e.type === 'expense') {
            manualExpenses += val;
        } else if (e.status === 'confirmed') {
            manualRevenue += val;
            summary.recebido += val;
        }
    });

    console.log(`   ✓ Manuais: ${manualEntries?.length || 0} (Receita: ${formatMoney(manualRevenue)}, Despesa: ${formatMoney(manualExpenses)})\n`);

    // Total expenses
    const totalExpenses = orphanExpenses + manualExpenses;

    // ══════════════════════════════════════════════════════════════════════════
    // RESULTS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   📋 RESULTADOS DA AUDITORIA - VALORES CALCULADOS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`   🟢 RECEBIDO:  ${formatMoney(summary.recebido)} (${summary.recebidoCount} pedidos)`);
    console.log(`   🟡 PENDENTE:  ${formatMoney(summary.pendente)} (${summary.pendenteCount} pedidos)`);
    console.log(`   🔴 ATRASADO:  ${formatMoney(summary.atrasado)} (${summary.atrasadoCount} pedidos)`);
    console.log(`   ⚫ SAÍDAS:    ${formatMoney(totalExpenses)}`);

    const total = summary.recebido + summary.pendente + summary.atrasado - totalExpenses;
    console.log(`\n   💰 TOTAL:     ${formatMoney(total)}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    // COMPARISON WITH USER-PROVIDED VALUES
    // ══════════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   📋 COMPARAÇÃO COM VALORES DO USUÁRIO');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const userValues = {
        recebido: 2676.67,
        pendente: 1224.83,
        atrasado: 25994.25,
        saidas: 100.00,
        total: 29795.75
    };

    const checkMatch = (label: string, calculated: number, expected: number) => {
        const diff = Math.abs(calculated - expected);
        const status = diff < 1 ? '✅' : diff < 100 ? '⚠️' : '❌';
        console.log(`   ${status} ${label.padEnd(12)} Calculado: ${formatMoney(calculated).padEnd(15)} Esperado: ${formatMoney(expected).padEnd(15)} Diff: ${formatMoney(diff)}`);
        return diff;
    };

    const diffRecebido = checkMatch('RECEBIDO', summary.recebido, userValues.recebido);
    const diffPendente = checkMatch('PENDENTE', summary.pendente, userValues.pendente);
    const diffAtrasado = checkMatch('ATRASADO', summary.atrasado, userValues.atrasado);
    const diffSaidas = checkMatch('SAÍDAS', totalExpenses, userValues.saidas);
    const diffTotal = checkMatch('TOTAL', total, userValues.total);

    console.log('\n═══════════════════════════════════════════════════════════════');

    if (diffRecebido < 1 && diffPendente < 1 && diffAtrasado < 1 && diffSaidas < 1 && diffTotal < 1) {
        console.log('   ✅ AUDITORIA APROVADA: Todos os valores correspondem!');
    } else {
        console.log('   ⚠️  AUDITORIA DETECTOU DIFERENÇAS - Investigação necessária');

        if (diffRecebido > 1) {
            console.log('      - RECEBIDO: Verificar soma de net_amounts dos pagamentos');
        }
        if (diffPendente > 1) {
            console.log('      - PENDENTE: Verificar cálculo de taxas e classificação de vencimento');
        }
        if (diffAtrasado > 1) {
            console.log('      - ATRASADO: Verificar regras de due date por marketplace');
        }
        if (diffSaidas > 1) {
            console.log('      - SAÍDAS: Verificar classificação de despesas (is_expense, Ads, etc)');
        }
    }

    console.log('═══════════════════════════════════════════════════════════════\n');
}

runAPIComparisonAudit().catch(console.error);
