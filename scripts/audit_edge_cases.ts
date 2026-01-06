/**
 * AUDIT SCRIPT: Phase 5 - Edge Case Investigation
 * 
 * This script deep-dives into the worst-case discrepancies found in Phase 4
 * to understand exactly what is causing the fee calculation differences.
 * 
 * Run with: npx tsx scripts/audit_edge_cases.ts
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

// --- Order IDs to investigate (from Phase 4 worst cases) ---
const INVESTIGATE_ORDERS = ['24352', '24345', '24493', '24426', '24551'];

// --- Main Audit Function ---
async function runEdgeCaseInvestigation() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   🔬 AUDITORIA FASE 5: INVESTIGAÇÃO DE CASOS ESPECÍFICOS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const { calculateMarketplaceFees } = await import('../lib/marketplace-fees');

    for (const orderNum of INVESTIGATE_ORDERS) {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`   📋 PEDIDO #${orderNum}`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        // ══════════════════════════════════════════════════════════════════════
        // Fetch all related data for this order
        // ══════════════════════════════════════════════════════════════════════

        // 1. Tiny Order
        const { data: order } = await supabase
            .from('tiny_orders')
            .select(`
                *,
                marketplace_payments!marketplace_payments_tiny_order_id_fkey (*),
                marketplace_order_links (*)
            `)
            .eq('numero_pedido', orderNum)
            .single();

        if (!order) {
            console.log('   ❌ Pedido não encontrado\n');
            continue;
        }

        console.log('   📦 DADOS DO TINY ORDER:');
        console.log(`      ID: ${order.id}`);
        console.log(`      Número Ecommerce: ${order.numero_pedido_ecommerce}`);
        console.log(`      Canal: ${order.canal}`);
        console.log(`      Valor Total: ${formatMoney(Number(order.valor || order.valor_total_pedido || 0))}`);
        console.log(`      Valor Frete: ${formatMoney(Number(order.valor_frete || 0))}`);
        console.log(`      Base para Taxas: ${formatMoney(Number(order.valor || order.valor_total_pedido || 0) - Number(order.valor_frete || 0))}`);
        console.log(`      Status: ${order.payment_received ? 'PAGO' : 'PENDENTE'}`);
        console.log(`      Fee Overrides: ${order.fee_overrides ? JSON.stringify(order.fee_overrides) : 'Nenhum'}`);

        // 2. Shopee Order (if applicable)
        if (order.numero_pedido_ecommerce) {
            const { data: shopeeOrder } = await supabase
                .from('shopee_orders')
                .select('*')
                .eq('order_sn', order.numero_pedido_ecommerce)
                .single();

            if (shopeeOrder) {
                console.log('\n   🛒 DADOS DA SHOPEE ORDER:');
                console.log(`      Order Selling Price: ${formatMoney(Number(shopeeOrder.order_selling_price || 0))}`);
                console.log(`      Order Discounted Price: ${formatMoney(Number(shopeeOrder.order_discounted_price || 0))}`);
                console.log(`      Escrow Amount (REAL): ${formatMoney(Number(shopeeOrder.escrow_amount || 0))}`);
                console.log(`      Voucher from Seller: ${formatMoney(Number(shopeeOrder.voucher_from_seller || 0))}`);
                console.log(`      Voucher from Shopee: ${formatMoney(Number(shopeeOrder.voucher_from_shopee || 0))}`);
                console.log(`      Seller Discount: ${formatMoney(Number(shopeeOrder.seller_discount || 0))}`);
                console.log(`      AMS Commission Fee: ${formatMoney(Number(shopeeOrder.ams_commission_fee || 0))}`);
                console.log(`      Commission Fee: ${formatMoney(Number(shopeeOrder.commission_fee || 0))}`);
                console.log(`      Service Fee: ${formatMoney(Number(shopeeOrder.service_fee || 0))}`);
                console.log(`      Transaction Fee: ${formatMoney(Number(shopeeOrder.transaction_fee || 0))}`);
            }

            // 3. Shopee Items
            const { data: shopeeItems } = await supabase
                .from('shopee_order_items')
                .select('*')
                .eq('order_sn', order.numero_pedido_ecommerce);

            if (shopeeItems && shopeeItems.length > 0) {
                console.log('\n   📦 ITENS DO PEDIDO:');
                let totalQty = 0;
                shopeeItems.forEach((item, i) => {
                    console.log(`      ${i + 1}. Qtd: ${item.quantity} | Preço: ${formatMoney(Number(item.discounted_price || item.original_price || 0))} | SKU: ${item.item_sku}`);
                    totalQty += Number(item.quantity || 1);
                });
                console.log(`      TOTAL ITENS: ${totalQty}`);
            }
        }

        // 4. Marketplace Payments
        const payments = Array.isArray(order.marketplace_payments)
            ? order.marketplace_payments
            : (order.marketplace_payments ? [order.marketplace_payments] : []);

        console.log('\n   💳 PAGAMENTOS VINCULADOS:');
        if (payments.length === 0) {
            console.log('      Nenhum pagamento vinculado');
        } else {
            payments.forEach((p: any, i: number) => {
                console.log(`      ${i + 1}. Net Amount: ${formatMoney(Number(p.net_amount || 0))} | Is Expense: ${p.is_expense} | Type: ${p.transaction_type}`);
            });
            const totalReal = payments.reduce((sum: number, p: any) => {
                const val = Math.abs(Number(p.net_amount || 0));
                return sum + (p.is_expense ? -val : val);
            }, 0);
            console.log(`      SOMA REAL: ${formatMoney(totalReal)}`);
        }

        // 5. Marketplace Order Links
        const links = order.marketplace_order_links || [];
        console.log('\n   🔗 LINKS DE MARKETPLACE:');
        if (links.length === 0) {
            console.log('      Nenhum link cadastrado');
        } else {
            links.forEach((l: any, i: number) => {
                console.log(`      ${i + 1}. Product Count: ${l.product_count} | Is Kit: ${l.is_kit} | Free Shipping: ${l.uses_free_shipping} | Campaign: ${l.is_campaign_order}`);
            });
        }

        // 6. Calculate Expected Value
        console.log('\n   🧮 CÁLCULO DE TAXAS (SISTEMA):');

        const valorBruto = Number(order.valor || order.valor_total_pedido || 0);
        const valorFrete = Number(order.valor_frete || 0);
        const baseTaxas = Math.max(0, valorBruto - valorFrete);

        const canal = order.canal?.toLowerCase() || '';
        let marketplace: 'shopee' | 'mercado_livre' | 'magalu' | undefined;

        if (canal.includes('shopee')) marketplace = 'shopee';
        else if (canal.includes('mercado') || canal.includes('meli')) marketplace = 'mercado_livre';
        else if (canal.includes('magalu') || canal.includes('magazine')) marketplace = 'magalu';

        if (marketplace) {
            const linkData = links[0] as any;
            let productCount = linkData?.product_count || 1;
            let isKit = linkData?.is_kit || false;

            // Fetch Shopee items for fallback count
            if (marketplace === 'shopee' && order.numero_pedido_ecommerce) {
                const { data: sItems } = await supabase
                    .from('shopee_order_items')
                    .select('quantity')
                    .eq('order_sn', order.numero_pedido_ecommerce);

                if (sItems && sItems.length > 0 && (!linkData || !linkData.product_count)) {
                    productCount = sItems.reduce((acc: number, i: any) => acc + (i.quantity || 1), 0);
                }
            }

            const feeCalc = await calculateMarketplaceFees({
                marketplace,
                orderValue: baseTaxas,
                productCount,
                isKit,
                usesFreeShipping: (order.fee_overrides as any)?.usesFreeShipping ?? (linkData?.uses_free_shipping || false),
                isCampaignOrder: linkData?.is_campaign_order || false,
                orderDate: new Date(order.data_criacao || new Date())
            });

            console.log(`      Marketplace: ${marketplace}`);
            console.log(`      Base para Cálculo: ${formatMoney(baseTaxas)}`);
            console.log(`      Product Count Usado: ${productCount}`);
            console.log(`      Is Kit: ${isKit}`);
            console.log('      --- BREAKDOWN ---');
            console.log(`      Comissão: ${formatMoney(feeCalc.commissionFee)} (${((feeCalc.commissionFee / baseTaxas) * 100).toFixed(1)}%)`);
            console.log(`      Taxa Fixa: ${formatMoney(feeCalc.fixedCost)}`);
            console.log(`      Campanha: ${formatMoney(feeCalc.campaignFee || 0)}`);
            console.log(`      Total Taxas: ${formatMoney(feeCalc.totalFees)}`);
            console.log(`      VALOR LÍQUIDO ESPERADO: ${formatMoney(feeCalc.netValue)}`);

            // Compare with actual
            if (payments.length > 0) {
                const valorReal = payments.reduce((sum: number, p: any) => {
                    const val = Math.abs(Number(p.net_amount || 0));
                    return sum + (p.is_expense ? -val : val);
                }, 0);

                const diff = valorReal - feeCalc.netValue;
                console.log(`\n   📊 COMPARAÇÃO:`);
                console.log(`      Esperado: ${formatMoney(feeCalc.netValue)}`);
                console.log(`      Real: ${formatMoney(valorReal)}`);
                console.log(`      Diferença: ${formatMoney(diff)} ${Math.abs(diff) > 1 ? '⚠️' : '✅'}`);

                // Possible causes
                if (Math.abs(diff) > 1) {
                    console.log('\n   🔍 POSSÍVEIS CAUSAS DA DIFERENÇA:');

                    // Check for voucher from seller
                    const { data: sOrder } = await supabase
                        .from('shopee_orders')
                        .select('voucher_from_seller, ams_commission_fee, seller_discount')
                        .eq('order_sn', order.numero_pedido_ecommerce)
                        .single();

                    if (sOrder) {
                        if (Number(sOrder.voucher_from_seller || 0) > 0) {
                            console.log(`      - VOUCHER DO VENDEDOR: ${formatMoney(Number(sOrder.voucher_from_seller))} (NÃO computado no cálculo)`);
                        }
                        if (Number(sOrder.ams_commission_fee || 0) > 0) {
                            console.log(`      - AMS COMMISSION (ADS): ${formatMoney(Number(sOrder.ams_commission_fee))} (NÃO computado no cálculo)`);
                        }
                        if (Number(sOrder.seller_discount || 0) > 0) {
                            console.log(`      - SELLER DISCOUNT: ${formatMoney(Number(sOrder.seller_discount))} (NÃO computado no cálculo)`);
                        }
                    }
                }
            }
        }

        console.log('\n');
    }
}

runEdgeCaseInvestigation().catch(console.error);
