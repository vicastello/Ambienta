#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function count() {
  console.log('=== FINAL VERIFICATION ===\n');

  // Count total orders
  const { count: totalOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_criacao', '2025-11-12')
    .lte('data_criacao', '2025-12-12');

  console.log(`Total orders in period (Nov 12 - Dec 12): ${totalOrders}`);

  // Count distinct orders that HAVE items using a JOIN
  const { data: ordersWithItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido, tiny_orders!inner(data_criacao)')
    .gte('tiny_orders.data_criacao', '2025-11-12')
    .lte('tiny_orders.data_criacao', '2025-12-12');

  const uniqueOrdersWithItems = new Set((ordersWithItems || []).map(i => i.id_pedido));

  console.log(`Orders WITH items: ${uniqueOrdersWithItems.size}`);
  console.log(`Orders WITHOUT items: ${totalOrders! - uniqueOrdersWithItems.size}`);

  // Marketplace links
  console.log('\n--- Marketplace Links ---');

  const { count: marketplaceCount } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: true })
    .gte('data_criacao', '2025-11-12')
    .lte('data_criacao', '2025-12-12')
    .in('canal', ['Shopee', 'Magalu', 'Mercado Livre']);

  console.log(`Total marketplace orders: ${marketplaceCount}`);

  const { data: links } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('tiny_order_id, tiny_orders!inner(data_criacao)')
    .gte('tiny_orders.data_criacao', '2025-11-12')
    .lte('tiny_orders.data_criacao', '2025-12-12');

  const uniqueLinked = new Set((links || []).map(l => l.tiny_order_id));

  console.log(`Marketplace orders WITH links: ${uniqueLinked.size}`);
  console.log(`Marketplace orders WITHOUT links: ${marketplaceCount! - uniqueLinked.size}`);
}

count().catch(console.error);
