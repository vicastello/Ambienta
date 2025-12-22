// Script to fix Portuguese accents in tags
// Run with: npx tsx scripts/fix-tag-accents.ts

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load env before creating client
dotenv.config({ path: '.env.vercel' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Mapping of incorrect tags to correct Portuguese
const corrections: Record<string, string> = {
    'devolucao': 'devolução',
    'devolução': 'devolução', // keep if already correct
    'comissao': 'comissão',
    'comissão': 'comissão',
    'promocao': 'promoção',
    'promoção': 'promoção',
    'afiliação': 'afiliação',
    'afiliacao': 'afiliação',
    'entradas multiplas': 'entradas múltiplas',
    'entradas múltiplas': 'entradas múltiplas',
};

function correctTagName(tag: string): string {
    const lower = tag.toLowerCase();

    // Check for exact matches first
    if (corrections[lower]) {
        return corrections[lower];
    }

    // Check for partial matches
    for (const [incorrect, correct] of Object.entries(corrections)) {
        if (lower.includes(incorrect)) {
            return lower.replace(incorrect, correct);
        }
    }

    return lower; // Return lowercase if no correction needed
}

async function fixTagAccents() {
    console.log('✏️ Corrigindo acentos nas tags...\n');

    // 1. Fix tags in marketplace_payments
    console.log('📦 Corrigindo marketplace_payments.tags...');
    const { data: payments, error: e1 } = await supabase
        .from('marketplace_payments')
        .select('id, tags')
        .not('tags', 'is', null);

    if (e1) {
        console.error('Erro ao buscar payments:', e1);
        return;
    }

    let updatedPayments = 0;
    for (const payment of payments || []) {
        if (payment.tags && Array.isArray(payment.tags)) {
            const correctedTags = payment.tags.map((t: string) => correctTagName(t));
            const hasChanges = JSON.stringify(payment.tags) !== JSON.stringify(correctedTags);

            if (hasChanges) {
                const { error } = await supabase
                    .from('marketplace_payments')
                    .update({ tags: correctedTags })
                    .eq('id', payment.id);

                if (!error) {
                    updatedPayments++;
                    console.log(`  ✓ Payment ${payment.id}: [${payment.tags.join(', ')}] → [${correctedTags.join(', ')}]`);
                }
            }
        }
    }
    console.log(`  Total: ${updatedPayments} payments atualizados\n`);

    // 2. Fix tags in order_tags
    console.log('📋 Corrigindo order_tags.tag_name...');
    const { data: orderTags, error: e2 } = await supabase
        .from('order_tags')
        .select('id, tag_name');

    if (e2) {
        console.error('Erro ao buscar order_tags:', e2);
        return;
    }

    let updatedOrderTags = 0;
    for (const ot of orderTags || []) {
        const corrected = correctTagName(ot.tag_name);
        if (ot.tag_name !== corrected) {
            const { error } = await supabase
                .from('order_tags')
                .update({ tag_name: corrected })
                .eq('id', ot.id);

            if (!error) {
                updatedOrderTags++;
                console.log(`  ✓ OrderTag ${ot.id}: "${ot.tag_name}" → "${corrected}"`);
            }
        }
    }
    console.log(`  Total: ${updatedOrderTags} order_tags atualizados\n`);

    // 3. Fix tags in available_tags
    console.log('🏷️ Corrigindo available_tags.name...');
    const { data: availableTags, error: e3 } = await supabase
        .from('available_tags')
        .select('id, name');

    if (e3) {
        console.error('Erro ao buscar available_tags:', e3);
        return;
    }

    let updatedAvailableTags = 0;
    for (const at of availableTags || []) {
        const corrected = correctTagName(at.name);
        if (at.name !== corrected) {
            const { error } = await supabase
                .from('available_tags')
                .update({ name: corrected })
                .eq('id', at.id);

            if (!error) {
                updatedAvailableTags++;
                console.log(`  ✓ AvailableTag ${at.id}: "${at.name}" → "${corrected}"`);
            }
        }
    }
    console.log(`  Total: ${updatedAvailableTags} available_tags atualizados\n`);

    console.log('✅ Correção de acentos concluída!');
    console.log(`   - ${updatedPayments} marketplace_payments`);
    console.log(`   - ${updatedOrderTags} order_tags`);
    console.log(`   - ${updatedAvailableTags} available_tags`);
}

fixTagAccents().catch(console.error);
