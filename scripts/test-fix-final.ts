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

async function test() {
  const startDate = '2025-11-01';
  const endDate = '2025-12-15';

  console.log('=== TESTANDO FIX DA API ===\n');

  // Buscar pedidos
  const { data: pedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, data_criacao')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .order('data_criacao', { ascending: false });

  console.log(`Total de pedidos no período: ${pedidos?.length || 0}`);

  // Buscar vínculos APENAS dos pedidos do período (FIX)
  const pedidoIds = (pedidos || []).map(p => p.id);
  const { data: orderLinks } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('marketplace, marketplace_order_id, tiny_order_id')
    .in('tiny_order_id', pedidoIds);

  console.log(`Vínculos encontrados: ${orderLinks?.length || 0}`);

  // Criar mapa
  const orderLinkMap = new Map();
  (orderLinks || []).forEach(link => {
    orderLinkMap.set(link.tiny_order_id, link);
  });

  // Contar não vinculados
  let pedidosNaoVinculados = 0;
  let pedidosComProblema = 0;

  for (const pedido of pedidos || []) {
    const link = orderLinkMap.get(pedido.id);
    const isMarketplace = pedido.canal && (
      pedido.canal.toLowerCase().includes('magalu') ||
      pedido.canal.toLowerCase().includes('shopee') ||
      pedido.canal.toLowerCase().includes('mercado')
    );

    if (!link && isMarketplace) {
      pedidosNaoVinculados++;
    }

    // Verificar itens
    const { data: items } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id')
      .eq('id_pedido', pedido.id);

    if (!items || items.length === 0) {
      pedidosComProblema++;
    }
  }

  console.log(`\nRESULTADO ESPERADO NO RELATÓRIO:`);
  console.log(`- Pedidos não vinculados: ${pedidosNaoVinculados}`);
  console.log(`- Pedidos sem itens: ${pedidosComProblema}`);

  if (pedidosNaoVinculados === 0 && pedidosComProblema <= 3) {
    console.log('\n✓ FIX FUNCIONOU! Alertas corretos.');
  } else {
    console.log('\n✗ Ainda há problemas.');
  }
}

test().catch(console.error);
