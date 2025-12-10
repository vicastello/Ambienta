import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Buscar pedidos que não têm itens
  const { data: orders } = await (supabase as any)
    .from('shopee_orders')
    .select('order_sn');
  
  const { data: items } = await (supabase as any)
    .from('shopee_order_items')
    .select('order_sn');
  
  const orderSns = new Set(orders?.map((o: any) => o.order_sn) || []);
  const itemOrderSns = new Set(items?.map((i: any) => i.order_sn) || []);
  
  const semItens = [...orderSns].filter(sn => !itemOrderSns.has(sn));
  
  console.log('Pedidos totais:', orderSns.size);
  console.log('Pedidos com itens:', itemOrderSns.size);
  console.log('Pedidos SEM itens:', semItens.length);
  console.log('\nExemplos:', semItens.slice(0, 10));
}

main();
