/**
 * Script to manually refresh the Tiny API token
 * Run with: npx tsx scripts/refreshTinyToken.ts
 */

import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function refreshToken() {
    console.log('\n🔄 Refreshing Tiny token...\n');

    try {
        // Check current token status
        const { data: currentToken } = await supabaseAdmin
            .from('tiny_tokens')
            .select('*')
            .eq('id', 1)
            .single();

        if (currentToken) {
            console.log('Current token info:');
            console.log(`  - Has access_token: ${!!currentToken.access_token}`);
            console.log(`  - Has refresh_token: ${!!currentToken.refresh_token}`);
            console.log(`  - Expires at: ${currentToken.expires_at ? new Date(currentToken.expires_at).toLocaleString() : 'N/A'}`);
            console.log(`  - Is expired: ${currentToken.expires_at ? currentToken.expires_at < Date.now() : 'N/A'}`);
        } else {
            console.log('❌ No token found in database!');
            console.log('   Please connect Tiny first via the app.');
            process.exit(1);
        }

        // Force refresh
        console.log('\n⏳ Forcing token refresh...');
        const newAccessToken = await getAccessTokenFromDbOrRefresh();

        // Verify new token
        const { data: updatedToken } = await supabaseAdmin
            .from('tiny_tokens')
            .select('*')
            .eq('id', 1)
            .single();

        console.log('\n✅ Token refreshed successfully!');
        console.log('New token info:');
        console.log(`  - Access token (first 20 chars): ${newAccessToken.substring(0, 20)}...`);
        console.log(`  - Expires at: ${updatedToken?.expires_at ? new Date(updatedToken.expires_at).toLocaleString() : 'N/A'}`);

        // Test the token by making a simple API call
        console.log('\n🧪 Testing new token...');
        const testResponse = await fetch('https://api.tiny.com.br/api2/pedidos.pesquisa.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: newAccessToken,
                formato: 'json',
                pagina: 1,
                numero: '1', // Search for a non-existent order
            }),
        });

        const contentType = testResponse.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await testResponse.json();
            if (data.retorno?.status === 'Erro' && data.retorno?.erros?.[0]?.erro?.includes('Nenhum')) {
                console.log('✅ Token is working! (Empty search returned expected error)');
            } else if (data.retorno?.status === 'OK') {
                console.log('✅ Token is working!');
            } else {
                console.log('⚠️ Token may have issues:', data.retorno?.erros?.[0]?.erro || 'Unknown');
            }
        } else {
            const text = await testResponse.text();
            console.log('⚠️ Received non-JSON response:', text.substring(0, 100));
        }

    } catch (error) {
        console.error('\n❌ Error refreshing token:', error);
        process.exit(1);
    }

    console.log('\n✅ Done!\n');
    process.exit(0);
}

refreshToken();
