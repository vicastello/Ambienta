#!/usr/bin/env tsx
/**
 * Backfill: Sincroniza itens de pedidos do período 12/11 a 12/12/2025
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const accessToken = process.env.TINY_API_TOKEN!;

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// Importar após configurar env
import('../lib/pedidoItensHelper').then(module => {
  globalThis.salvarItensPedido = module.salvarItensPedido;
});

// Delay para garantir que import dinâmico completou
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function backfillPeriod() {
  const startDate = '2025-11-12';
  const endDate = '2025-12-12';

  console.log('='.repeat(80));
  console.log(`BACKFILL: ITENS DE PEDIDOS ${startDate} → ${endDate}`);
  console.log('='.repeat(80));
  console.log();

  // 1. Buscar pedidos do período
  console.log('1️⃣  Buscando pedidos do período...');

  let allOrders: any[] = [];
  let currentPage = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido, canal, situacao')
      .gte('data_criacao', startDate)
      .lte('data_criacao', endDate)
      .order('data_criacao', { ascending: false })
      .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

    if (error) {
      console.error('Erro:', error);
      return;
    }

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    currentPage++;
  }

  console.log(`   ✓ ${allOrders.length} pedidos encontrados`);
  console.log();

  // 2. Buscar itens existentes
  console.log('2️⃣  Identificando pedidos sem itens...');

  const orderIds = allOrders.map(o => o.id);
  let allItems: any[] = [];

  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);

    if (data) {
      allItems = allItems.concat(data);
    }
  }

  const idsWithItems = new Set(allItems.map(i => i.id_pedido));
  const ordersWithoutItems = allOrders.filter(o => !idsWithItems.has(o.id));

  console.log(`   ✓ ${ordersWithoutItems.length} pedidos sem itens`);
  console.log();

  if (ordersWithoutItems.length === 0) {
    console.log('✅ Todos os pedidos já têm itens!');
    return;
  }

  // 3. Processar backfill
  console.log(`3️⃣  Processando ${ordersWithoutItems.length} pedidos...`);
  console.log();

  const accessToken = await getAccessTokenFromDbOrRefresh();

  let sucesso = 0;
  let semItens = 0;
  let falhas = 0;

  for (let i = 0; i < ordersWithoutItems.length; i++) {
    const order = ordersWithoutItems[i];

    console.log(`[${i + 1}/${ordersWithoutItems.length}] #${order.numero_pedido} (Tiny: ${order.tiny_id}, Canal: ${order.canal})`);

    try {
      const numItens = await salvarItensPedido(
        accessToken,
        order.tiny_id,
        order.id,
        { context: 'backfill_nov_dec' }
      );

      if (numItens === null) {
        console.log(`   ✗ Falha ao buscar da API`);
        falhas++;
      } else if (numItens === 0) {
        console.log(`   ○ Pedido sem itens (vazio/cancelado)`);
        semItens++;
      } else {
        console.log(`   ✓ ${numItens} itens salvos`);
        sucesso++;
      }
    } catch (error: any) {
      console.log(`   ✗ Erro: ${error.message || error}`);
      falhas++;
    }

    // Delay entre pedidos (600ms = ~100 req/min, limite Tiny)
    if (i < ordersWithoutItems.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    // Log de progresso a cada 50 pedidos
    if ((i + 1) % 50 === 0) {
      console.log();
      console.log(`   📊 Progresso: ${sucesso} sucesso, ${semItens} vazios, ${falhas} falhas`);
      console.log();
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('RESULTADO FINAL');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total processado: ${ordersWithoutItems.length}`);
  console.log(`✓ Sucesso: ${sucesso} pedidos com itens salvos`);
  console.log(`○ Sem itens: ${semItens} pedidos vazios/cancelados`);
  console.log(`✗ Falhas: ${falhas} pedidos`);
  console.log();

  if (sucesso > 0) {
    console.log(`🎉 Backfill concluído! ${sucesso} pedidos agora têm itens cadastrados.`);
  }
}

backfillPeriod();
