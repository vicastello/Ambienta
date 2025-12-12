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

async function simulate() {
  // Testar diferentes interpretações
  const tests = [
    { desc: '12/11 a 12/12 (DD/MM)', start: '2025-11-12', end: '2025-12-12' },
    { desc: 'Novembro completo', start: '2025-11-01', end: '2025-11-30' },
    { desc: 'Nov 12 até Dez 12', start: '2025-11-12', end: '2025-12-12' },
  ];

  for (const test of tests) {
    console.log(`\n=== ${test.desc} ===`);
    console.log(`Período: ${test.start} até ${test.end}\n`);

    // Simular exatamente a API
    const { data: pedidos } = await supabaseAdmin
      .from('tiny_orders')
      .select(`
        id,
        tiny_id,
        numero_pedido,
        data_criacao,
        canal,
        cliente_nome,
        situacao,
        valor,
        numero_pedido_ecommerce,
        tiny_pedido_itens (
          id,
          id_produto_tiny,
          codigo_produto,
          nome_produto,
          quantidade,
          valor_unitario,
          valor_total
        )
      `)
      .gte('data_criacao', test.start)
      .lte('data_criacao', test.end)
      .order('data_criacao', { ascending: false });

    if (!pedidos) {
      console.log('Erro ao buscar pedidos');
      continue;
    }

    console.log(`Total de pedidos retornados: ${pedidos.length}`);

    // Buscar vínculos
    const pedidoIds = pedidos.map((p: any) => p.id);
    const { data: orderLinks } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('marketplace, marketplace_order_id, tiny_order_id')
      .in('tiny_order_id', pedidoIds);

    const orderLinkMap = new Map();
    (orderLinks || []).forEach(link => {
      orderLinkMap.set(link.tiny_order_id, link);
    });

    // Buscar componentes de kit
    const { data: kitComponents } = await supabaseAdmin
      .from('marketplace_kit_components')
      .select('marketplace, marketplace_sku, component_sku, component_qty');

    const kitMap = new Map();
    (kitComponents || []).forEach(row => {
      const key = `${row.marketplace}||${row.marketplace_sku}`;
      if (!kitMap.has(key)) kitMap.set(key, []);
      kitMap.get(key).push({ sku: row.component_sku, qty: Number(row.component_qty) });
    });

    // Processar MODO UNITÁRIO
    const pedidosSetUnitario = new Set<number>();
    let pedidosComProblemaUnitario = 0;

    for (const pedido of pedidos as any[]) {
      const pedidoItens = pedido.tiny_pedido_itens || [];
      if (pedidoItens.length === 0) {
        pedidosComProblemaUnitario++;
        continue;
      }
      pedidosSetUnitario.add(pedido.id);
    }

    // Processar MODO KIT
    const pedidosSetKit = new Set<number>();

    for (const pedido of pedidos as any[]) {
      const link = orderLinkMap.get(pedido.id);
      if (!link) continue; // Modo kit só processa pedidos vinculados

      const pedidoItens = pedido.tiny_pedido_itens || [];
      if (pedidoItens.length === 0) continue;

      // Verificar se algum kit do marketplace bate
      let foundKit = false;
      for (const [, components] of kitMap.entries()) {
        let kitQtd = Infinity;
        for (const comp of components) {
          const found = pedidoItens.find((i: any) => i.codigo_produto === comp.sku);
          if (!found) { kitQtd = 0; break; }
          kitQtd = Math.min(kitQtd, Math.floor((found.quantidade || 0) / comp.qty));
        }
        if (kitQtd > 0 && kitQtd !== Infinity) {
          foundKit = true;
          break;
        }
      }

      if (foundKit) {
        pedidosSetKit.add(pedido.id);
      }
    }

    console.log(`Pedidos no modo UNITÁRIO: ${pedidosSetUnitario.size}`);
    console.log(`Pedidos no modo KIT: ${pedidosSetKit.size}`);
    console.log(`Pedidos sem itens: ${pedidosComProblemaUnitario}`);
  }
}

simulate().catch(console.error);
