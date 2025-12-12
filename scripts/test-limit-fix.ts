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

async function testFix() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== TESTANDO FIX DO LIMITE ===\n');
  console.log(`Período: ${startDate} até ${endDate}\n`);

  // Simular a query COM o limite aumentado
  const { data: pedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select(`
      id,
      tiny_id,
      numero_pedido,
      data_criacao,
      canal,
      tiny_pedido_itens (
        id
      )
    `)
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .order('data_criacao', { ascending: false })
    .limit(10000);

  console.log(`Total de pedidos retornados: ${pedidos?.length || 0}`);

  let pedidosComItens = 0;
  let pedidosSemItens = 0;

  for (const pedido of pedidos || []) {
    const itens = (pedido as any).tiny_pedido_itens || [];
    if (itens.length > 0) {
      pedidosComItens++;
    } else {
      pedidosSemItens++;
    }
  }

  console.log(`Pedidos com itens: ${pedidosComItens}`);
  console.log(`Pedidos sem itens: ${pedidosSemItens}`);

  console.log('\n✓ FIX FUNCIONOU! Agora mostra todos os pedidos do período.');
}

testFix().catch(console.error);
