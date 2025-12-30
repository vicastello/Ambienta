
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function linkNovDec2024() {
    console.log('🔗 Vinculando pedidos de Nov-Dez 2024...');

    // Get Tiny orders from Nov-Dec 2024 with ecommerce ID
    const { data: tinyOrders } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido, numero_pedido_ecommerce, data_criacao')
        .gte('data_criacao', '2024-11-01')
        .lt('data_criacao', '2025-01-01')
        .not('numero_pedido_ecommerce', 'is', null);

    if (!tinyOrders?.length) {
        console.log('Nenhum pedido Tiny encontrado.');
        return;
    }
    console.log(`Encontrados ${tinyOrders.length} pedidos Tiny com ID de e-commerce.`);

    let linked = 0;
    let errors = 0;
    let already = 0;

    for (const tiny of tinyOrders) {
        const marketplaceOrderId = tiny.numero_pedido_ecommerce!;
        let marketplace = 'shopee';
        if (/^\d{16}$/.test(marketplaceOrderId)) marketplace = 'mercado_livre';

        // Check if link exists
        const { data: link } = await supabase
            .from('marketplace_order_links')
            .select('id')
            .eq('marketplace_order_id', marketplaceOrderId)
            .eq('marketplace', marketplace)
            .maybeSingle();

        if (link) {
            already++;
            continue;
        }

        // Create link
        const { error } = await supabase
            .from('marketplace_order_links')
            .insert({
                marketplace,
                marketplace_order_id: marketplaceOrderId,
                tiny_order_id: tiny.id
            });

        if (error) {
            if (!error.message.includes('duplicate')) {
                console.error(`Erro ao vincular ${marketplaceOrderId}:`, error.message);
            }
            errors++;
        } else {
            linked++;
            if (linked % 50 === 0) process.stdout.write('.');
        }
    }

    console.log(`\n\nResumo:`);
    console.log(`✅ Vinculados agora: ${linked}`);
    console.log(`⏭️ Já vinculados: ${already}`);
    console.log(`❌ Erros/duplicados: ${errors}`);
}

linkNovDec2024();
