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

async function debugPayload() {
  console.log('=== DEBUG: ESTRUTURA DO PAYLOAD ===\n');

  // Buscar 10 pedidos sem itens
  const { data: pedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, raw_payload')
    .gte('data_criacao', '2025-11-12')
    .lte('data_criacao', '2025-12-12')
    .limit(2000);

  if (!pedidos) {
    console.log('Nenhum pedido encontrado');
    return;
  }

  // Verificar quais têm itens
  const pedidoIds = pedidos.map(p => p.id);
  const { data: allItens } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', pedidoIds);

  const pedidosComItens = new Set(allItens?.map(i => i.id_pedido) || []);

  // Encontrar pedidos SEM itens
  const pedidosSemItens = pedidos.filter(p => !pedidosComItens.has(p.id));

  console.log(`Pedidos sem itens: ${pedidosSemItens.length}`);
  console.log('\nAnalisando estrutura do payload dos primeiros 20:\n');

  for (let i = 0; i < Math.min(20, pedidosSemItens.length); i++) {
    const pedido = pedidosSemItens[i] as any;

    console.log(`\n--- Pedido #${pedido.numero_pedido} (ID: ${pedido.id}) ---`);

    if (!pedido.raw_payload) {
      console.log('  ❌ raw_payload é null');
      continue;
    }

    if (!pedido.raw_payload.pedido) {
      console.log('  ❌ raw_payload.pedido não existe');
      console.log(`  Chaves disponíveis: ${Object.keys(pedido.raw_payload).join(', ')}`);
      continue;
    }

    if (!pedido.raw_payload.pedido.itens) {
      console.log('  ❌ raw_payload.pedido.itens não existe');
      console.log(`  Chaves em pedido: ${Object.keys(pedido.raw_payload.pedido).join(', ')}`);
      continue;
    }

    const itensPayload = pedido.raw_payload.pedido.itens;
    const itens = Array.isArray(itensPayload) ? itensPayload : [itensPayload];

    console.log(`  ✓ raw_payload.pedido.itens existe (${itens.length} itens)`);

    itens.forEach((item: any, idx: number) => {
      if (item?.item) {
        console.log(`    ${idx + 1}. ${item.item.descricao || 'sem descricao'} (${item.item.codigo || 'sem codigo'}) - Qtd: ${item.item.quantidade || 0}`);
      } else {
        console.log(`    ${idx + 1}. Estrutura inválida:`, JSON.stringify(item).substring(0, 100));
      }
    });
  }
}

debugPayload().catch(console.error);
