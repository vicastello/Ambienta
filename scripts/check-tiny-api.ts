import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTinyApi() {
    console.log('Fetching Tiny Token (with auto-refresh)...');

    // Dynamic import to allow dotenv to load first
    const { getAccessTokenFromDbOrRefresh } = await import('../lib/tinyAuth');

    let token;
    try {
        token = await getAccessTokenFromDbOrRefresh(); // This handles refresh logic
    } catch (e) {
        console.error('Error getting token:', e);
        // Fallback to DB read if refresh fails (maybe token still valid)
        const { data: tokenResult } = await supabase
            .from('tiny_tokens')
            .select('access_token')
            .eq('id', 1)
            .single();
        if (tokenResult?.access_token) {
            console.log('Using stored token (refresh failed).');
            token = tokenResult.access_token;
        } else {
            return;
        }
    }

    if (!token) {
        console.error('TINY_TOKEN retrieval returned null');
        return;
    }

    const orderId = '250405E509KAT0';
    console.log(`Checking Tiny API for order: ${orderId}`);

    // Tiny API V3 Search
    const url = `https://api.tiny.com.br/api2/pedidos.pesquisa.php?token=${token}&numeroEcommerce=${orderId}&formato=json`;

    try {
        const res = await fetch(url);
        const data = await res.json(); // Typecast to any

        console.log('API Response:', JSON.stringify(data, null, 2));

        if (data.retorno?.pedidos) {
            console.log('Order Found in Tiny!');
            const pedidos = data.retorno.pedidos;
            pedidos.forEach((p: any) => {
                console.log(`- Tiny ID: ${p.pedido.id}, Numero: ${p.pedido.numero}, Data: ${p.pedido.data_pedido}`);
            });
        } else {
            console.log('Order NOT Found in Tiny (via Search).');
            // Try searching by specific status? No, verify ecommerce number is correct.
        }
    } catch (e) {
        console.error('API Error:', e);
    }
}

checkTinyApi();
