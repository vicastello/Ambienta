#!/usr/bin/env tsx
/**
 * Investiga o raw payload de pedidos sem itens
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function investigateRawPayload() {
  console.log('Investigando raw payload dos pedidos sem itens...');
  console.log();

  // Buscar um pedido sem itens
  const { data: order } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .eq('tiny_id', 942583833)
    .single();

  if (!order) {
    console.log('Pedido não encontrado');
    return;
  }

  console.log('PEDIDO:', order.numero_pedido);
  console.log('ID Tiny:', order.tiny_id);
  console.log('Situação:', order.situacao);
  console.log();

  // Verificar se tem raw ou raw_payload
  console.log('Tem raw?', !!order.raw);
  console.log('Tem raw_payload?', !!order.raw_payload);
  console.log();

  const raw = order.raw || order.raw_payload;

  if (raw) {
    console.log('RAW COMPLETO:');
    console.log(JSON.stringify(raw, null, 2));
    console.log();

    // Tentar encontrar itens em diferentes estruturas
    console.log('Procurando itens na estrutura:');
    console.log('- raw.itens:', Array.isArray(raw.itens) ? raw.itens.length : 'não existe');
    console.log('- raw.pedido:', raw.pedido ? 'existe' : 'não existe');
    if (raw.pedido) {
      console.log('  - raw.pedido.itens:', Array.isArray(raw.pedido.itens) ? raw.pedido.itens.length : 'não existe');
      console.log('  - raw.pedido.itensPedido:', Array.isArray(raw.pedido.itensPedido) ? raw.pedido.itensPedido.length : 'não existe');
      console.log('  - raw.pedido.items:', Array.isArray(raw.pedido.items) ? raw.pedido.items.length : 'não existe');
    }
    console.log('- raw.pedidos:', Array.isArray(raw.pedidos) ? `${raw.pedidos.length} pedidos` : 'não existe');
    if (Array.isArray(raw.pedidos) && raw.pedidos.length > 0) {
      console.log('  - raw.pedidos[0].pedido:', raw.pedidos[0].pedido ? 'existe' : 'não existe');
      if (raw.pedidos[0].pedido) {
        console.log('    - raw.pedidos[0].pedido.itens:', Array.isArray(raw.pedidos[0].pedido.itens) ? raw.pedidos[0].pedido.itens.length : 'não existe');
        console.log('    - raw.pedidos[0].pedido.itensPedido:', Array.isArray(raw.pedidos[0].pedido.itensPedido) ? raw.pedidos[0].pedido.itensPedido.length : 'não existe');
      }
    }
  } else {
    console.log('Pedido sem raw payload!');
  }
}

investigateRawPayload();
