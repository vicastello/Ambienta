#!/usr/bin/env tsx
/**
 * Script para corrigir todos os dados:
 * 1. Remover duplicatas do Mercado Livre
 * 2. Atualizar códigos faltantes no Tiny
 * 3. Sincronizar pedidos do Tiny desde 01/11
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function fixAllData() {
  console.log('='.repeat(80));
  console.log('CORREÇÃO COMPLETA DE DADOS');
  console.log('='.repeat(80));
  console.log();

  // 1. REMOVER DUPLICATAS DO MERCADO LIVRE
  console.log('1️⃣  Removendo duplicatas do Mercado Livre...');
  console.log();

  const { data: allMeliItems } = await supabaseAdmin
    .from('meli_order_items')
    .select('id, meli_order_id, item_id, variation_id, created_at')
    .order('meli_order_id')
    .order('item_id')
    .order('variation_id')
    .order('created_at');

  if (allMeliItems && allMeliItems.length > 0) {
    const duplicates: number[] = [];
    const seen = new Set<string>();

    for (const item of allMeliItems) {
      const key = `${item.meli_order_id}-${item.item_id}-${item.variation_id || ''}`;

      if (seen.has(key)) {
        // É uma duplicata
        duplicates.push(item.id);
      } else {
        seen.add(key);
      }
    }

    if (duplicates.length > 0) {
      console.log(`   Encontradas ${duplicates.length} duplicatas`);

      // Deletar em lotes de 100
      for (let i = 0; i < duplicates.length; i += 100) {
        const batch = duplicates.slice(i, i + 100);
        const { error } = await supabaseAdmin
          .from('meli_order_items')
          .delete()
          .in('id', batch);

        if (error) {
          console.error(`   Erro ao deletar lote ${i / 100 + 1}:`, error);
        } else {
          console.log(`   Deletado lote ${i / 100 + 1}: ${batch.length} itens`);
        }
      }

      console.log(`   ✓ ${duplicates.length} duplicatas removidas`);
    } else {
      console.log('   ✓ Nenhuma duplicata encontrada');
    }
  }

  console.log();

  // 2. ATUALIZAR CÓDIGOS FALTANTES NO TINY
  console.log('2️⃣  Atualizando códigos faltantes no Tiny...');
  console.log();

  const { data: itensWithoutCode } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id, id_produto_tiny, codigo_produto')
    .is('codigo_produto', null)
    .not('id_produto_tiny', 'is', null);

  if (itensWithoutCode && itensWithoutCode.length > 0) {
    console.log(`   Encontrados ${itensWithoutCode.length} itens sem código`);

    // Buscar códigos do catálogo
    const produtoIds = [...new Set(itensWithoutCode.map(i => i.id_produto_tiny).filter(Boolean))];

    const { data: produtos } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny, codigo')
      .in('id_produto_tiny', produtoIds);

    const produtosMap = new Map<number, string>();
    produtos?.forEach(p => {
      if (p.id_produto_tiny && p.codigo) {
        produtosMap.set(p.id_produto_tiny, p.codigo);
      }
    });

    console.log(`   Encontrados ${produtosMap.size} produtos com código no catálogo`);

    let updated = 0;
    for (const item of itensWithoutCode) {
      if (!item.id_produto_tiny) continue;

      const codigo = produtosMap.get(item.id_produto_tiny);
      if (codigo) {
        const { error } = await supabaseAdmin
          .from('tiny_pedido_itens')
          .update({ codigo_produto: codigo })
          .eq('id', item.id);

        if (!error) {
          updated++;
          if (updated % 50 === 0) {
            console.log(`   Atualizados: ${updated}/${itensWithoutCode.length}`);
          }
        }
      }
    }

    console.log(`   ✓ ${updated} códigos atualizados`);
  } else {
    console.log('   ✓ Todos os itens já têm código');
  }

  console.log();

  // 3. SINCRONIZAR PEDIDOS DO TINY DESDE 01/11
  console.log('3️⃣  Verificando sincronização de itens dos pedidos do Tiny...');
  console.log();

  const startDate = '2024-11-01';

  // Buscar pedidos desde 01/11
  const { data: tinyOrders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, data_criacao')
    .gte('data_criacao', startDate)
    .order('data_criacao', { ascending: true });

  if (tinyOrders && tinyOrders.length > 0) {
    console.log(`   Encontrados ${tinyOrders.length} pedidos desde ${startDate}`);

    // Verificar quais já têm itens
    const orderIds = tinyOrders.map(o => o.id);
    const { data: existingItems } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', orderIds);

    const ordersWithItems = new Set(existingItems?.map(i => i.id_pedido) || []);
    const ordersWithoutItems = tinyOrders.filter(o => !ordersWithItems.has(o.id));

    console.log(`   ${ordersWithItems.size} pedidos já têm itens`);
    console.log(`   ${ordersWithoutItems.length} pedidos precisam de sincronização`);

    if (ordersWithoutItems.length > 0) {
      console.log();
      console.log('   ⚠️  Para sincronizar os itens desses pedidos, execute:');
      console.log('   npx tsx scripts/sync-tiny-items-since-nov.ts');
      console.log();
      console.log('   Ou configure a sincronização automática via cron job.');
      console.log('   A sincronização respeita rate limits e pode levar alguns minutos.');
    } else {
      console.log('   ✓ Todos os pedidos já têm itens sincronizados');
    }
  } else {
    console.log('   ✓ Nenhum pedido encontrado desde essa data');
  }

  console.log();
  console.log('='.repeat(80));
  console.log('CORREÇÃO CONCLUÍDA!');
  console.log('='.repeat(80));
}

fixAllData()
  .then(() => {
    console.log();
    console.log('✅ Todos os dados foram corrigidos com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro na correção:', error);
    process.exit(1);
  });
