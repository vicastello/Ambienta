#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkFields() {
  const { data, error } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log('Campos disponíveis na tabela tiny_orders:');
  console.log(Object.keys(data || {}).join(', '));
}

checkFields();
