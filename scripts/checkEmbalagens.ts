import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const tables = ['embalagens', 'produto_embalagens'];
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t as any).select('id').limit(1);
      if (error) {
        console.log(`${t}: ERROR: ${error.message}`);
      } else {
        console.log(`${t}: OK (${data?.length ?? 0} rows sample)`);
      }
    } catch (e: any) {
      console.log(`${t}: ERROR: ${e?.message}`);
    }
  }
}

main().catch((e) => {
  console.error('fatal', e);
  process.exit(1);
});
