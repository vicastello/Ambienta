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

async function testPaginationFix() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== TESTANDO FIX COM PAGINAÇÃO ===\n');
  console.log(`Período: ${startDate} até ${endDate}\n`);

  // Simular lógica da API
  const allPedidos: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  console.log('Buscando pedidos...');
  while (true) {
    const { data: pedidosPage } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao, canal')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('data_criacao', { ascending: false })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!pedidosPage || pedidosPage.length === 0) break;

    allPedidos.push(...pedidosPage);
    console.log(`  Página ${currentPage + 1}: ${pedidosPage.length} pedidos`);

    if (pedidosPage.length < pageSize) break;
    currentPage++;
  }

  console.log(`\n✓ Total de pedidos carregados: ${allPedidos.length}`);

  // Buscar itens em chunks
  const pedidoIds = allPedidos.map((p: any) => p.id);
  const allItens: any[] = [];
  const chunkSize = 1000;

  console.log('\nBuscando itens...');
  for (let i = 0; i < pedidoIds.length; i += chunkSize) {
    const chunk = pedidoIds.slice(i, i + chunkSize);
    const { data: itensChunk } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id, id_pedido')
      .in('id_pedido', chunk);

    if (itensChunk) {
      allItens.push(...itensChunk);
      console.log(`  Chunk ${Math.floor(i / chunkSize) + 1}: ${itensChunk.length} itens`);
    }
  }

  console.log(`\n✓ Total de itens carregados: ${allItens.length}`);

  // Criar mapa
  const itensMap = new Map<number, any[]>();
  allItens.forEach((item: any) => {
    if (!itensMap.has(item.id_pedido)) {
      itensMap.set(item.id_pedido, []);
    }
    itensMap.get(item.id_pedido)!.push(item);
  });

  // Analisar
  let pedidosComItens = 0;
  let pedidosSemItens = 0;

  for (const pedido of allPedidos) {
    const itens = itensMap.get(pedido.id) || [];
    if (itens.length > 0) {
      pedidosComItens++;
    } else {
      pedidosSemItens++;
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log(`Total de pedidos: ${allPedidos.length} (esperado: 2511)`);
  console.log(`Pedidos com itens: ${pedidosComItens}`);
  console.log(`Pedidos sem itens: ${pedidosSemItens}`);

  if (allPedidos.length >= 2500) {
    console.log('\n✓ SUCESSO! API agora carrega todos os pedidos do período!');
  } else {
    console.log(`\n✗ Ainda incompleto. Faltam ${2511 - allPedidos.length} pedidos.`);
  }
}

testPaginationFix().catch(console.error);
