/**
 * Quick test to check if obterPedidoDetalhado works correctly
 */

async function test() {
  const { obterPedidoDetalhado } = await import('./lib/tinyApi');
  const { getAccessTokenFromDbOrRefresh } = await import('./lib/tinyAuth');
  
  const token = await getAccessTokenFromDbOrRefresh();
  console.log('Token obtained:', token?.substring(0, 20) + '...');
  
  const detalhado = await obterPedidoDetalhado(token, 942882424);
  console.log('\nDetalhado order 942882424:');
  console.log('valorTotalPedido:', detalhado.valorTotalPedido);
  console.log('valorTotalProdutos:', detalhado.valorTotalProdutos);
  console.log('valorFrete:', detalhado.valorFrete);
}

test().catch(console.error);
