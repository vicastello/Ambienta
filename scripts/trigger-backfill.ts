import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch'; // Standard available in recent node, or use built-in fetch in newer node

// Load environment variables if available
try {
    dotenv.config({ path: '.env.local' });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        console.log('Falling back to .env.local');
        dotenv.config({ path: '.env.local' });
    }
} catch (e) { }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// Use production URL
const SYNC_URL = 'https://gestao.ambientautilidades.com.br/api/tiny/sync';

async function main() {
    console.log('--- Triggering Backfill for Last 2 Days ---');

    // 1. Call the API
    const url = `${SYNC_URL}?mode=orders&daysBack=2&background=false&force=true`;
    console.log(`POST ${url}`);

    try {
        const res = await fetch(url, { method: 'POST' });
        const text = await res.text();

        // Try to parse JSON
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }

        if (!res.ok) {
            console.error('❌ API Error:', res.status, text);
            // Don't exit yet, check logs
        } else {
            console.log('✅ Backfill triggered successfully.');
            console.log('Response:', json || text);
        }
    } catch (e) {
        console.error('❌ Network error triggering backfill:', e);
    }

    // 2. Monitor Logs
    console.log('\n--- Monitoring Sync Logs (10s wait) ---');
    await new Promise(r => setTimeout(r, 10000));

    const { data: logs, error: logsError } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (logsError) {
        console.error('❌ Error reading logs:', logsError);
        return;
    }

    console.table(logs?.map(l => ({
        level: l.level,
        message: l.message,
        created_at: new Date(l.created_at).toLocaleString('pt-BR'),
        meta: JSON.stringify(l.meta).substring(0, 100) + '...'
    })));

    // Check specifically for order processing logs
    const orderLogs = logs?.filter(l => l.message?.includes('Processando job') || l.message?.includes('pedidos processados'));
    if (orderLogs?.length) {
        console.log('✅ Found relevant sync activity.');
    } else {
        console.log('⚠️ No immediate sync activity logs found yet. It might be running in background.');
    }
}

main().catch(console.error);
