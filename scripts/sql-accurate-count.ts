#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function sqlCount() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== SQL ACCURATE COUNT ===\n');
  console.log(`Period: ${startDate} → ${endDate}\n`);

  // Total orders
  const { data: totalData, error: totalError } = await (supabaseAdmin.rpc as any)('exec_sql', {
    sql: `
      SELECT COUNT(*) as total
      FROM tiny_orders
      WHERE data_criacao >= '${startDate}'
        AND data_criacao <= '${endDate}'
    `
  });

  if (totalError) {
    console.log('Total orders query:');
    const { count } = await supabaseAdmin
      .from('tiny_orders')
      .select('*', { count: 'exact', head: true })
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate);
    console.log(`  Total: ${count}`);
  } else {
    console.log(`Total orders: ${totalData[0]?.total || 0}`);
  }

  // Orders with items - fetch ALL orders first, then check items
  console.log('\nFetching all orders with pagination...');

  let allOrders: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, numero_pedido, tiny_id, canal')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('id', { ascending: true })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    currentPage++;
  }

  console.log(`Loaded ${allOrders.length} orders`);
  console.log('\nChecking which orders have items...');

  // Check items in batches
  const orderIds = allOrders.map(o => o.id);
  let allItemRecords: any[] = [];

  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);

    if (data) {
      allItemRecords = allItemRecords.concat(data);
    }
  }

  const ordersWithItems = new Set(allItemRecords.map((item: any) => item.id_pedido));
  const ordersWithoutItems = allOrders.filter((o: any) => !ordersWithItems.has(o.id));

  console.log(`\nOrders WITH items: ${ordersWithItems.size}`);
  console.log(`Orders WITHOUT items: ${ordersWithoutItems.length}`);

  if (ordersWithoutItems.length > 0) {
    console.log(`\nFirst 10 without items:`);
    ordersWithoutItems.slice(0, 10).forEach((o: any) => {
      console.log(`  - #${o.numero_pedido} (ID: ${o.id}, Tiny: ${o.tiny_id}, Canal: ${o.canal})`);
    });
  }

  // Unlinked marketplace orders
  console.log('\n\nCounting marketplace links...');

  const marketplaceOrders = allOrders.filter((o: any) =>
    o.canal === 'Shopee' || o.canal === 'Magalu' || o.canal === 'Mercado Livre'
  );

  // Fetch links in batches
  const marketplaceIds = marketplaceOrders.map((o: any) => o.id);
  let allLinks: any[] = [];

  for (let i = 0; i < marketplaceIds.length; i += 1000) {
    const batch = marketplaceIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('tiny_order_id')
      .in('tiny_order_id', batch);

    if (data) {
      allLinks = allLinks.concat(data);
    }
  }

  const linkedIds = new Set(allLinks.map((l: any) => l.tiny_order_id));
  const unlinked = marketplaceOrders.filter((o: any) => !linkedIds.has(o.id));

  console.log(`Marketplace orders: ${marketplaceOrders.length}`);
  console.log(`Links found: ${linkedIds.size}`);
  console.log(`Unlinked: ${unlinked.length}`);

  if (unlinked.length > 0) {
    console.log(`\nUnlinked marketplace orders:`);
    unlinked.forEach((o: any) => {
      console.log(`  - #${o.numero_pedido} (ID: ${o.id}, Tiny: ${o.tiny_id}, Canal: ${o.canal})`);
    });
  }
}

sqlCount().catch(console.error);
