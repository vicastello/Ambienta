import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables if available
try {
    dotenv.config({ path: '.env.local' });
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

async function main() {
    console.log('--- Checking Sync Logs for Recent Activity ---');

    // 3. Check logs
    console.log('3. Checking sync_logs...');
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

    // Check for successful token refresh
    const successLog = logs?.find(l => l.message?.includes('Token Tiny renovado') || l.message?.includes('tiny_token_refresh_http dispatched'));
    if (successLog) {
        console.log('\n✅ Token refresh log found:', successLog.message);
    } else {
        console.log('\n⚠️ No token refresh log found yet (might be processing or filtered).');
    }

    // Check specific recent errors
    const errors = logs?.filter(l => l.level === 'error');
    if (errors?.length) {
        console.log('\n❌ Found recent errors:');
        errors.forEach(e => console.log(`- ${e.message}: ${JSON.stringify(e.meta)}`));
    }
}

main().catch(console.error);
