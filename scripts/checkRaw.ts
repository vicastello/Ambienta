import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
console.log('URL:', url ? 'SET' : 'MISSING');
console.log('KEY:', key ? 'SET' : 'MISSING');
if (!url || !key) process.exit(1);

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase
    .from('tiny_orders')
    .select('numero_pedido,data_criacao,raw')
    .gte('data_criacao', '2025-12-08')
    .limit(1);

  if (error) { console.error(error); return; }

  for (const row of data || []) {
    console.log('numero_pedido:', row.numero_pedido);
    console.log('data_criacao:', row.data_criacao);
    console.log('RAW (full):');
    console.log(JSON.stringify(row.raw, null, 2));
  }
}
main();
