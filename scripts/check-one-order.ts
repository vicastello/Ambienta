#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function check() {
  // Check order #22879 (ID: 6394)
  const { data: order } = await supabase
    .from('tiny_orders')
    .select('*')
    .eq('id', 6394)
    .single();

  const { data: items } = await supabase
    .from('tiny_pedido_itens')
    .select('*')
    .eq('id_pedido', 6394);

  console.log('Order #22879 (ID: 6394):');
  console.log('  Data criacao:', order?.data_criacao);
  console.log('  Tiny ID:', order?.tiny_id);
  console.log('  Items count:', items?.length || 0);

  if (items && items.length > 0) {
    console.log('  Items:');
    items.forEach(item => {
      console.log(`    - ${item.nome_produto} (qty: ${item.quantidade})`);
    });
  }
}

check().catch(console.error);
