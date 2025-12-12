#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkSkus() {
  console.log('Verificando SKUs dos pedidos do Tiny desde 01/11/2025...');
  console.log();

  // Buscar todos os pedidos desde 01/11/2025
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', '2025-11-01');

  const orderIds = orders?.map(o => o.id) || [];

  console.log(`Total de pedidos desde 01/11/2025: ${orders?.length || 0}`);
  console.log();

  // Buscar itens desses pedidos
  const { data: allItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id, id_pedido, codigo_produto, nome_produto')
    .in('id_pedido', orderIds);

  const ordersWithItems = new Set(allItems?.map(i => i.id_pedido) || []);
  const itemsWithoutSku = allItems?.filter(i => !i.codigo_produto) || [];
  const itemsWithSku = allItems?.filter(i => i.codigo_produto) || [];

  console.log(`Pedidos com itens cadastrados: ${ordersWithItems.size}`);
  console.log(`Pedidos sem itens: ${(orders?.length || 0) - ordersWithItems.size}`);
  console.log();
  console.log(`Total de itens: ${allItems?.length || 0}`);
  console.log(`Itens COM SKU: ${itemsWithSku.length} (✓)`);
  console.log(`Itens SEM SKU: ${itemsWithoutSku.length} (✗)`);
  console.log();

  if (itemsWithoutSku.length > 0) {
    console.log('Exemplos de itens sem SKU:');
    itemsWithoutSku.slice(0, 10).forEach(item => {
      console.log(`  - ID ${item.id}: ${item.nome_produto}`);
    });
    console.log();
  }

  const percentage = allItems && allItems.length > 0
    ? ((itemsWithSku.length / allItems.length) * 100).toFixed(1)
    : '0';

  console.log(`Percentual de itens com SKU: ${percentage}%`);
}

checkSkus();
