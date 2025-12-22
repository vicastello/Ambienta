/**
 * Backfill completo de dados de escrow para todos pedidos Shopee
 * Atualiza voucher_from_seller, ams_commission_fee, etc.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env.vercel');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
});

const supabase = createClient(
    envVars.NEXT_PUBLIC_SUPABASE_URL,
    envVars.SUPABASE_SERVICE_ROLE_KEY
);

const API_BASE = 'http://localhost:3000';

async function runBackfill() {
    console.log('=== Backfill de Escrow Shopee ===\n');

    // Primeiro, resetar o escrow_fetched_at para forçar reatualização
    const { error: resetError } = await supabase
        .from('shopee_orders')
        .update({ escrow_fetched_at: null })
        .not('order_sn', 'is', null);

    if (resetError) {
        console.error('Erro ao resetar escrow_fetched_at:', resetError.message);
        return;
    }

    console.log('escrow_fetched_at resetado para todos pedidos.\n');

    // Agora chamar o endpoint em loop até não ter mais pedidos
    let totalProcessed = 0;
    let totalWithVoucher = 0;
    let totalWithAffiliate = 0;
    let iteration = 1;

    while (true) {
        console.log(`[Iteração ${iteration}] Buscando próximo batch...`);

        try {
            const response = await fetch(`${API_BASE}/api/marketplaces/shopee/sync-escrow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ periodDays: 365 }),
            });

            const data = await response.json();

            if (!data.ok) {
                console.error('Erro na API:', data.error);
                break;
            }

            const { ordersRequested, ordersUpdated, ordersWithSellerVoucher } = data.data;

            if (ordersRequested === 0) {
                console.log('\nNenhum pedido pendente. Backfill concluído!');
                break;
            }

            totalProcessed += ordersUpdated;
            totalWithVoucher += ordersWithSellerVoucher;

            console.log(`  Processados: ${ordersUpdated}/${ordersRequested}, com voucher: ${ordersWithSellerVoucher}`);

            iteration++;

            // Small delay between batches
            await new Promise(r => setTimeout(r, 1000));

        } catch (err) {
            console.error('Erro ao chamar API:', err);
            break;
        }
    }

    // Agora contar quantos têm affiliate commission
    const { count: affiliateCount } = await supabase
        .from('shopee_orders')
        .select('*', { count: 'exact', head: true })
        .gt('ams_commission_fee', 0);

    totalWithAffiliate = affiliateCount || 0;

    console.log('\n=== RESUMO DO BACKFILL ===');
    console.log(`Total de pedidos processados: ${totalProcessed}`);
    console.log(`Pedidos com cupom do vendedor: ${totalWithVoucher}`);
    console.log(`Pedidos com comissão de afiliado: ${totalWithAffiliate}`);
}

runBackfill().catch(console.error);
