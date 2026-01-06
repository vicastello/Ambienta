
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: any = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2].replace(/^[\"']|[\"']$/g, '');
});

const supabaseAdmin = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

const busca = '251126Q1HWJ12K';
const dataInicio = null;
const dataFim = null;
const statusPagamento = 'todos';
const marketplace = 'todos';

async function testSearch() {
    console.log('Testing Search for:', busca);

    let listQuery = supabaseAdmin
        .from('tiny_orders')
        .select('id, numero_pedido, numero_pedido_ecommerce, canal, cliente_nome')
        .limit(10);

    // Filter Logic duplicated from route.ts
    // Text Search
    if (busca) {
        // Search in client name, ecommerce order number, and channel
        listQuery = listQuery.or(`cliente_nome.ilike.%${busca}%,numero_pedido_ecommerce.ilike.%${busca}%,canal.ilike.%${busca}%`);
    }

    if (marketplace !== 'todos') {
        listQuery = listQuery.ilike('canal', `%${marketplace}%`);
    }

    const { data, error } = await listQuery;

    if (error) {
        console.error('Search Error:', error);
    } else {
        console.log(`Found ${data.length} records:`);
        data.forEach(d => console.log(d));
    }
}

testSearch();
