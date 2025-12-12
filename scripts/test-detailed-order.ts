#!/usr/bin/env tsx
/**
 * Testa buscar o pedido detalhado da API do Tiny
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { obterPedidoDetalhado } from '../lib/tinyApi';

async function testDetailedOrder() {
  const tinyId = 942583833; // Pedido #21581 que não tem itens

  console.log('Buscando detalhes do pedido', tinyId, 'da API do Tiny...');
  console.log();

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    const detalhado = await obterPedidoDetalhado(accessToken, tinyId, 'test');

    console.log('RESPOSTA DA API:');
    console.log(JSON.stringify(detalhado, null, 2));
    console.log();

    // Tentar extrair itens
    const itens = Array.isArray((detalhado as any).itens)
      ? (detalhado as any).itens
      : Array.isArray((detalhado as any).pedido?.itens)
        ? (detalhado as any).pedido.itens
        : Array.isArray((detalhado as any).pedido?.itensPedido)
          ? (detalhado as any).pedido.itensPedido
          : [];

    console.log('ITENS ENCONTRADOS:', itens.length);

    if (itens.length > 0) {
      console.log();
      console.log('Primeiro item:');
      console.log(JSON.stringify(itens[0], null, 2));
    }
  } catch (error: any) {
    console.error('Erro ao buscar pedido:', error.message);
    console.error('Detalhes:', error);
  }
}

testDetailedOrder();
