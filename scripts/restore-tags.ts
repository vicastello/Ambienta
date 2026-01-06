
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load env
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env.local', override: true });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function restoreTags() {
    console.log('🔄 Restaurando tags em marketplace_payments...');

    // Fetch payments with empty or null tags
    // We process in batches to avoid memory issues
    const { data: payments, error } = await supabase
        .from('marketplace_payments')
        .select('id, marketplace, transaction_type, is_expense, tags')
        .or('tags.is.null,tags.eq.{}'); // tags is null OR tags is empty array (Postgres array syntax might need check)

    if (error) {
        console.error('Erro ao buscar payments:', error);
        return;
    }

    if (!payments || payments.length === 0) {
        // Double check with local filtering if OR syntax fails
        console.log('Nenhum pagamento encontrado com filtro inicial (ou sintaxe OR falhou). Tentando buscar todos e filtrar localmente...');
        // Fallback: simple select
    }

    // Let's just fetch recent payments to be safe/faster for testing, or all if feasible.
    // For now, let's fetch ALL payments that have NO tags (locally filtered if needed)
    // Actually, "tags.eq.{}" might not work for JSON B or array types depending on how supabase handles it.
    // Let's fetch where tags is null first.

    let candidates = payments || [];
    if (candidates.length === 0) {
        const { data: allPayments } = await supabase
            .from('marketplace_payments')
            .select('id, marketplace, transaction_type, is_expense, tags')
            .order('payment_date', { ascending: false })
            .limit(1000); // Limit to 1000 recent ones for safety

        candidates = (allPayments || []).filter(p => !p.tags || p.tags.length === 0);
    }

    console.log(`🔎 Encontrados ${candidates.length} pagamentos sem tags.`);

    let updatedCount = 0;

    for (const p of candidates) {
        let newTags: string[] = [];

        // 1. Marketplace Tag
        if (p.marketplace) {
            newTags.push(p.marketplace.toLowerCase());
        }

        // 2. Transaction Type Tags
        const type = (p.transaction_type || '').toLowerCase();

        if (type.includes('escrow') || type.includes('order') || type.includes('adjustment')) {
            if (p.is_expense) {
                // Determine if it's a specific type of expense
                if (type.includes('shipping') || type.includes('freight')) newTags.push('frete');
                else if (type.includes('commission')) newTags.push('comissão');
                else if (type.includes('tax')) newTags.push('imposto');
                else if (type.includes('refund')) newTags.push('reembolso');
                else newTags.push('taxa'); // Generic expense
            } else {
                newTags.push('venda'); // Income from order/escrow
            }
        } else if (type.includes('withdrawal')) {
            newTags.push('saque');
        }

        // Deduplicate
        newTags = [...new Set(newTags)];

        if (newTags.length > 0) {
            const { error: updateError } = await supabase
                .from('marketplace_payments')
                .update({ tags: newTags })
                .eq('id', p.id);

            if (!updateError) {
                updatedCount++;
                if (updatedCount % 50 === 0) process.stdout.write('.');
            } else {
                console.error(`Error updating payment ${p.id}:`, updateError);
            }
        }
    }

    console.log(`\n✅ Tags restauradas em ${updatedCount} pagamentos.`);
}

restoreTags().catch(console.error);
