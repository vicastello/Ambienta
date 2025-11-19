// Quick script to inspect raw order data
const supabase = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const client = supabase.createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await client
    .from('tiny_orders')
    .select('tiny_id, valor, raw')
    .neq('raw', null)
    .limit(5);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  if (data && data.length > 0) {
    console.log('\n=== Sample Raw Orders ===\n');
    data.forEach((order, idx) => {
      console.log(`\n--- Order ${idx + 1} (ID: ${order.tiny_id}) ---`);
      console.log(`Valor: ${order.valor}`);
      console.log('Raw keys:', Object.keys(order.raw || {}).sort());
      
      // Look for frete in any form
      const raw = order.raw;
      if (raw) {
        console.log('\nSearching for frete:');
        ['frete', 'valorFrete', 'valor_frete', 'transporte', 'freteGrat', 'freteGratis'].forEach(key => {
          if (key in raw) {
            console.log(`  ✓ ${key}:`, raw[key]);
          }
        });
        
        // Show all numeric-looking values
        console.log('\nAll fields with possible numeric values:');
        Object.entries(raw).forEach(([k, v]) => {
          if (typeof v === 'number' || (typeof v === 'string' && !isNaN(v))) {
            console.log(`  ${k}: ${v}`);
          }
        });
      }
    });
  } else {
    console.log('No orders with raw data found');
  }
}

run().catch(console.error);
