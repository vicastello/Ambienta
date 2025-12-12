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

async function directCheck() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== CONTAGEM DIRETA ===\n');

  // Total orders in period
  const { count: totalOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate);

  console.log(`Total orders: ${totalOrders}`);

  // Orders WITH items - use LEFT JOIN to count
  const { data: ordersWithItems } = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate);

  if (!ordersWithItems) {
    console.log('Error fetching orders');
    return;
  }

  let countWithItems = 0;
  let countWithoutItems = 0;
  const withoutItemsSample: any[] = [];

  for (const order of ordersWithItems) {
    const { count } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('*', { count: 'exact', head: true })
      .eq('id_pedido', order.id);

    if (count && count > 0) {
      countWithItems++;
    } else {
      countWithoutItems++;
      if (withoutItemsSample.length < 5) {
        const { data: orderData } = await supabaseAdmin
          .from('tiny_orders')
          .select('numero_pedido, tiny_id')
          .eq('id', order.id)
          .single();
        withoutItemsSample.push({ id: order.id, ...orderData });
      }
    }
  }

  console.log(`\nOrders WITH items: ${countWithItems}`);
  console.log(`Orders WITHOUT items: ${countWithoutItems}`);

  if (withoutItemsSample.length > 0) {
    console.log(`\nSample without items:`);
    withoutItemsSample.forEach(o => {
      console.log(`  - #${o.numero_pedido} (ID: ${o.id}, Tiny: ${o.tiny_id})`);
    });
  }
}

directCheck().catch(console.error);
