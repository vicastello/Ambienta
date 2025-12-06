#!/usr/bin/env tsx
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { tinyGet } from '../lib/tinyApi';

async function main() {
  const token = await getAccessTokenFromDbOrRefresh();
  
  console.log('\n🔍 Testando API Tiny - Listagem de pedidos\n');
  
  // Teste 1: Lista com fields explícitos
  const result1: any = await tinyGet(
    '/pedidos',
    token,
    {
      limit: 3,
      offset: 0,
      orderBy: 'desc',
      fields: 'valorFrete,valorTotalPedido,valorTotalProdutos,valorDesconto,valorOutrasDespesas,transportador',
    },
    { context: 'scripts/testTinyApi' }
  );
  
  console.log('📦 Pedidos retornados:', result1.itens?.length || 0);
  console.log('\n--- Primeiro Pedido ---');
  const primeiro = result1.itens?.[0];
  if (primeiro) {
    console.log('ID:', primeiro.id);
    console.log('Número:', primeiro.numeroPedido);
    console.log('Valor:', primeiro.valor);
    console.log('valorFrete:', primeiro.valorFrete || '❌ não retornado');
    console.log('valorTotalPedido:', primeiro.valorTotalPedido || '❌ não retornado');
    console.log('transportador:', JSON.stringify(primeiro.transportador) || '❌ não retornado');
    console.log('\nCampos disponíveis:', Object.keys(primeiro).join(', '));
  }
  
  // Teste 2: Buscar pedido individual para ver se tem mais detalhes
  if (primeiro?.id) {
    console.log(`\n\n🔍 Buscando detalhes do pedido #${primeiro.id} individualmente\n`);
    const detalhado: any = await tinyGet(
      `/pedidos/${primeiro.id}`,
      token,
      {},
      { context: 'scripts/testTinyApi', endpointLabel: `/pedidos/${primeiro.id}` }
    );
    
    console.log('valorFrete no detalhe:', detalhado.valorFrete || '❌ não retornado');
    console.log('transportador no detalhe:', JSON.stringify(detalhado.transportador, null, 2) || '❌ não retornado');
    console.log('\nCampos disponíveis no detalhe:', Object.keys(detalhado).join(', '));
  }
}

main().catch(console.error);
