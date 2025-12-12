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

async function debug() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('=== DEBUG: LINKS COM PAGINAÇÃO ===\n');

  // 1. Buscar pedidos
  const { data: pedidos, count } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, canal', { count: 'exact' })
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .limit(5000);

  console.log(`Total de pedidos: ${count}`);
  console.log(`Pedidos retornados: ${pedidos?.length}\n`);

  const pedidoIds = (pedidos || []).map((p: any) => p.id);

  // 2. Testar busca de links SEM chunking
  console.log('Teste 1: Buscar todos os links de uma vez...');
  const { data: allLinks } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('marketplace, marketplace_order_id, tiny_order_id')
    .in('tiny_order_id', pedidoIds);

  console.log(`  Links retornados: ${allLinks?.length}\n`);

  // 3. Testar busca de links COM chunking
  console.log('Teste 2: Buscar links em chunks de 1000...');
  const allLinksChunked: any[] = [];
  const chunkSize = 1000;

  for (let i = 0; i < pedidoIds.length; i += chunkSize) {
    const chunk = pedidoIds.slice(i, i + chunkSize);
    const { data: linksChunk } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace, marketplace_order_id, tiny_order_id')
      .in('tiny_order_id', chunk);

    if (linksChunk) {
      allLinksChunked.push(...linksChunk);
      console.log(`  Chunk ${Math.floor(i / chunkSize) + 1}: ${linksChunk.length} links`);
    }
  }

  console.log(`  Total de links (chunked): ${allLinksChunked.length}\n`);

  // 4. Verificar quantos pedidos são de marketplace
  let pedidosMarketplace = 0;
  for (const pedido of pedidos || []) {
    const isMarketplace = (pedido as any).canal && (
      (pedido as any).canal.toLowerCase().includes('magalu') ||
      (pedido as any).canal.toLowerCase().includes('shopee') ||
      (pedido as any).canal.toLowerCase().includes('mercado')
    );
    if (isMarketplace) pedidosMarketplace++;
  }

  console.log(`Pedidos de marketplace: ${pedidosMarketplace}`);

  // 5. Criar mapa de links e verificar não vinculados
  const linkMap = new Map();
  allLinksChunked.forEach(link => {
    linkMap.set(link.tiny_order_id, link);
  });

  let pedidosNaoVinculados = 0;
  for (const pedido of pedidos || []) {
    const isMarketplace = (pedido as any).canal && (
      (pedido as any).canal.toLowerCase().includes('magalu') ||
      (pedido as any).canal.toLowerCase().includes('shopee') ||
      (pedido as any).canal.toLowerCase().includes('mercado')
    );

    if (isMarketplace && !linkMap.has((pedido as any).id)) {
      pedidosNaoVinculados++;
    }
  }

  console.log(`Pedidos não vinculados: ${pedidosNaoVinculados}\n`);

  if (pedidosNaoVinculados === 0) {
    console.log('✓ SUCESSO! Todos os pedidos de marketplace estão vinculados!');
  } else {
    console.log(`⚠️ Ainda há ${pedidosNaoVinculados} pedidos não vinculados.`);
  }
}

debug().catch(console.error);
