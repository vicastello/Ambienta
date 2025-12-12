import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

async function test() {
  console.log('=== TESTANDO QUERY DA API DE VENDAS ===\n');

  // Simular a query da API
  const startDate = '2025-11-01';
  const endDate = '2025-12-15';

  // 1. Buscar pedidos
  const { data: pedidos, error: pedidosError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, data_criacao, cliente_nome, situacao, valor_total_pedido')
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate)
    .order('data_criacao', { ascending: false })
    .limit(10);

  if (pedidosError) {
    console.error('Erro ao buscar pedidos:', pedidosError);
    return;
  }

  console.log(`Encontrados ${pedidos?.length || 0} pedidos`);

  // 2. Buscar vínculos
  const { data: orderLinks, error: linksError } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('marketplace, marketplace_order_id, tiny_order_id');

  if (linksError) {
    console.error('Erro ao buscar links:', linksError);
    return;
  }

  console.log(`Encontrados ${orderLinks?.length || 0} vínculos\n`);

  // 3. Criar mapa de vínculos
  const orderLinkMap = new Map();
  (orderLinks || []).forEach(link => {
    orderLinkMap.set(link.tiny_order_id, link);
  });

  // 4. Verificar pedidos
  let pedidosNaoVinculados = 0;

  for (const pedido of pedidos || []) {
    const link = orderLinkMap.get(pedido.id);
    const isMarketplace = pedido.canal && (
      pedido.canal.toLowerCase().includes('magalu') ||
      pedido.canal.toLowerCase().includes('shopee') ||
      pedido.canal.toLowerCase().includes('mercado')
    );

    const status = link ? '✓ VINCULADO' : (isMarketplace ? '✗ NÃO VINCULADO' : '○ NÃO É MARKETPLACE');

    console.log(`Pedido #${pedido.numero_pedido} (ID: ${pedido.id}) - Canal: ${pedido.canal}`);
    console.log(`  Status: ${status}`);
    if (link) {
      console.log(`  Vínculo: ${link.marketplace} - ${link.marketplace_order_id}`);
    }
    console.log();

    if (!link && isMarketplace) {
      pedidosNaoVinculados++;
    }
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`Total de pedidos: ${pedidos?.length || 0}`);
  console.log(`Pedidos não vinculados: ${pedidosNaoVinculados}`);
  console.log(`Total de vínculos no sistema: ${orderLinks?.length || 0}`);
}

test().catch(console.error);
