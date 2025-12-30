
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function match() {
    console.log('🔍 Tentando casar pedidos Tiny (sem link) com Shopee (Jan 2025)...');

    // 1. Get Tiny orders from Jan without links
    const { data: tinyOrders } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido, data_criacao, valor, valor_total_pedido, cliente_nome, numero_pedido_ecommerce')
        .gte('data_criacao', '2025-01-01')
        .lt('data_criacao', '2025-02-01')
        .is('numero_pedido_ecommerce', null);

    if (!tinyOrders || tinyOrders.length === 0) {
        console.log('Nenhum pedido Tiny sem link encontrado em Jan.');
        return;
    }
    console.log(`Encontrados ${tinyOrders.length} pedidos Tiny órfãos.`);

    // 2. Get Shopee orders from Jan
    const { data: shopeeOrders } = await supabase
        .from('shopee_orders')
        .select('order_sn, create_time, total_amount, recipient_name')
        .gte('create_time', '2025-01-01')
        .lt('create_time', '2025-02-01');

    if (!shopeeOrders || shopeeOrders.length === 0) {
        console.log('Nenhum pedido Shopee encontrado em Jan.');
        return;
    }
    console.log(`Encontrados ${shopeeOrders.length} pedidos Shopee.`);

    // 3. Try to match
    let matches = 0;
    for (const tiny of tinyOrders) {
        const tinyDate = new Date(tiny.data_criacao);
        const tinyVal = Number(tiny.valor || tiny.valor_total_pedido || 0);

        // Find candidate in shopee
        const candidates = shopeeOrders.filter(s => {
            const shopeeDate = new Date(s.create_time);
            const diffTime = Math.abs(shopeeDate.getTime() - tinyDate.getTime());
            const diffHours = diffTime / (1000 * 60 * 60);

            const shopeeVal = s.total_amount;
            const valDiff = Math.abs(shopeeVal - tinyVal);

            // Criteria: Value exact match (often Tiny value matches Shopee total) 
            // AND Date within 48h (sometimes sync date differs from create date)
            return valDiff < 0.05 && diffHours < 48;
        });

        if (candidates.length === 1) {
            matches++;
            const match = candidates[0];
            console.log(`✅ MATCH: Tiny #${tiny.numero_pedido} (R$${tinyVal}) <-> Shopee ${match.order_sn} (R$${match.total_amount}) | ${tiny.cliente_nome} vs ${match.recipient_name}`);
        } else if (candidates.length > 1) {
            // Fuzzy name match?
            console.log(`⚠️  Ambíguo: Tiny #${tiny.numero_pedido} tem ${candidates.length} candidatos.`);
        }
    }

    console.log(`\nResumo: ${matches} possíveis matches encontrados em ${tinyOrders.length} pedidos.`);
}

match();
