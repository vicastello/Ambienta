/**
 * Test Tiny detailed order endpoint for all fields
 */

const supabase = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const client = supabase.createClient(supabaseUrl, supabaseKey);

async function testTinyAPI() {
  try {
    // Get a valid token
    const { data: tokenData, error: tokenError } = await client
      .from('tiny_tokens')
      .select('access_token')
      .limit(1)
      .single();
      
    if (tokenError || !tokenData) {
      console.error('Error getting token:', tokenError);
      process.exit(1);
    }
    
    const accessToken = tokenData.access_token;
    const orderId = 942882424;
    
    console.log(`\n=== Testing Tiny /pedidos/{id} endpoint ===\n`);
    
    const response = await fetch(`https://api.tiny.com.br/public-api/v3/pedidos/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    
    if (response.ok && data.pedido) {
      const pedido = data.pedido;
      console.log('\n✓ Response structure:\n');
      
      console.log('All keys:', Object.keys(pedido).sort());
      
      // Look for valor fields
      console.log('\n--- Valor/Frete fields ---');
      Object.entries(pedido).forEach(([k, v]) => {
        if (k.toLowerCase().includes('valor') || k.toLowerCase().includes('frete') || k.toLowerCase().includes('preco')) {
          console.log(`  ${k}: ${v}`);
        }
      });
      
      // Full response
      console.log('\n--- Full response ---');
      console.log(JSON.stringify(pedido, null, 2));
      
    } else {
      console.log('Error or no pedido found');
      console.log('Response:', JSON.stringify(data));
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testTinyAPI();
