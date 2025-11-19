/**
 * Test if Tiny API has a detailed order endpoint with frete info
 */

const TINY_BASE_URL = "https://api.tiny.com.br/public-api/v3";

// From .env
const accessToken = process.env.TINY_ACCESS_TOKEN;

if (!accessToken) {
  console.error('TINY_ACCESS_TOKEN not set');
  process.exit(1);
}

async function testDetailedOrder() {
  // Try to get a detailed order
  // Tiny API typically uses /pedidos/{id} for details
  
  const orderId = 942882424; // From previous debug output
  
  try {
    console.log(`\n=== Testing detailed order endpoint ===\n`);
    
    const response = await fetch(`${TINY_BASE_URL}/pedidos/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✓ Detailed endpoint works!');
      console.log('\nResponse keys:', Object.keys(data || {}).sort());
      
      // Look for frete
      if (data.pedido) {
        console.log('\nPedido keys:', Object.keys(data.pedido || {}).sort());
        
        // Check for frete in various places
        ['frete', 'valorFrete', 'valor_frete', 'transporte', 'freteGrat'].forEach(key => {
          if (key in (data.pedido || {})) {
            console.log(`  ✓ Found: ${key} =`, data.pedido[key]);
          }
        });
      }
    } else {
      console.log('✗ Detailed endpoint returned:', response.status);
      console.log('Response:', JSON.stringify(data).substring(0, 200));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testDetailedOrder();
