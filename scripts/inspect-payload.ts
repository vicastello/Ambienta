#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function inspect() {
  const { data } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, raw_payload')
    .gte('data_criacao', '2024-11-01')
    .limit(1)
    .single();

  if (data) {
    console.log('Order:', data.numero_pedido);
    console.log('Tiny ID:', data.tiny_id);
    console.log();
    console.log('Raw Payload:');
    console.log(JSON.stringify(data.raw_payload, null, 2));
  }
}

inspect();
