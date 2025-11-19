const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing env vars');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Check total in period
  const { data: total } = await client
    .from('tiny_orders')
    .select('*', { count: 'exact' })
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59');

  console.log('Total pedidos no período:', total?.length || 0);

  // Check how many have valorFrete
  const { data: withFrete } = await client
    .from('tiny_orders')
    .select('*', { count: 'exact' })
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59')
    .not('raw->valorFrete', 'is', null);

  console.log('Com valorFrete:', withFrete?.length || 0);

  // Check how many have valorTotalPedido
  const { data: withTotalPedido } = await client
    .from('tiny_orders')
    .select('*', { count: 'exact' })
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59')
    .not('raw->valorTotalPedido', 'is', null);

  console.log('Com valorTotalPedido:', withTotalPedido?.length || 0);

  // Sample a few
  const { data: sample } = await client
    .from('tiny_orders')
    .select('tiny_id, raw')
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59')
    .limit(5);

  console.log('\nExemplos de raw JSON:');
  sample?.forEach((o, i) => {
    const r = o.raw || {};
    console.log(`${i+1}. Pedido ${o.tiny_id}:`);
    console.log(`   valorFrete: ${r.valorFrete}`);
    console.log(`   valorTotalPedido: ${r.valorTotalPedido}`);
    console.log(`   valorTotalProdutos: ${r.valorTotalProdutos}`);
  });
}

check().catch(console.error);
