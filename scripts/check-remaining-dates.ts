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

async function checkDates() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== CHECKING REMAINING ORDERS WITHOUT ITEMS ===\n');

  // Get all orders
  let allOrders: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, numero_pedido, tiny_id, data_criacao')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('id', { ascending: true })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    currentPage++;
  }

  // Check items
  const orderIds = allOrders.map(o => o.id);
  let allItems: any[] = [];

  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);

    if (data) {
      allItems = allItems.concat(data);
    }
  }

  const withItems = new Set(allItems.map(i => i.id_pedido));
  const withoutItems = allOrders.filter(o => !withItems.has(o.id));

  console.log(`Total orders: ${allOrders.length}`);
  console.log(`With items: ${withItems.size}`);
  console.log(`Without items: ${withoutItems.length}`);
  console.log();

  // Analyze dates
  const dateMap = new Map<string, number>();
  withoutItems.forEach((o: any) => {
    const date = o.data_criacao.split('T')[0];
    dateMap.set(date, (dateMap.get(date) || 0) + 1);
  });

  console.log('Distribution by date:');
  const sortedDates = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  sortedDates.forEach(([date, count]) => {
    console.log(`  ${date}: ${count} orders`);
  });

  console.log(`\nFirst 20 orders without items:`);
  withoutItems.slice(0, 20).forEach((o: any) => {
    console.log(`  #${o.numero_pedido} (Tiny: ${o.tiny_id}) - ${o.data_criacao}`);
  });
}

checkDates().catch(console.error);
