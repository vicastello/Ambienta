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

async function checkLimit() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== TESTANDO DIFERENTES LIMITES ===\n');

  // Teste 1: Sem especificar limite
  const test1 = await supabaseAdmin
    .from('tiny_orders')
    .select('id', { count: 'exact' })
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate);

  console.log(`Sem limite: ${test1.data?.length} retornados, ${test1.count} total`);

  // Teste 2: Com limite explícito 5000
  const test2 = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .limit(5000);

  console.log(`Limite 5000: ${test2.data?.length} retornados`);

  // Teste 3: Usando range (paginação)
  const test3 = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .range(0, 2500);

  console.log(`Range 0-2500: ${test3.data?.length} retornados`);

  // Teste 4: Usando headers para aumentar limite
  const test4 = await supabaseAdmin
    .from('tiny_orders')
    .select('id')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .limit(10000);

  console.log(`Limite 10000: ${test4.data?.length} retornados`);
}

checkLimit().catch(console.error);
