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

async function investigate() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== INVESTIGANDO 527 PEDIDOS SEM ITENS ===\n');

  // Buscar pedidos com paginação
  const allPedidos: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  while (true) {
    const { data: pedidosPage } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, numero_pedido, data_criacao, canal')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('data_criacao', { ascending: false })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!pedidosPage || pedidosPage.length === 0) break;
    allPedidos.push(...pedidosPage);
    if (pedidosPage.length < pageSize) break;
    currentPage++;
  }

  console.log(`Total de pedidos: ${allPedidos.length}\n`);

  // Verificar itens de cada pedido individualmente
  let pedidosSemItens = 0;
  const exemplosSemItens: any[] = [];

  for (const pedido of allPedidos) {
    const { data: itens, count } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id', { count: 'exact', head: false })
      .eq('id_pedido', pedido.id);

    if (!itens || itens.length === 0) {
      pedidosSemItens++;
      if (exemplosSemItens.length < 10) {
        exemplosSemItens.push({
          id: pedido.id,
          numero: pedido.numero_pedido,
          data: pedido.data_criacao,
          canal: pedido.canal,
        });
      }
    }
  }

  console.log(`Pedidos sem itens: ${pedidosSemItens}\n`);

  if (exemplosSemItens.length > 0) {
    console.log('Exemplos de pedidos sem itens:');
    exemplosSemItens.forEach(p => {
      console.log(`  #${p.numero} (ID: ${p.id}) - ${p.data} - ${p.canal}`);
    });
  }

  // Comparar com a busca em chunk
  console.log('\n=== COMPARANDO COM BUSCA EM CHUNK ===\n');

  const pedidoIds = allPedidos.map(p => p.id);
  const allItens: any[] = [];
  const chunkSize = 1000;

  for (let i = 0; i < pedidoIds.length; i += chunkSize) {
    const chunk = pedidoIds.slice(i, i + chunkSize);
    const { data: itensChunk } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id, id_pedido')
      .in('id_pedido', chunk);

    if (itensChunk) {
      allItens.push(...itensChunk);
    }
  }

  console.log(`Itens retornados pela busca em chunk: ${allItens.length}`);

  const itensMap = new Map<number, number>();
  allItens.forEach(item => {
    itensMap.set(item.id_pedido, (itensMap.get(item.id_pedido) || 0) + 1);
  });

  let semItensNaChunk = 0;
  for (const pedido of allPedidos) {
    if (!itensMap.has(pedido.id)) {
      semItensNaChunk++;
    }
  }

  console.log(`Pedidos sem itens (método chunk): ${semItensNaChunk}`);

  if (pedidosSemItens === semItensNaChunk) {
    console.log('\n✓ Métodos concordam. Os 527 pedidos realmente não têm itens.');
  } else {
    console.log(`\n⚠️ Divergência! Individual: ${pedidosSemItens}, Chunk: ${semItensNaChunk}`);
  }
}

investigate().catch(console.error);
