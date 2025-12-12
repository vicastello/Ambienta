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

async function debug() {
  console.log('=== DEBUGGING BACKFILL MISMATCH ===\n');

  // 1. What the BACKFILL script sees (gte 2025-11-01)
  console.log('1️⃣  Orders without items FROM Nov 1 (backfill query):');

  let allOrders: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao')
      .gte('data_criacao', '2025-11-01')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const orderIds = allOrders.map(o => o.id);
  let allItems: any[] = [];

  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);
    if (data) allItems = allItems.concat(data);
  }

  const withItems = new Set(allItems.map(i => i.id_pedido));
  const backfillWithoutItems = allOrders.filter(o => !withItems.has(o.id));

  console.log(`   Total from Nov 1: ${allOrders.length}`);
  console.log(`   Without items: ${backfillWithoutItems.length}`);
  console.log();

  // 2. What the REPORT sees (Nov 12 - Dec 12)
  console.log('2️⃣  Orders without items FROM Nov 12 - Dec 12 (report query):');

  let reportOrders: any[] = [];
  let currentPage = 0;

  while (true) {
    const { data } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao')
      .gte('data_criacao', '2025-11-12')
      .lte('data_criacao', '2025-12-12')
      .order('id', { ascending: true })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!data || data.length === 0) break;
    reportOrders = reportOrders.concat(data);
    if (data.length < pageSize) break;
    currentPage++;
  }

  const reportIds = reportOrders.map(o => o.id);
  let reportItems: any[] = [];

  for (let i = 0; i < reportIds.length; i += 1000) {
    const batch = reportIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);
    if (data) reportItems = reportItems.concat(data);
  }

  const reportWithItems = new Set(reportItems.map(i => i.id_pedido));
  const reportWithoutItems = reportOrders.filter(o => !reportWithItems.has(o.id));

  console.log(`   Total in period: ${reportOrders.length}`);
  console.log(`   Without items: ${reportWithoutItems.length}`);
  console.log();

  // 3. Find the gap
  console.log('3️⃣  Orders in REPORT period but NOT in BACKFILL period:');
  const reportIds511 = new Set(reportWithoutItems.map(o => o.id));
  const backfillIds = new Set(backfillWithoutItems.map(o => o.id));

  const inReportNotInBackfill = reportWithoutItems.filter(o => !backfillIds.has(o.id));

  console.log(`   Orders in report (Nov 12-Dec 12) without items: ${reportWithoutItems.length}`);
  console.log(`   Orders in backfill (Nov 1+) without items: ${backfillWithoutItems.length}`);
  console.log(`   In report but NOT in backfill: ${inReportNotInBackfill.length}`);
  console.log();

  if (inReportNotInBackfill.length > 0) {
    console.log('First 10 orders in REPORT but NOT in BACKFILL:');
    inReportNotInBackfill.slice(0, 10).forEach((o: any) => {
      console.log(`  #${o.numero_pedido} (ID: ${o.id}, Tiny: ${o.tiny_id}) - ${o.data_criacao}`);
    });
  }

  // 4. Check if these orders are BEFORE Nov 12
  const inBackfillNotInReport = backfillWithoutItems.filter(o => {
    const createdAt = o.data_criacao;
    return createdAt < '2025-11-12' || createdAt > '2025-12-12';
  });

  console.log();
  console.log('4️⃣  Orders in BACKFILL but OUTSIDE report period:');
  console.log(`   Count: ${inBackfillNotInReport.length}`);
  if (inBackfillNotInReport.length > 0) {
    console.log('First 10:');
    inBackfillNotInReport.slice(0, 10).forEach((o: any) => {
      console.log(`  #${o.numero_pedido} (ID: ${o.id}, Tiny: ${o.tiny_id}) - ${o.data_criacao}`);
    });
  }
}

debug().catch(console.error);
