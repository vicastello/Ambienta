
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.vercel');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: any = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2].replace(/^[\"']|[\"']$/g, '');
});

const supabaseAdmin = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

const busca = '251126Q1HWJ12K';

async function verify() {
    console.log('Verifying order status...');
    // 1. Check the raw order data
    const { data: order } = await supabaseAdmin
        .from('tiny_orders')
        .select('*')
        .or(`numero_pedido_ecommerce.eq.${busca},numero_pedido_ecommerce.ilike.%${busca}%`)
        .single();

    console.log('Order Data:', {
        id: order?.id,
        situacao: order?.situacao, // 2 = Cancelado
        payment_received: order?.payment_received,
        data_criacao: order?.data_criacao,
        canal: order?.canal
    });

    if (order?.situacao === 2) {
        console.log('ALERT: Order is CANCELLED (situacao=2). Current API filters excludes this.');
    }

    // 2. Simulate the EXACT query logic from route.ts
    console.log('\nSimulating API Query...');
    let query = supabaseAdmin
        .from('tiny_orders')
        .select('id, numero_pedido_ecommerce');

    // Applying filters exactly as in route.ts
    // Text Search
    if (busca) {
        query = query.or(`cliente_nome.ilike.%${busca}%,numero_pedido_ecommerce.ilike.%${busca}%,canal.ilike.%${busca}%`);
    }

    // Status filter (ALWAYS APPLIED in route.ts currently)
    query = query.neq('situacao', 2);

    const { data: results, error } = await query;
    if (error) console.error('API Query Error:', error);

    console.log('API Simulation Results:', results?.length, 'records found.');
    if (results?.length === 0) {
        console.log('API returns EMPTY -> Filter blocked it.');
    } else {
        console.log('API returns SUCCESS -> User should see it.');
    }
}

verify();
