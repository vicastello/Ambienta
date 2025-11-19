const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', supabaseUrl ? '✓' : '✗');
console.log('Key:', supabaseKey ? '✓' : '✗');

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing env vars');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Check total in period
  const { data: total, error: err1 } = await client
    .from('tiny_orders')
    .select('*', { count: 'exact' })
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59');

  console.log('\nTotal pedidos no período:', total?.length || 0);

  // Check how many have valorTotalPedido
  const { data: withValue, error: err2 } = await client
    .from('tiny_orders')
    .select('*', { count: 'exact' })
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59')
    .not('raw->valorTotalPedido', 'is', null);

  console.log('Com valorTotalPedido:', withValue?.length || 0);

  // Check how many are missing it
  const { data: withoutValue, error: err3 } = await client
    .from('tiny_orders')
    .select('tiny_id, raw', { count: 'exact' })
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59')
    .is('raw->valorTotalPedido', null)
    .limit(3);

  console.log('Sem valorTotalPedido:', withoutValue?.length || 0, 'total remaining');
  
  if (withoutValue?.length > 0) {
    console.log('\nExemplos de pedidos sem enriquecimento:');
    withoutValue.forEach((o, i) => {
      console.log(`${i+1}. Pedido ${o.tiny_id}`);
      if (o.raw?.valor) console.log(`   valor (lista): ${o.raw.valor}`);
      if (o.raw?.valorTotalPedido) console.log(`   valorTotalPedido: ${o.raw.valorTotalPedido}`);
    });
  }
}

check().catch(err => {
  console.error('Database error:', err.message);
  process.exit(1);
});
