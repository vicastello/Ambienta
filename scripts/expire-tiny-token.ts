import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.development.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function expireToken() {
    console.log('Expiring Tiny token in DB...');
    const { error } = await supabase
        .from('tiny_tokens')
        .update({ expires_at: 0 })
        .eq('id', 1);

    if (error) console.error('Error:', error);
    else console.log('Token expired successfully.');
}

expireToken().catch(console.error);
