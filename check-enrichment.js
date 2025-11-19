const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing env vars');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Check how many orders have valorTotalPedido
  const { data: withValue, error: err1 } = await client.from('tiny_orders')
    .select('tiny_id', { count: 'exact' })
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59')
    .not('raw->>valorTotalPedido', 'is', null);

  if (err1) {
    console.log('Error checking with value:', err1.message);
  } else {
    console.log('Orders WITH valorTotalPedido:', withValue.length);
  }

  // Check how many orders are missing it
  const { data: withoutValue, error: err2 } = await client.from('tiny_orders')
    .select('tiny_id, raw')
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59')
    .is('raw->>valorTotalPedido', null)
    .limit(3);

  if (err2) {
    console.log('Error checking without value:', err2.message);
  } else {
    console.log('Orders WITHOUT valorTotalPedido:', withoutValue.length);
    withoutValue.forEach(o => {
      console.log(`\n  Pedido ${o.tiny_id}:`);
      console.log(`  Raw keys: ${Object.keys(o.raw || {}).join(', ')}`);
    });
  }
}

check().catch(console.error);
