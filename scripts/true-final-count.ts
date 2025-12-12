#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function trueCount() {
  console.log('=== TRUE FINAL COUNT (avoiding 1000 limit) ===\n');

  // Method 1: Fetch ALL items with pagination, then count distinct orders
  console.log('Fetching ALL items for period (with pagination)...');

  let allItemRecords: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido, tiny_orders!inner(data_criacao)')
      .gte('tiny_orders.data_criacao', '2025-11-12')
      .lte('tiny_orders.data_criacao', '2025-12-12')
      .range(from, from + pageSize - 1);

    if (!data || data.length === 0) break;
    allItemRecords = allItemRecords.concat(data);
    console.log(`  Loaded ${allItemRecords.length} item records so far...`);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const uniqueOrdersWithItems = new Set(allItemRecords.map(i => i.id_pedido));

  console.log(`\nTotal item records: ${allItemRecords.length}`);
  console.log(`Distinct orders WITH items: ${uniqueOrdersWithItems.size}`);

  // Total orders
  const { count: totalOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_criacao', '2025-11-12')
    .lte('data_criacao', '2025-12-12');

  console.log(`\nTotal orders: ${totalOrders}`);
  console.log(`Orders WITHOUT items: ${totalOrders! - uniqueOrdersWithItems.size}`);

  // Links
  console.log('\n--- Marketplace Links ---');

  let allLinks: any[] = [];
  from = 0;

  while (true) {
    const { data } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('tiny_order_id, tiny_orders!inner(data_criacao)')
      .gte('tiny_orders.data_criacao', '2025-11-12')
      .lte('tiny_orders.data_criacao', '2025-12-12')
      .range(from, from + pageSize - 1);

    if (!data || data.length === 0) break;
    allLinks = allLinks.concat(data);
    console.log(`  Loaded ${allLinks.length} links so far...`);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const uniqueLinked = new Set(allLinks.map(l => l.tiny_order_id));

  const { count: marketplaceCount } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_criacao', '2025-11-12')
    .lte('data_criacao', '2025-12-12')
    .in('canal', ['Shopee', 'Magalu', 'Mercado Livre']);

  console.log(`\nTotal marketplace orders: ${marketplaceCount}`);
  console.log(`Marketplace orders WITH links: ${uniqueLinked.size}`);
  console.log(`Marketplace orders WITHOUT links: ${marketplaceCount! - uniqueLinked.size}`);

  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Period: Nov 12 - Dec 12, 2025`);
  console.log(`Total orders: ${totalOrders}`);
  console.log(`Orders WITH items: ${uniqueOrdersWithItems.size}`);
  console.log(`Orders WITHOUT items: ${totalOrders! - uniqueOrdersWithItems.size}`);
  console.log(``);
  console.log(`Marketplace orders: ${marketplaceCount}`);
  console.log(`Linked: ${uniqueLinked.size}`);
  console.log(`Unlinked: ${marketplaceCount! - uniqueLinked.size}`);
}

trueCount().catch(console.error);
