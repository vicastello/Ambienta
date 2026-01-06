// Script to normalize all existing tags to lowercase in the database
// Run with: npx tsx scripts/normalize-tags.ts

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load env before creating client
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function normalizeTagsToLowercase() {
    console.log('🏷️ Normalizando tags para lowercase...\n');

    // 1. Normalize tags in marketplace_payments
    console.log('📦 Atualizando marketplace_payments.tags...');
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
            const normalizedTags = payment.tags.map((t: string) => t.toLowerCase());
            const hasChanges = JSON.stringify(payment.tags) !== JSON.stringify(normalizedTags);

            if (hasChanges) {
                const { error } = await supabase
                    .from('marketplace_payments')
                    .update({ tags: normalizedTags })
                    .eq('id', payment.id);

                if (!error) {
                    updatedPayments++;
                    console.log(`  ✓ Payment ${payment.id}: ${payment.tags.join(', ')} → ${normalizedTags.join(', ')}`);
                }
            }
        }
    }
    console.log(`  Total: ${updatedPayments} payments atualizados\n`);

    // 2. Normalize tags in order_tags
    console.log('📋 Atualizando order_tags.tag_name...');
    const { data: orderTags, error: e2 } = await supabase
        .from('order_tags')
        .select('id, tag_name');

    if (e2) {
        console.error('Erro ao buscar order_tags:', e2);
        return;
    }

    let updatedOrderTags = 0;
    for (const ot of orderTags || []) {
        const normalized = ot.tag_name.toLowerCase();
        if (ot.tag_name !== normalized) {
            const { error } = await supabase
                .from('order_tags')
                .update({ tag_name: normalized })
                .eq('id', ot.id);

            if (!error) {
                updatedOrderTags++;
                console.log(`  ✓ OrderTag ${ot.id}: "${ot.tag_name}" → "${normalized}"`);
            }
        }
    }
    console.log(`  Total: ${updatedOrderTags} order_tags atualizados\n`);

    // 3. Normalize tags in available_tags
    console.log('🏷️ Atualizando available_tags.name...');
    const { data: availableTags, error: e3 } = await supabase
        .from('available_tags')
        .select('id, name');

    if (e3) {
        console.error('Erro ao buscar available_tags:', e3);
        return;
    }

    let updatedAvailableTags = 0;
    for (const at of availableTags || []) {
        const normalized = at.name.toLowerCase();
        if (at.name !== normalized) {
            const { error } = await supabase
                .from('available_tags')
                .update({ name: normalized })
                .eq('id', at.id);

            if (!error) {
                updatedAvailableTags++;
                console.log(`  ✓ AvailableTag ${at.id}: "${at.name}" → "${normalized}"`);
            }
        }
    }
    console.log(`  Total: ${updatedAvailableTags} available_tags atualizados\n`);

    console.log('✅ Normalização concluída!');
    console.log(`   - ${updatedPayments} marketplace_payments`);
    console.log(`   - ${updatedOrderTags} order_tags`);
    console.log(`   - ${updatedAvailableTags} available_tags`);
}

normalizeTagsToLowercase().catch(console.error);
