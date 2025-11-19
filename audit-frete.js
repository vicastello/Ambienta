const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing env');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

async function audit() {
  // Get all orders in period
  const { data: orders } = await client
    .from('tiny_orders')
    .select('tiny_id, raw')
    .gte('data_criacao', '2025-11-01T00:00:00')
    .lte('data_criacao', '2025-11-19T23:59:59');

  console.log(`Total pedidos no período: ${orders?.length || 0}\n`);

  let totalFrete = 0;
  let withFrete = 0;
  let withoutFrete = 0;
  let withoutBruto = 0;

  const fretesByValue = {};

  orders?.forEach((o) => {
    const raw = o.raw || {};
    const bruto = Number(raw.valorTotalPedido);
    const liquido = Number(raw.valorTotalProdutos);
    
    if (!isNaN(bruto) && !isNaN(liquido) && bruto > 0) {
      const frete = bruto - liquido;
      totalFrete += frete;
      withFrete++;
      
      // Track frete distribution
      const freteStr = frete.toFixed(2);
      fretesByValue[freteStr] = (fretesByValue[freteStr] || 0) + 1;
    } else if (raw.valor !== undefined) {
      withoutBruto++;
    } else {
      withoutFrete++;
    }
  });

  console.log(`Com frete enriquecido: ${withFrete}`);
  console.log(`Sem frete enriquecido: ${withoutFrete}`);
  console.log(`Sem bruto (só lista): ${withoutBruto}`);
  console.log(`\nTotal frete calculado: R$ ${totalFrete.toFixed(2)}`);
  console.log(`Diferença esperada: R$ ${(3964.21 - totalFrete).toFixed(2)}`);
  
  // Show distribution
  console.log('\nTop 10 valores de frete:');
  Object.entries(fretesByValue)
    .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
    .slice(0, 10)
    .forEach(([val, count]) => {
      console.log(`  R$ ${val}: ${count} pedidos`);
    });
}

audit().catch(console.error);
