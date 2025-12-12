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

async function testNewApproach() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== TESTANDO NOVA ABORDAGEM SEM NESTED ===\n');
  console.log(`Período: ${startDate} até ${endDate}\n`);

  // 1. Buscar pedidos SEM nested
  const { data: pedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, data_criacao, canal, cliente_nome, situacao, valor, numero_pedido_ecommerce')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .order('data_criacao', { ascending: false });

  console.log(`✓ Pedidos retornados: ${pedidos?.length || 0}`);

  // 2. Buscar itens separadamente
  const pedidoIds = (pedidos || []).map((p: any) => p.id);
  const { data: allItens } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id, id_pedido, codigo_produto, nome_produto, quantidade, valor_unitario, valor_total')
    .in('id_pedido', pedidoIds);

  console.log(`✓ Itens retornados: ${allItens?.length || 0}`);

  // 3. Criar mapa de itens
  const itensMap = new Map<number, any[]>();
  (allItens || []).forEach((item: any) => {
    if (!itensMap.has(item.id_pedido)) {
      itensMap.set(item.id_pedido, []);
    }
    itensMap.get(item.id_pedido)!.push(item);
  });

  // 4. Processar (simular lógica da API)
  let pedidosComItens = 0;
  let pedidosSemItens = 0;

  for (const pedido of pedidos || []) {
    const itens = itensMap.get((pedido as any).id) || [];
    if (itens.length > 0) {
      pedidosComItens++;
    } else {
      pedidosSemItens++;
    }
  }

  console.log(`\nRESULTADO:`);
  console.log(`Pedidos com itens: ${pedidosComItens}`);
  console.log(`Pedidos sem itens: ${pedidosSemItens}`);
  console.log(`Total: ${pedidosComItens + pedidosSemItens}`);

  if ((pedidos?.length || 0) > 1000) {
    console.log('\n✓ SUCESSO! API agora busca mais de 1000 pedidos!');
  } else {
    console.log(`\n⚠️ Ainda limitado. Esperado: 2511, Atual: ${pedidos?.length}`);
  }
}

testNewApproach().catch(console.error);
