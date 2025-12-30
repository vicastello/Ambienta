import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSession() {
    const sessionId = '52b9eb36-5dd1-4b54-a64e-abedc67d2db4';
    console.log(`Checking session ${sessionId}...`);

    const { data: session } = await supabase
        .from('payment_import_sessions')
        .select('parsed_data')
        .eq('id', sessionId)
        .single();

    if (session && session.parsed_data) {
        const payments = session.parsed_data as any[];
        console.log(`Session has ${payments.length} payments.`);
        if (payments.length > 0) {
            console.log('Sample Payment (First):', JSON.stringify(payments[0], null, 2));
            // Check for the missing order specifically
            const missing = payments.find(p => p.marketplaceOrderId === '250405E509KAT0');
            console.log('Missing Order in Parsed Data?', missing ? 'YES' : 'NO');
            if (missing) console.log('Missing Order Data:', JSON.stringify(missing, null, 2));
        }
    } else {
        console.log('Session parsed_data is empty or not found.');
    }
}

checkSession();
