
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function linkJan() {
    console.log('🔗 Vinculando pedidos de Janeiro 2025 (Forçado)...');

    // 1. Get Tiny orders from Jan with ecommerce ID
    const { data: tinyOrders } = await supabase
        .from('tiny_orders')
        .select('id, numero_pedido, numero_pedido_ecommerce, valor, data_criacao')
        .gte('data_criacao', '2025-01-01')
        .lt('data_criacao', '2025-02-01')
        .not('numero_pedido_ecommerce', 'is', null);

    if (!tinyOrders?.length) {
        console.log('Nenhum pedido Tiny elegível encontrado.');
        return;
    }
    console.log(`Encontrados ${tinyOrders.length} pedidos em Jan com ID de e-commerce.`);

    let linked = 0;
    let errors = 0;
    let already = 0;

    for (const tiny of tinyOrders) {
        const marketplaceOrderId = tiny.numero_pedido_ecommerce!;
        // Guess marketplace (mostly Shopee based on ID format, but could be others)
        // Shopee IDs are usually alphanum strings like '250101...'
        // Magalu are usually numeric or 'LU...'
        // Meli are numeric

        // For safety, we can check identifying prefix or just try to insert?
        // The previous script logic uses heuristics.
        // Simplifying: If starts with '25', likely Shopee for year 2025 orders? 
        // Actually Shopee IDs format `YYMMDD...` matches `2501...` perfectly.

        let marketplace = 'shopee'; // default guess for this batch
        if (/^\d{16}$/.test(marketplaceOrderId)) marketplace = 'mercado_livre'; // 16 digits often ML
        // if (marketplaceOrderId.startsWith('LU')) marketplace = 'magalu';

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
                // created_at handles by default
            });

        if (error) {
            console.error(`Erro ao vincular ${marketplaceOrderId}:`, error.message);
            errors++;
        } else {
            linked++;
            if (linked % 50 === 0) process.stdout.write('.');
        }
    }

    console.log(`\n\nResumo:`);
    console.log(`✅ Vinculados agora: ${linked}`);
    console.log(`⏭️ Já vinculados: ${already}`);
    console.log(`❌ Erros: ${errors}`);
}

linkJan();
