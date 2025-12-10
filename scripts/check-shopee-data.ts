import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Verificar itens
  const { count: itemsCount } = await (supabase as any)
    .from('shopee_order_items')
    .select('*', { count: 'exact', head: true });
  
  // Verificar pedido com dados
  const { data: sample } = await (supabase as any)
    .from('shopee_orders')
    .select('order_sn, recipient_name, recipient_city, recipient_state, recipient_full_address')
    .limit(5);
  
  console.log('Total de itens:', itemsCount);
  console.log('\nAmostra de pedidos (endereço):');
  console.log(JSON.stringify(sample, null, 2));

  // Verificar um item
  const { data: itemSample } = await (supabase as any)
    .from('shopee_order_items')
    .select('*')
    .limit(3);
  
  console.log('\nAmostra de itens:');
  console.log(JSON.stringify(itemSample, null, 2));

  // Verificar raw_payload de um pedido
  const { data: rawSample } = await (supabase as any)
    .from('shopee_orders')
    .select('order_sn, raw_payload')
    .limit(1);
  
  console.log('\nRaw payload de um pedido:');
  console.log(JSON.stringify(rawSample?.[0]?.raw_payload, null, 2));
}

main();
