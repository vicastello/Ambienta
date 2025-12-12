#!/usr/bin/env tsx
/**
 * Sincroniza TODOS os 769 pedidos sem itens buscando direto da API
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { salvarItensPedido } from '../lib/pedidoItensHelper';

async function syncAll769Orders() {
  console.log('='.repeat(80));
  console.log('SINCRONIZAÇÃO COMPLETA - 769 PEDIDOS SEM ITENS');
  console.log('='.repeat(80));
  console.log();

  // Buscar pedidos sem itens
  console.log('1️⃣  Buscando pedidos sem itens...');

  let allOrders: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, tiny_id, numero_pedido')
      .gte('data_criacao', '2025-11-01')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Erro:', error);
      return;
    }

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Buscar itens
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

  console.log(`   Total de pedidos: ${allOrders.length}`);
  console.log(`   Pedidos sem itens: ${ordersWithoutItems.length}`);
  console.log();

  if (ordersWithoutItems.length === 0) {
    console.log('✅ Todos os pedidos já têm itens!');
    return;
  }

  // Sincronizar TODOS
  console.log(`2️⃣  Sincronizando ${ordersWithoutItems.length} pedidos...`);
  console.log('   (Delay de 2 segundos entre pedidos para respeitar rate limit)');
  console.log();

  const accessToken = await getAccessTokenFromDbOrRefresh();

  let sucesso = 0;
  let falhas = 0;
  let totalItens = 0;
  const falhasDetalhadas: Array<{ numero: number; erro: string }> = [];

  for (let i = 0; i < ordersWithoutItems.length; i++) {
    const order = ordersWithoutItems[i];

    // Mostrar progresso a cada 10 pedidos
    if ((i + 1) % 10 === 0 || i === 0) {
      console.log(`   Progresso: ${i + 1}/${ordersWithoutItems.length} (${((i + 1) / ordersWithoutItems.length * 100).toFixed(1)}%)`);
    }

    try {
      const numItens = await salvarItensPedido(
        accessToken,
        order.tiny_id,
        order.id,
        { context: 'sync_all_769' }
      );

      if (numItens !== null && numItens > 0) {
        sucesso++;
        totalItens += numItens;
      } else {
        falhas++;
        falhasDetalhadas.push({ numero: order.numero_pedido, erro: '0 itens retornados' });
      }
    } catch (error: any) {
      falhas++;
      falhasDetalhadas.push({ numero: order.numero_pedido, erro: error.message });

      // Se for 429, aumentar delay
      if (error.status === 429) {
        console.log(`   ⚠️  Rate limit - aguardando 10 segundos...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // Delay entre pedidos
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log();
  console.log('='.repeat(80));
  console.log('RESULTADO FINAL');
  console.log('='.repeat(80));
  console.log();
  console.log(`✓ Pedidos sincronizados com sucesso: ${sucesso}`);
  console.log(`✗ Falhas: ${falhas}`);
  console.log(`📦 Total de itens salvos: ${totalItens}`);
  console.log();

  if (falhas > 0 && falhasDetalhadas.length > 0) {
    console.log('FALHAS DETALHADAS (primeiras 20):');
    console.log('-'.repeat(80));
    falhasDetalhadas.slice(0, 20).forEach((f, idx) => {
      console.log(`${idx + 1}. Pedido ${f.numero}: ${f.erro}`);
    });
    console.log();
  }

  // Executar fix de SKUs após sincronização
  if (totalItens > 0) {
    console.log('3️⃣  Atualizando SKUs dos itens recém-sincronizados...');
    console.log();

    const { execSync } = require('child_process');
    try {
      execSync('npx tsx scripts/fix-missing-codigo-produto.ts', { stdio: 'inherit' });
    } catch (error) {
      console.error('Erro ao executar fix de SKUs:', error);
    }
  }
}

syncAll769Orders()
  .then(() => {
    console.log('='.repeat(80));
    console.log('✅ Sincronização concluída!');
    console.log('='.repeat(80));
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
