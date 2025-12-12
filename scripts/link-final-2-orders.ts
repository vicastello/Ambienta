#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { autoLinkOrders } from '../src/services/autoLinkingService';

async function linkFinal2() {
  console.log('=== LINKING FINAL 2 ORDERS ===\n');

  // Find the 2 unlinked orders
  let allLinks: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('tiny_order_id, tiny_orders!inner(data_criacao)')
      .gte('tiny_orders.data_criacao', '2025-11-12')
      .lte('tiny_orders.data_criacao', '2025-12-12')
      .range(from, from + pageSize - 1);

    if (!data || data.length === 0) break;
    allLinks = allLinks.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const linkedIds = new Set(allLinks.map(l => l.tiny_order_id));

  const { data: allOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, tiny_id, canal, numero_pedido_ecommerce')
    .gte('data_criacao', '2025-11-12')
    .lte('data_criacao', '2025-12-12')
    .in('canal', ['Shopee', 'Magalu', 'Mercado Livre']);

  const unlinked = (allOrders || []).filter(o => !linkedIds.has(o.id));

  console.log(`Found ${unlinked.length} unlinked orders:\n`);

  for (const order of unlinked) {
    console.log(`Order #${order.numero_pedido} (ID: ${order.id}, Canal: ${order.canal})`);
    console.log(`  numero_pedido_ecommerce: ${order.numero_pedido_ecommerce || 'NULL'}`);
  }

  console.log('\nRunning auto-linking for past 90 days...\n');

  const result = await autoLinkOrders(90);

  console.log('\nAuto-linking result:');
  console.log(JSON.stringify(result, null, 2));
}

linkFinal2().catch(console.error);
