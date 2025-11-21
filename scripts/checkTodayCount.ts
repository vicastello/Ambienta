import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkToday() {
  const today = '2025-11-21';
  
  const { count: total } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_pedido', today)
    .lt('data_pedido', '2025-11-22');
  
  const { count: withFrete } = await supabase
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_pedido', today)
    .lt('data_pedido', '2025-11-22')
    .gt('valor_frete', 0);
  
  console.log(`📊 Pedidos de ${today}:`);
  console.log(`   Total: ${total}`);
  console.log(`   Com frete: ${withFrete}`);
  console.log(`   Sem frete: ${total! - withFrete!}`);
}

checkToday();
