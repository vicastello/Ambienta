/**
 * AUDIT SCRIPT: Phase 4 - Fee Calculation Verification
 * 
 * This script selects PAID orders (where we know the actual net amount)
 * and compares the system's calculated expected value against reality.
 * 
 * Run with: npx tsx scripts/audit_fee_calculation.ts
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

// --- Main Audit Function ---
async function runFeeCalculationAudit() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   🔬 AUDITORIA FASE 4: VERIFICAÇÃO DE CÁLCULO DE TAXAS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Dynamically import the fee calculator
    const { calculateMarketplaceFees } = await import('../lib/marketplace-fees');

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 1: Fetch PAID orders with payment records
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📊 Buscando pedidos PAGOS com extrato para verificação...\n');

    const { data: orders, error } = await supabase
        .from('tiny_orders')
        .select(`
            id, 
            numero_pedido,
            valor, 
            valor_total_pedido,
            valor_frete,
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
        .eq('payment_received', true)
        .neq('situacao', 2)
        .order('data_criacao', { ascending: false })
        .limit(50); // Last 50 paid orders

    if (error) {
        console.error('   ❌ Erro ao buscar pedidos:', error.message);
        return;
    }

    // Filter to only include orders that have payment records
    const ordersWithPayments = orders?.filter(o => {
        const payments = Array.isArray(o.marketplace_payments)
            ? o.marketplace_payments
            : (o.marketplace_payments ? [o.marketplace_payments] : []);
        return payments.length > 0;
    }) || [];

    console.log(`   ✓ ${ordersWithPayments.length} pedidos com extrato encontrados\n`);

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 2: Fetch Shopee items for fallback
    // ══════════════════════════════════════════════════════════════════════════
    const shopeeOrderIds = ordersWithPayments
        .filter(o => o.canal?.toLowerCase().includes('shopee') && o.numero_pedido_ecommerce)
        .map(o => o.numero_pedido_ecommerce);

    const { data: shopeeItems } = await supabase
        .from('shopee_order_items')
        .select('order_sn, quantity')
        .in('order_sn', shopeeOrderIds);

    const shopeeItemsMap = new Map<string, any[]>();
    shopeeItems?.forEach(item => {
        const existing = shopeeItemsMap.get(item.order_sn) || [];
        existing.push(item);
        shopeeItemsMap.set(item.order_sn, existing);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 3: Compare calculated vs actual for each order
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📊 Comparando valor CALCULADO vs valor REAL:\n');
    console.log('┌────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────┐');
    console.log('│ Pedido     │ Canal       │ Vl. Bruto   │ Vl. Esperado│ Vl. Real    │ Diff    │');
    console.log('├────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────┤');

    let totalDiff = 0;
    let perfectMatches = 0;
    let closeMatches = 0; // < R$ 1
    let significantDiffs = 0; // > R$ 5
    let results: any[] = [];

    for (const o of ordersWithPayments.slice(0, 30)) { // Process top 30
        const valorBruto = Number(o.valor || o.valor_total_pedido || 0);
        const valorFrete = Number(o.valor_frete || 0);
        const baseTaxas = Math.max(0, valorBruto - valorFrete);

        const payments = Array.isArray(o.marketplace_payments)
            ? o.marketplace_payments
            : [o.marketplace_payments];

        // Calculate ACTUAL received amount
        const valorReal = payments.reduce((sum: number, p: any) => {
            const val = Math.abs(Number(p.net_amount || 0));
            return sum + (p.is_expense ? -val : val);
        }, 0);

        // Calculate EXPECTED amount using our fee calculator
        let valorEsperado = valorBruto; // Default fallback
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
                let amsCommissionFee = 0;

                // ALWAYS prefer real item count from Shopee (matching route.ts logic)
                if (marketplace === 'shopee') {
                    const sItems = shopeeItemsMap.get(o.numero_pedido_ecommerce);
                    if (sItems && sItems.length > 0) {
                        const realItemCount = sItems.reduce((acc: number, i: any) => acc + (i.quantity || 1), 0);
                        // Override if link is missing/wrong
                        if (!linkData?.product_count || realItemCount > (linkData?.product_count || 1)) {
                            productCount = realItemCount;
                        }
                    }

                    // Fetch AMS Commission from Shopee order
                    const { data: sOrder } = await supabase
                        .from('shopee_orders')
                        .select('ams_commission_fee')
                        .eq('order_sn', o.numero_pedido_ecommerce)
                        .single();

                    if (sOrder?.ams_commission_fee) {
                        amsCommissionFee = Number(sOrder.ams_commission_fee) || 0;
                    }
                }

                const feeCalc = await calculateMarketplaceFees({
                    marketplace,
                    orderValue: baseTaxas,
                    productCount,
                    isKit,
                    usesFreeShipping: (o.fee_overrides as any)?.usesFreeShipping ?? (linkData?.uses_free_shipping || false),
                    amsCommissionFee: amsCommissionFee > 0 ? amsCommissionFee : undefined,
                    isCampaignOrder: linkData?.is_campaign_order || false,
                    orderDate: new Date(o.data_criacao || new Date())
                });

                valorEsperado = feeCalc.netValue;
            } catch (e) {
                // Keep fallback
            }
        }

        const diff = valorReal - valorEsperado;
        const absDiff = Math.abs(diff);
        totalDiff += absDiff;

        if (absDiff < 0.01) perfectMatches++;
        else if (absDiff < 1) closeMatches++;
        else if (absDiff > 5) significantDiffs++;

        results.push({
            pedido: o.numero_pedido,
            canal: marketplace || 'outro',
            bruto: valorBruto,
            esperado: valorEsperado,
            real: valorReal,
            diff: diff
        });

        // Format for display
        const diffSymbol = absDiff < 0.01 ? '✅' : absDiff < 1 ? '~' : absDiff < 5 ? '⚠️' : '❌';

        console.log(`│ ${String(o.numero_pedido).padEnd(10)} │ ${(marketplace || 'outro').padEnd(11)} │ ${formatMoney(valorBruto).padStart(11)} │ ${formatMoney(valorEsperado).padStart(11)} │ ${formatMoney(valorReal).padStart(11)} │ ${diffSymbol} ${formatMoney(diff).padStart(7)} │`);
    }

    console.log('└────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────┘\n');

    // ══════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   📋 RESUMO DA VERIFICAÇÃO DE TAXAS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`   ✅ Matches Perfeitos (diff < R$ 0.01): ${perfectMatches}`);
    console.log(`   ~ Matches Próximos (diff < R$ 1.00): ${closeMatches}`);
    console.log(`   ⚠️  Diferenças Significativas (diff > R$ 5.00): ${significantDiffs}`);
    console.log(`\n   💰 Soma Total de Diferenças: ${formatMoney(totalDiff)}`);
    console.log(`   📊 Média por Pedido: ${formatMoney(totalDiff / results.length)}`);

    // Show worst cases
    if (significantDiffs > 0) {
        console.log('\n   🔍 PIORES CASOS (para investigação):');
        const sorted = results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        sorted.slice(0, 5).forEach(r => {
            console.log(`      Pedido ${r.pedido}: Esperado ${formatMoney(r.esperado)} vs Real ${formatMoney(r.real)} (Diff: ${formatMoney(r.diff)})`);
        });
    }

    console.log('\n═══════════════════════════════════════════════════════════════');

    if (significantDiffs === 0) {
        console.log('   ✅ AUDITORIA DE TAXAS APROVADA: Cálculos precisos!');
    } else if (significantDiffs < 3) {
        console.log('   ⚠️  AUDITORIA DE TAXAS: Poucos casos com diferença significativa');
        console.log('      Pode ser devido a: vouchers, campanhas, ou ajustes manuais.');
    } else {
        console.log('   ❌ AUDITORIA DE TAXAS: Múltiplos casos com diferença significativa');
        console.log('      AÇÃO NECESSÁRIA: Revisar fórmulas de cálculo de taxas.');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');
}

runFeeCalculationAudit().catch(console.error);
