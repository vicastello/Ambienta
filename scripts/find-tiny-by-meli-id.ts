#!/usr/bin/env tsx
/**
 * Script para encontrar pedido do Tiny que corresponde a um pedido do Mercado Livre
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function findTinyOrder() {
  const meliOrderId = '2000014216247590';

  console.log('='.repeat(80));
  console.log(`Buscando pedido do Tiny para Mercado Livre ${meliOrderId}`);
  console.log('='.repeat(80));
  console.log();

  // Buscar pedidos do Tiny do canal Mercado Livre
  const { data: tinyOrders, error } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, data_criacao, valor, cliente_nome, raw_payload')
    .eq('canal', 'Mercado Livre')
    .order('data_criacao', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Erro ao buscar pedidos:', error);
    return;
  }

  console.log(`✓ Encontrados ${tinyOrders?.length || 0} pedidos do Mercado Livre no Tiny`);
  console.log();

  // Procurar pelo ID do Mercado Livre no raw_payload
  let found = false;

  for (const order of tinyOrders || []) {
    const raw = order.raw_payload as any;
    const numeroPedidoEcommerce = raw?.ecommerce?.numeroPedidoEcommerce;

    if (numeroPedidoEcommerce === meliOrderId) {
      found = true;
      console.log('✅ ENCONTRADO!');
      console.log();
      console.log('Pedido do Tiny:');
      console.log(`  ID: ${order.id}`);
      console.log(`  Número: ${order.numero_pedido}`);
      console.log(`  Data: ${order.data_criacao}`);
      console.log(`  Cliente: ${order.cliente_nome || 'N/A'}`);
      console.log(`  Valor: R$ ${order.valor?.toFixed(2) || 'N/A'}`);
      console.log(`  Canal: ${order.canal}`);
      console.log();
      console.log(`ID do Mercado Livre no raw_payload: ${numeroPedidoEcommerce}`);
      console.log();

      // Buscar itens do pedido
      const { data: items, error: itemsError } = await supabaseAdmin
        .from('tiny_order_items')
        .select('*')
        .eq('order_id', order.id)
        .order('id', { ascending: true });

      if (!itemsError && items && items.length > 0) {
        console.log(`Itens do pedido (${items.length}):`);
        console.log();

        for (const item of items) {
          console.log('─'.repeat(80));
          console.log(`Produto: ${item.descricao || 'N/A'}`);
          console.log(`  Código: ${item.codigo || 'N/A'}`);
          console.log(`  ID Produto: ${item.id_produto_tiny || 'N/A'}`);
          console.log(`  Quantidade: ${item.quantidade || 0}`);
          console.log(`  Valor Unit.: R$ ${item.valor_unitario?.toFixed(2) || 'N/A'}`);
          console.log(`  Subtotal: R$ ${((item.valor_unitario || 0) * (item.quantidade || 0)).toFixed(2)}`);
          console.log();
        }
      }

      // Verificar se já está vinculado
      const { data: link, error: linkError } = await supabaseAdmin
        .from('marketplace_order_links')
        .select('*')
        .eq('tiny_order_id', order.id)
        .eq('marketplace', 'mercado_livre')
        .maybeSingle();

      if (link) {
        console.log('⚠️  Este pedido já está vinculado:');
        console.log(`  Marketplace Order ID: ${link.marketplace_order_id}`);
        console.log(`  Vinculado em: ${link.linked_at}`);
        console.log(`  Vinculado por: ${link.linked_by || 'N/A'}`);
      } else {
        console.log('📝 Este pedido NÃO está vinculado ainda');
        console.log('   Você pode vincular executando o script de auto-linking');
      }

      break;
    }
  }

  if (!found) {
    console.log('❌ Nenhum pedido do Tiny encontrado com esse ID do Mercado Livre');
    console.log();
    console.log('Possíveis razões:');
    console.log('  • O pedido ainda não foi importado do Mercado Livre para o Tiny');
    console.log('  • O pedido está no Tiny mas com outro canal');
    console.log('  • O ID não está armazenado no campo ecommerce.numeroPedidoEcommerce');
    console.log();
    console.log('Verificando se existe algum pedido com data próxima...');
    console.log();

    // Buscar pedido do Mercado Livre para ver a data
    const { data: meliOrder } = await supabaseAdmin
      .from('meli_orders')
      .select('date_created, total_amount, buyer_nickname')
      .eq('meli_order_id', parseInt(meliOrderId))
      .single();

    if (meliOrder) {
      const meliDate = new Date(meliOrder.date_created);
      const startDate = new Date(meliDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(meliDate);
      endDate.setHours(23, 59, 59, 999);

      console.log(`Pedido do Mercado Livre criado em: ${meliOrder.date_created}`);
      console.log(`Valor: R$ ${meliOrder.total_amount?.toFixed(2)}`);
      console.log(`Comprador: ${meliOrder.buyer_nickname}`);
      console.log();

      const { data: nearbyOrders } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, numero_pedido, canal, data_criacao, valor, cliente_nome, raw_payload')
        .eq('canal', 'Mercado Livre')
        .gte('data_criacao', startDate.toISOString())
        .lte('data_criacao', endDate.toISOString())
        .order('data_criacao', { ascending: false });

      if (nearbyOrders && nearbyOrders.length > 0) {
        console.log(`Encontrados ${nearbyOrders.length} pedidos do Tiny no mesmo dia:`);
        console.log();

        for (const order of nearbyOrders) {
          const raw = order.raw_payload as any;
          const numeroPedidoEcommerce = raw?.ecommerce?.numeroPedidoEcommerce;

          console.log('─'.repeat(80));
          console.log(`Pedido Tiny #${order.numero_pedido} (ID: ${order.id})`);
          console.log(`  Data: ${order.data_criacao}`);
          console.log(`  Valor: R$ ${order.valor?.toFixed(2) || 'N/A'}`);
          console.log(`  Cliente: ${order.cliente_nome || 'N/A'}`);
          console.log(`  ID Mercado Livre: ${numeroPedidoEcommerce || 'não encontrado'}`);
          console.log();
        }
      } else {
        console.log('❌ Nenhum pedido do Tiny encontrado no mesmo dia');
      }
    }
  }

  console.log('='.repeat(80));
}

findTinyOrder()
  .then(() => {
    console.log('Busca concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
