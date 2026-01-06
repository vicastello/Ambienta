import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load envs
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function investigateMagalu(orderId: string) {
    console.log('='.repeat(80));
    console.log(`🔎 INVESTIGAÇÃO MAGALU - PEDIDO: ${orderId}`);
    console.log('='.repeat(80));

    // 1. Buscar pedido no Tiny
    console.log('\n' + '='.repeat(40));
    console.log('📦 DADOS DO TINY');
    console.log('='.repeat(40));

    const { data: tinyOrder } = await supabase
        .from('tiny_orders')
        .select('*')
        .eq('numero_pedido_ecommerce', orderId)
        .single();

    if (tinyOrder) {
        console.log(`  tiny_id: ${tinyOrder.tiny_id}`);
        console.log(`  numero_pedido: ${tinyOrder.numero_pedido}`);
        console.log(`  numero_pedido_ecommerce: ${tinyOrder.numero_pedido_ecommerce}`);
        console.log(`  cliente: ${tinyOrder.cliente_nome}`);
        console.log(`  valor: ${tinyOrder.valor}`);
        console.log(`  valor_frete: ${tinyOrder.valor_frete}`);
        console.log(`  valor_total_pedido: ${tinyOrder.valor_total_pedido}`);
        console.log(`  situacao: ${tinyOrder.situacao}`);
        console.log(`  canal: ${tinyOrder.canal}`);
        console.log(`  data_criacao: ${tinyOrder.data_criacao}`);
    } else {
        console.log('  ⚠️ Pedido não encontrado no Tiny!');

        // Try with partial match
        const { data: partialMatch } = await supabase
            .from('tiny_orders')
            .select('*')
            .ilike('numero_pedido_ecommerce', `%${orderId}%`)
            .limit(5);

        if (partialMatch && partialMatch.length > 0) {
            console.log('\n  Possíveis matches:');
            partialMatch.forEach((o: any) => {
                console.log(`    - ${o.numero_pedido_ecommerce} (valor: ${o.valor})`);
            });
        }
        return;
    }

    // 2. Buscar link do marketplace
    console.log('\n' + '='.repeat(40));
    console.log('🔗 LINK DO MARKETPLACE');
    console.log('='.repeat(40));

    const { data: linkData } = await supabase
        .from('marketplace_order_links')
        .select('*')
        .eq('tiny_order_id', tinyOrder.id)
        .single();

    if (linkData) {
        console.log(`  marketplace: ${linkData.marketplace}`);
        console.log(`  product_count: ${linkData.product_count}`);
        console.log(`  is_kit: ${linkData.is_kit}`);
        console.log(`  uses_free_shipping: ${linkData.uses_free_shipping}`);
    } else {
        console.log('  ⚠️ Sem link de marketplace');
    }

    // 3. Buscar pagamentos associados
    console.log('\n' + '='.repeat(40));
    console.log('💰 PAGAMENTOS RECEBIDOS');
    console.log('='.repeat(40));

    const { data: payments } = await supabase
        .from('marketplace_payments')
        .select('*')
        .eq('tiny_order_id', tinyOrder.id);

    if (payments && payments.length > 0) {
        payments.forEach((p: any, i: number) => {
            console.log(`\n  Pagamento ${i + 1}:`);
            console.log(`    id: ${p.id}`);
            console.log(`    order_id: ${p.order_id}`);
            console.log(`    source: ${p.source}`);
            console.log(`    payment_date: ${p.payment_date}`);
            console.log(`    gross_amount: ${p.gross_amount}`);
            console.log(`    net_amount: ${p.net_amount}`);
            console.log(`    transaction_type: ${p.transaction_type}`);
            console.log(`    is_expense: ${p.is_expense}`);
            console.log(`    description: ${p.description?.substring(0, 50)}...`);
        });

        const totalReceived = payments.reduce((sum: number, p: any) => {
            return sum + (p.is_expense ? -Number(p.net_amount || 0) : Number(p.net_amount || 0));
        }, 0);
        console.log(`\n  💵 Total Líquido Recebido: R$ ${totalReceived.toFixed(2)}`);
    } else {
        console.log('  ⚠️ Nenhum pagamento encontrado!');

        // Try finding by order_id pattern
        const { data: paymentsByPattern } = await supabase
            .from('marketplace_payments')
            .select('*')
            .or(`order_id.ilike.%${orderId}%,description.ilike.%${orderId}%`)
            .limit(10);

        if (paymentsByPattern && paymentsByPattern.length > 0) {
            console.log('\n  Possíveis pagamentos (por pattern):');
            paymentsByPattern.forEach((p: any) => {
                console.log(`    - order_id: ${p.order_id}, net: ${p.net_amount}, date: ${p.payment_date}`);
            });
        }
    }

    // 4. Buscar configuração de taxas do Magalu
    console.log('\n' + '='.repeat(40));
    console.log('⚙️ CONFIGURAÇÃO DE TAXAS MAGALU');
    console.log('='.repeat(40));

    const { data: feeConfig } = await supabase
        .from('marketplace_fee_configs')
        .select('*')
        .eq('marketplace', 'magalu')
        .single();

    if (feeConfig) {
        console.log(`  Configuração encontrada:`, JSON.stringify(feeConfig.config, null, 2));
    } else {
        console.log('  ⚠️ Sem configuração de taxas para Magalu');
    }

    // 5. Calcular taxas esperadas
    console.log('\n' + '='.repeat(40));
    console.log('📊 ANÁLISE DE TAXAS');
    console.log('='.repeat(40));

    const valorPedido = Number(tinyOrder.valor) || 0;
    const valorFrete = Number(tinyOrder.valor_frete) || 0;
    const baseTaxas = valorPedido - valorFrete;

    console.log(`\n  Valor do Pedido (Tiny): R$ ${valorPedido.toFixed(2)}`);
    console.log(`  Valor do Frete: R$ ${valorFrete.toFixed(2)}`);
    console.log(`  Base para Taxas: R$ ${baseTaxas.toFixed(2)}`);

    // Default Magalu rates (from config or hardcoded)
    const commissionRate = feeConfig?.config?.commission_rate || 0.16; // 16%
    const campaignRate = feeConfig?.config?.campaign_fee_default || 0;
    const fixedCostPerUnit = feeConfig?.config?.fixed_cost_per_product || 3.0;
    const productCount = linkData?.product_count || 1;

    const expectedComm = baseTaxas * commissionRate;
    const expectedCampaign = baseTaxas * campaignRate;
    const expectedFixed = fixedCostPerUnit * productCount;
    const totalExpectedFees = expectedComm + expectedCampaign + expectedFixed;
    const expectedNet = baseTaxas - totalExpectedFees;

    console.log(`\n  [Cálculo Esperado com ${(commissionRate * 100).toFixed(1)}% comissão]`);
    console.log(`    Comissão (${(commissionRate * 100).toFixed(1)}%): -R$ ${expectedComm.toFixed(2)}`);
    console.log(`    Campanha (${(campaignRate * 100).toFixed(1)}%): -R$ ${expectedCampaign.toFixed(2)}`);
    console.log(`    Custo Fixo (${fixedCostPerUnit} x ${productCount}): -R$ ${expectedFixed.toFixed(2)}`);
    console.log(`    Total Taxas Esperadas: -R$ ${totalExpectedFees.toFixed(2)}`);
    console.log(`    Líquido Esperado: R$ ${expectedNet.toFixed(2)}`);

    if (payments && payments.length > 0) {
        const totalReceived = payments.reduce((sum: number, p: any) => {
            return sum + (p.is_expense ? -Number(p.net_amount || 0) : Number(p.net_amount || 0));
        }, 0);

        console.log(`\n  [Comparação]`);
        console.log(`    Líquido Esperado: R$ ${expectedNet.toFixed(2)}`);
        console.log(`    Líquido Recebido: R$ ${totalReceived.toFixed(2)}`);
        console.log(`    DIFERENÇA: R$ ${(totalReceived - expectedNet).toFixed(2)}`);

        if (totalReceived < expectedNet) {
            const realFees = baseTaxas - totalReceived;
            const impliedRate = (realFees - expectedFixed) / baseTaxas;
            console.log(`\n  [Taxa Implícita Real]`);
            console.log(`    Taxas Reais: R$ ${realFees.toFixed(2)}`);
            console.log(`    Taxa % Implícita: ${(impliedRate * 100).toFixed(2)}%`);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('FIM DA INVESTIGAÇÃO');
    console.log('='.repeat(80));
}

investigateMagalu('LU-1490170781969462').catch(console.error);
