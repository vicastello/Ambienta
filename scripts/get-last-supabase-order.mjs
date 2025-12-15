#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pkg from '@supabase/supabase-js';
const { createClient } = pkg;

// Carrega env local (sem depender do shell), mas respeita vars já definidas.
for (const envFile of ['.env.local', '.env', '.env.local.bak']) {
  const resolved = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved, override: false });
    break;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(2);
}
const supabase = createClient(url, key);
(async () => {
  try {
    const { data, error } = await supabase
      .from('tiny_orders')
      .select('id,tiny_id,numero_pedido,valor,valor_frete,canal,cliente_nome,data_criacao,inserted_at,updated_at')
      .order('inserted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    console.log(JSON.stringify({ ok: true, order: data }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: String(e) }));
    process.exit(1);
  }
})();
