#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  const { data, error } = await supabaseAdmin
    .from('sync_logs')
    .select('created_at, level, message, meta')
    .contains('meta', { mode: 'backfill', cursorKey: 'catalog_backfill' } as any)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Erro ao buscar sync_logs:', error.message);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

main();
