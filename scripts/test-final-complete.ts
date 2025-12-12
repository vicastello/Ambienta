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

async function testComplete() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== TESTE COMPLETO DA API CORRIGIDA ===\n');
  console.log(`Período: ${startDate} até ${endDate}\n`);

  // Simular exatamente a lógica da API corrigida

  // 1. Buscar TODOS os pedidos com paginação
  const allPedidos: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  console.log('1. Buscando pedidos com paginação...');
  while (true) {
    const { data: pedidosPage } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, data_criacao, canal, cliente_nome, situacao, valor')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('data_criacao', { ascending: false })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (!pedidosPage || pedidosPage.length === 0) break;

    allPedidos.push(...pedidosPage);

    if (pedidosPage.length < pageSize) break;
    currentPage++;
  }

  console.log(`   ✓ Total: ${allPedidos.length} pedidos\n`);

  // 2. Buscar itens em chunks
  const pedidoIds = allPedidos.map((p: any) => p.id);
  const allItens: any[] = [];
  const chunkSize = 1000;

  console.log('2. Buscando itens em chunks...');
  for (let i = 0; i < pedidoIds.length; i += chunkSize) {
    const chunk = pedidoIds.slice(i, i + chunkSize);
    const { data: itensChunk } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id, id_pedido, codigo_produto, quantidade')
      .in('id_pedido', chunk);

    if (itensChunk) {
      allItens.push(...itensChunk);
    }
  }

  console.log(`   ✓ Total: ${allItens.length} itens\n`);

  // 3. Buscar links em chunks
  console.log('3. Buscando vínculos em chunks...');
  const allOrderLinks: any[] = [];
  for (let i = 0; i < pedidoIds.length; i += chunkSize) {
    const chunk = pedidoIds.slice(i, i + chunkSize);
    const { data: linksChunk } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace, marketplace_order_id, tiny_order_id')
      .in('tiny_order_id', chunk);

    if (linksChunk) {
      allOrderLinks.push(...linksChunk);
    }
  }

  console.log(`   ✓ Total: ${allOrderLinks.length} vínculos\n`);

  // 4. Criar mapas
  const itensMap = new Map<number, any[]>();
  allItens.forEach((item: any) => {
    if (!itensMap.has(item.id_pedido)) {
      itensMap.set(item.id_pedido, []);
    }
    itensMap.get(item.id_pedido)!.push(item);
  });

  const orderLinkMap = new Map();
  allOrderLinks.forEach(link => {
    orderLinkMap.set(link.tiny_order_id, link);
  });

  // 5. Processar e analisar
  let pedidosNaoVinculados = 0;
  let pedidosComProblema = 0;
  let pedidosMarketplace = 0;

  for (const pedido of allPedidos) {
    const itens = itensMap.get(pedido.id) || [];
    const isMarketplace = pedido.canal && (
      pedido.canal.toLowerCase().includes('magalu') ||
      pedido.canal.toLowerCase().includes('shopee') ||
      pedido.canal.toLowerCase().includes('mercado')
    );

    if (isMarketplace) {
      pedidosMarketplace++;
      if (!orderLinkMap.has(pedido.id)) {
        pedidosNaoVinculados++;
      }
    }

    if (itens.length === 0) {
      pedidosComProblema++;
    }
  }

  console.log('=== RESULTADO FINAL ===');
  console.log(`Total de pedidos: ${allPedidos.length}`);
  console.log(`Pedidos de marketplace: ${pedidosMarketplace}`);
  console.log(`Pedidos não vinculados: ${pedidosNaoVinculados}`);
  console.log(`Pedidos sem itens: ${pedidosComProblema}`);

  console.log('\n=== ALERTAS NO RELATÓRIO ===');
  if (pedidosNaoVinculados > 0) {
    console.log(`⚠️  ${pedidosNaoVinculados} pedido(s) de marketplace não estão vinculados`);
  } else {
    console.log('✓ Todos os pedidos de marketplace estão vinculados');
  }

  if (pedidosComProblema > 0) {
    console.log(`⚠️  ${pedidosComProblema} pedido(s) sem itens cadastrados`);
  } else {
    console.log('✓ Todos os pedidos têm itens cadastrados');
  }

  if (pedidosNaoVinculados === 0 && pedidosComProblema <= 3) {
    console.log('\n✓ SUCESSO! Alertas corretos e esperados.');
  }
}

testComplete().catch(console.error);
