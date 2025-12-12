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
  const startDate = '2025-12-11';
  const endDate = '2025-12-12';

  console.log(`=== INVESTIGANDO PERÍODO ${startDate} até ${endDate} ===\n`);

  // 1. Total de pedidos no período
  const { data: pedidos, count: totalPedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('*', { count: 'exact', head: false })
    .gte('data_criacao', startDate)
    .lte('data_criacao', endDate);

  console.log(`Total de pedidos no período: ${totalPedidos}`);
  console.log(`Pedidos retornados: ${pedidos?.length}`);

  if (!pedidos || pedidos.length === 0) {
    console.log('\n⚠️ Nenhum pedido encontrado no período!');
    return;
  }

  // 2. Verificar pedidos com itens
  let pedidosComItens = 0;
  let pedidosSemItens = 0;

  for (const pedido of pedidos) {
    const { data: itens } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id')
      .eq('id_pedido', pedido.id);

    if (itens && itens.length > 0) {
      pedidosComItens++;
    } else {
      pedidosSemItens++;
    }
  }

  console.log(`\nPedidos com itens: ${pedidosComItens}`);
  console.log(`Pedidos sem itens: ${pedidosSemItens}`);

  // 3. Verificar vínculos
  const pedidoIds = pedidos.map(p => p.id);
  const { data: orderLinks } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('marketplace, marketplace_order_id, tiny_order_id')
    .in('tiny_order_id', pedidoIds);

  const linkMap = new Map();
  (orderLinks || []).forEach(link => {
    linkMap.set(link.tiny_order_id, link);
  });

  let pedidosVinculados = 0;
  let pedidosNaoVinculados = 0;
  let pedidosMarketplace = 0;

  for (const pedido of pedidos) {
    const isMarketplace = pedido.canal && (
      pedido.canal.toLowerCase().includes('magalu') ||
      pedido.canal.toLowerCase().includes('shopee') ||
      pedido.canal.toLowerCase().includes('mercado')
    );

    if (isMarketplace) {
      pedidosMarketplace++;
      if (linkMap.has(pedido.id)) {
        pedidosVinculados++;
      } else {
        pedidosNaoVinculados++;
      }
    }
  }

  console.log(`\nPedidos de marketplace: ${pedidosMarketplace}`);
  console.log(`Pedidos vinculados: ${pedidosVinculados}`);
  console.log(`Pedidos não vinculados: ${pedidosNaoVinculados}`);

  // 4. Verificar componentes de kit
  const { data: kitComponents } = await supabaseAdmin
    .from('marketplace_kit_components')
    .select('marketplace, marketplace_sku, component_sku, component_qty');

  console.log(`\nTotal de componentes de kit registrados: ${kitComponents?.length || 0}`);

  // 5. Simular lógica do modo kit
  let pedidosComKit = 0;

  const kitMap = new Map();
  (kitComponents || []).forEach(row => {
    const key = `${row.marketplace}||${row.marketplace_sku}`;
    if (!kitMap.has(key)) kitMap.set(key, []);
    kitMap.get(key).push({ sku: row.component_sku, qty: Number(row.component_qty) });
  });

  for (const pedido of pedidos) {
    const link = linkMap.get(pedido.id);
    if (!link) continue;

    const { data: itens } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('codigo_produto, quantidade')
      .eq('id_pedido', pedido.id);

    if (!itens || itens.length === 0) continue;

    // Verificar se algum kit do marketplace bate com os itens
    let foundKit = false;
    for (const [kitKey, components] of kitMap.entries()) {
      let kitQtd = Infinity;
      for (const comp of components) {
        const found = itens.find(i => i.codigo_produto === comp.sku);
        if (!found) { kitQtd = 0; break; }
        kitQtd = Math.min(kitQtd, Math.floor((found.quantidade || 0) / comp.qty));
      }
      if (kitQtd > 0 && kitQtd !== Infinity) {
        foundKit = true;
        break;
      }
    }

    if (foundKit) {
      pedidosComKit++;
    }
  }

  console.log(`Pedidos com kit identificado: ${pedidosComKit}`);

  // 6. Análise de canais
  const canaisCount = new Map<string, number>();
  for (const pedido of pedidos) {
    const canal = pedido.canal || 'Sem canal';
    canaisCount.set(canal, (canaisCount.get(canal) || 0) + 1);
  }

  console.log('\nDistribuição por canal:');
  Array.from(canaisCount.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([canal, count]) => {
      console.log(`  ${canal}: ${count}`);
    });

  // 7. Conclusões
  console.log('\n=== RESUMO ===');
  console.log(`Pedidos totais no DB: ${totalPedidos}`);
  console.log(`Pedidos que aparecem no relatório unitário: ${pedidosComItens} (com itens)`);
  console.log(`Pedidos que aparecem no relatório kit: ${pedidosComKit} (vinculados + com kit)`);
  console.log(`\nDiferença unitário: ${totalPedidos! - pedidosComItens} pedidos`);
  console.log(`Diferença kit: ${totalPedidos! - pedidosComKit} pedidos`);
}

investigate().catch(console.error);
