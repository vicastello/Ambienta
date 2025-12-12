#!/usr/bin/env tsx
/**
 * Sincroniza TODOS os pedidos restantes sem itens
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { salvarItensPedido } from '../lib/pedidoItensHelper';

async function syncRemainingItems() {
  console.log('='.repeat(80));
  console.log('SINCRONIZAÇÃO COMPLETA - TODOS OS PEDIDOS RESTANTES');
  console.log('='.repeat(80));
  console.log();

  // 1. Buscar TODOS os pedidos desde 01/11/2025
  console.log('1️⃣  Buscando todos os pedidos...');
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
      console.error('Erro ao buscar pedidos:', error);
      return;
    }

    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`   Total de pedidos: ${allOrders.length}`);
  console.log();

  // 2. Identificar pedidos sem itens
  console.log('2️⃣  Identificando pedidos sem itens...');
  const orderIds = allOrders.map((o: any) => o.id);
  const pedidosComItens = new Set<number>();

  for (let i = 0; i < orderIds.length; i += 1000) {
    const batch = orderIds.slice(i, i + 1000);
    const { data } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', batch);

    data?.forEach((item: any) => pedidosComItens.add(item.id_pedido));
  }

  const pedidosSemItens = allOrders.filter((o: any) => !pedidosComItens.has(o.id));

  console.log(`   Pedidos com itens: ${pedidosComItens.size}`);
  console.log(`   Pedidos SEM itens: ${pedidosSemItens.length}`);
  console.log();

  if (pedidosSemItens.length === 0) {
    console.log('✅ Todos os pedidos já têm itens!');
    return;
  }

  // 3. Sincronizar
  console.log(`3️⃣  Sincronizando ${pedidosSemItens.length} pedidos...`);
  console.log('   (Delay de 2s entre pedidos para respeitar rate limit)');
  console.log();

  const accessToken = await getAccessTokenFromDbOrRefresh();
  let sucesso = 0;
  let falhas = 0;
  let totalItens = 0;
  const erros: Array<{ pedido: number; erro: string }> = [];

  for (let i = 0; i < pedidosSemItens.length; i++) {
    const order = pedidosSemItens[i];

    // Mostrar progresso a cada 10 pedidos
    if ((i + 1) % 10 === 0 || i === 0) {
      const percentual = ((i + 1) / pedidosSemItens.length * 100).toFixed(1);
      console.log(`   Progresso: ${i + 1}/${pedidosSemItens.length} (${percentual}%)`);
    }

    try {
      const numItens = await salvarItensPedido(
        accessToken,
        order.tiny_id,
        order.id,
        { context: 'sync_remaining' }
      );

      if (numItens !== null && numItens > 0) {
        sucesso++;
        totalItens += numItens;
      } else {
        falhas++;
        erros.push({ pedido: order.numero_pedido, erro: '0 itens retornados' });
      }
    } catch (error: any) {
      falhas++;
      erros.push({ pedido: order.numero_pedido, erro: error.message });

      // Se for 429, aguardar mais tempo
      if (error.status === 429) {
        console.log(`   ⚠️  Rate limit (429) - aguardando 10 segundos...`);
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

  if (erros.length > 0 && erros.length <= 20) {
    console.log('ERROS:');
    console.log('-'.repeat(80));
    erros.forEach((e, idx) => {
      console.log(`${idx + 1}. Pedido ${e.pedido}: ${e.erro}`);
    });
    console.log();
  }

  // 4. Executar fix de SKUs
  if (totalItens > 0) {
    console.log('4️⃣  Atualizando SKUs dos itens recém-sincronizados...');
    console.log();

    const { execSync } = require('child_process');
    try {
      execSync('npx tsx scripts/fix-missing-codigo-produto.ts', { stdio: 'inherit' });
    } catch (error) {
      console.error('Erro ao executar fix de SKUs:', error);
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('✅ Sincronização concluída!');
  console.log('='.repeat(80));
}

syncRemainingItems()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
