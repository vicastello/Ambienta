const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing env vars. Try: export NEXT_PUBLIC_SUPABASE_URL=...');
  console.log('Missing env vars. Try: export SUPABASE_SERVICE_ROLE_KEY=...');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Get one order
  const { data: orders } = await client
    .from('tiny_orders')
    .select('tiny_id, raw')
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59')
    .limit(1);

  if (!orders || !orders[0]) {
    console.log('No orders found');
    return;
  }

  const order = orders[0];
  console.log('Ordem:', order.tiny_id);
  console.log('Raw keys:', Object.keys(order.raw || {}).slice(0, 15));
  console.log('valorFrete:', order.raw?.valorFrete);
  console.log('valorTotalPedido:', order.raw?.valorTotalPedido);
  console.log('valorTotalProdutos:', order.raw?.valorTotalProdutos);
  console.log('valor:', order.raw?.valor);
}

check().catch(console.error);
