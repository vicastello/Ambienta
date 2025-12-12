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

async function checkDates() {
  console.log('=== INVESTIGANDO FORMATO DE DATAS ===\n');

  // Diferentes interpretações das datas
  const tests = [
    { name: 'DD/MM/YYYY → 12/11 e 12/12', start: '2025-11-12', end: '2025-12-12' },
    { name: 'MM/DD/YYYY → 12/11 e 12/12', start: '2025-12-11', end: '2025-12-12' },
    { name: 'Novembro completo', start: '2025-11-01', end: '2025-11-30' },
    { name: 'Dezembro até dia 12', start: '2025-12-01', end: '2025-12-12' },
  ];

  for (const test of tests) {
    const { count } = await supabaseAdmin
      .from('tiny_orders')
      .select('*', { count: 'exact', head: true })
      .gte('data_criacao', test.start)
      .lte('data_criacao', test.end);

    console.log(`${test.name}`);
    console.log(`  Período: ${test.start} até ${test.end}`);
    console.log(`  Total de pedidos: ${count}`);
    console.log();
  }

  // Verificar alguns pedidos recentes para ver formato
  const { data: recentOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, data_criacao')
    .order('data_criacao', { ascending: false })
    .limit(5);

  console.log('Pedidos mais recentes:');
  recentOrders?.forEach(p => {
    console.log(`  #${p.numero_pedido}: ${p.data_criacao}`);
  });
}

checkDates().catch(console.error);
