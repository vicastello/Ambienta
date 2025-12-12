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

async function check() {
  // Check specific orders
  const testIds = [283701, 281120, 278205, 283691, 283693, 283694];

  console.log('=== VERIFICANDO PEDIDOS ESPECÍFICOS ===\n');

  for (const id of testIds) {
    const { data: order } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao')
      .eq('id', id)
      .single();

    if (!order) {
      console.log(`Order ${id}: NOT FOUND`);
      continue;
    }

    const { data: items } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id')
      .eq('id_pedido', id);

    console.log(`Order #${order.numero_pedido} (ID: ${order.id}, Tiny: ${order.tiny_id})`);
    console.log(`  Data criação: ${order.data_criacao}`);
    console.log(`  Itens: ${items?.length || 0}`);
    console.log(`  ✓ Está >= '2025-11-01': ${order.data_criacao >= '2025-11-01'}`);
    console.log();
  }
}

check().catch(console.error);
