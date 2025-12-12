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

async function verify() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== VERIFICAÇÃO DO ESTADO ATUAL ===\n');
  console.log(`Período: ${startDate} → ${endDate}\n`);

  // 1. Buscar TODOS os pedidos do período
  console.log('1️⃣  Buscando pedidos do período...');
  let allOrders: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, canal')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('data_criacao', { ascending: false })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    currentPage++;
  }

  console.log(`   ✓ ${allOrders.length} pedidos encontrados\n`);

  // 2. Verificar quais TÊM itens
  console.log('2️⃣  Verificando itens cadastrados...');
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

  const idsWithItems = new Set(allItems.map(i => i.id_pedido));
  const ordersWithoutItems = allOrders.filter(o => !idsWithItems.has(o.id));

  console.log(`   ✓ ${allOrders.length - ordersWithoutItems.length} pedidos COM itens`);
  console.log(`   ✗ ${ordersWithoutItems.length} pedidos SEM itens\n`);

  // 3. Verificar vínculos de marketplace
  console.log('3️⃣  Verificando vínculos de marketplace...');
  let allLinks: any[] = [];

  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace, marketplace_order_id, tiny_order_id')
      .in('tiny_order_id', batch);

    if (data) {
      allLinks = allLinks.concat(data);
    }
  }

  const linkedTinyOrderIds = new Set(allLinks.map(l => l.tiny_order_id));

  // Pedidos de marketplace são aqueles com canal específico
  const marketplaceOrders = allOrders.filter(o =>
    o.canal === 'Shopee' || o.canal === 'Magalu' || o.canal === 'Mercado Livre'
  );

  const unlinkedMarketplaceOrders = marketplaceOrders.filter(o => !linkedTinyOrderIds.has(o.id));

  console.log(`   ✓ ${marketplaceOrders.length} pedidos de marketplace no período`);
  console.log(`   ✓ ${allLinks.length} vínculos existentes`);
  console.log(`   ✗ ${unlinkedMarketplaceOrders.length} pedidos de marketplace SEM vínculo\n`);

  // 4. Detalhamento dos pedidos sem itens
  if (ordersWithoutItems.length > 0) {
    console.log('4️⃣  Amostra de pedidos SEM itens (primeiros 10):');
    for (let i = 0; i < Math.min(10, ordersWithoutItems.length); i++) {
      const o = ordersWithoutItems[i];
      console.log(`   - #${o.numero_pedido} (ID: ${o.id}, Tiny: ${o.tiny_id}, Canal: ${o.canal})`);
    }
    console.log();
  }

  // 5. Detalhamento dos pedidos não vinculados
  if (unlinkedMarketplaceOrders.length > 0) {
    console.log('5️⃣  Pedidos de marketplace NÃO vinculados (todos):');
    for (const o of unlinkedMarketplaceOrders) {
      console.log(`   - #${o.numero_pedido} (ID: ${o.id}, Tiny: ${o.tiny_id}, Canal: ${o.canal})`);
    }
    console.log();
  }

  // 6. Resumo final
  console.log('='.repeat(80));
  console.log('RESUMO');
  console.log('='.repeat(80));
  console.log(`Período analisado: ${startDate} → ${endDate}`);
  console.log(`Total de pedidos: ${allOrders.length}`);
  console.log(`Pedidos de marketplace: ${marketplaceOrders.length}`);
  console.log();
  console.log(`⚠️  Pedidos SEM itens: ${ordersWithoutItems.length}`);
  console.log(`⚠️  Pedidos de marketplace NÃO vinculados: ${unlinkedMarketplaceOrders.length}`);
  console.log();
}

verify().catch(console.error);
