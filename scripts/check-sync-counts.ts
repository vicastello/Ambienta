import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== Contagem de pedidos no banco ===\n');
  
  // Tiny Orders
  const { count: tinyCount } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true });
  
  // Mercado Livre
  const { count: meliCount } = await supabase
    .from('meli_orders')
    .select('*', { count: 'exact', head: true });
  
  // Shopee
  const { count: shopeeCount } = await (supabase as any)
    .from('shopee_orders')
    .select('*', { count: 'exact', head: true });

  console.log('Tiny Orders:', tinyCount);
  console.log('Mercado Livre:', meliCount);
  console.log('Shopee:', shopeeCount);
  console.log('---');
  console.log('TOTAL:', (tinyCount || 0) + (meliCount || 0) + (shopeeCount || 0));
}

main();
