#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  const key = process.argv[2] ?? 'catalog_backfill';
  const { data, error } = await supabaseAdmin
    .from('produtos_sync_cursor')
    .select('*')
    .eq('cursor_key', key)
    .maybeSingle();
  if (error) {
    console.error('❌ Erro ao buscar cursor:', error.message);
    process.exit(1);
  }
  console.log(data);
}

main();
