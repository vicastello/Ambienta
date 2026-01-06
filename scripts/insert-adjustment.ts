import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('Conectando ao Supabase...');

    // First, find the tiny_order_id for this order
    const { data: link, error: linkErr } = await supabase
        .from('marketplace_order_links')
        .select('tiny_order_id')
        .eq('marketplace', 'shopee')
        .eq('marketplace_order_id', '251203BV0FG1CD')
        .single();

    if (linkErr) {
        console.error('Erro ao buscar link:', linkErr.message);
        process.exit(1);
    }

    const tinyOrderId = link?.tiny_order_id;
    console.log('tiny_order_id encontrado:', tinyOrderId);

    // Insert the DEBIT record (Ajuste)
    console.log('\nInserindo débito...');
    const { data: debit, error: debitErr } = await supabase
        .from('marketplace_payments')
        .upsert({
            marketplace: 'shopee',
            marketplace_order_id: '251203BV0FG1CD_AJUSTE',
            payment_date: '2025-12-21',
            net_amount: 11.99,
            gross_amount: 11.99,
            fees: 0,
            discount: 0,
            status: 'Transação completa',
            transaction_type: 'Ajuste',
            transaction_description: 'Débito referente ao pedido 251203BV0FG1CD devido à solicitação de reembolso',
            is_expense: true,
            tiny_order_id: tinyOrderId,
            matched_at: new Date().toISOString(),
            match_confidence: 'exact',
        }, { onConflict: 'marketplace,marketplace_order_id' })
        .select()
        .single();

    if (debitErr) {
        console.error('Erro no débito:', debitErr.message);
    } else {
        console.log('✅ Débito inserido:', debit.id.slice(0, 8));
    }

    // Verify
    console.log('\nVerificando resultado...');
    const { data: all } = await supabase
        .from('marketplace_payments')
        .select('marketplace_order_id, net_amount, is_expense')
        .or('marketplace_order_id.eq.251203BV0FG1CD,marketplace_order_id.like.251203BV0FG1CD%');

    let credito = 0, debito2 = 0;
    all?.forEach(p => {
        if (p.is_expense) debito2 += Number(p.net_amount);
        else credito += Number(p.net_amount);
    });

    console.log('\n=== RESULTADO ===');
    console.log('Registros:', all?.length);
    all?.forEach(p => console.log('  -', p.marketplace_order_id, p.is_expense ? 'DÉBITO' : 'CRÉDITO', 'R$', p.net_amount));
    console.log('Total Crédito: R$', credito.toFixed(2));
    console.log('Total Débito:  R$', debito2.toFixed(2));
    console.log('SALDO FINAL:   R$', (credito - debito2).toFixed(2));

    process.exit(0);
}

run().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
