#!/usr/bin/env tsx
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { obterPedidoDetalhado } from '../lib/tinyApi';

async function testDirectApi() {
  console.log('🔍 Testando API direta do Tiny...\n');

  const accessToken = await getAccessTokenFromDbOrRefresh();
  const exemploIds = [935744711, 935741376, 935739823];

  for (const tinyId of exemploIds) {
    console.log(`\n📦 Consultando pedido ${tinyId}...`);
    
    try {
      const resultado = await obterPedidoDetalhado(accessToken, tinyId, 'debug_test');
      
      console.log(`   Status: ✅ Sucesso`);
      console.log(`   Chaves retornadas:`, Object.keys(resultado || {}));
      
      // Tentar localizar itens em diferentes estruturas
      const itens1 = (resultado as any)?.itens;
      const itens2 = (resultado as any)?.pedido?.itens;
      const itens3 = (resultado as any)?.pedido?.itensPedido;
      const itens4 = (resultado as any)?.retorno?.pedido?.itens;
      
      console.log(`   resultado.itens:`, Array.isArray(itens1) ? `Array(${itens1.length})` : typeof itens1);
      console.log(`   resultado.pedido?.itens:`, Array.isArray(itens2) ? `Array(${itens2.length})` : typeof itens2);
      console.log(`   resultado.pedido?.itensPedido:`, Array.isArray(itens3) ? `Array(${itens3.length})` : typeof itens3);
      console.log(`   resultado.retorno?.pedido?.itens:`, Array.isArray(itens4) ? `Array(${itens4.length})` : typeof itens4);
      
      // Mostrar estrutura completa do primeiro nível
      if (resultado && typeof resultado === 'object') {
        console.log(`\n   Estrutura completa (primeiro nível):`);
        for (const [key, value] of Object.entries(resultado)) {
          const tipo = Array.isArray(value) 
            ? `Array(${value.length})` 
            : typeof value === 'object' && value !== null
            ? `Object{${Object.keys(value).slice(0, 5).join(', ')}${Object.keys(value).length > 5 ? '...' : ''}}`
            : typeof value;
          console.log(`      ${key}: ${tipo}`);
        }
      }
      
      // Se tiver pedido, mostrar estrutura do pedido
      if ((resultado as any)?.pedido) {
        console.log(`\n   Estrutura do pedido:`);
        for (const [key, value] of Object.entries((resultado as any).pedido)) {
          const tipo = Array.isArray(value) 
            ? `Array(${value.length})` 
            : typeof value === 'object' && value !== null
            ? `Object{...}`
            : typeof value;
          console.log(`      pedido.${key}: ${tipo}`);
        }
      }
      
    } catch (error: any) {
      console.log(`   Status: ❌ Erro`);
      console.log(`   Mensagem:`, error?.message || error);
      console.log(`   Código:`, error?.status || error?.code);
    }
  }
}

testDirectApi().catch(console.error);
