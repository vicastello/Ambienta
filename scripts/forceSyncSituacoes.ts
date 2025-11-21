#!/usr/bin/env tsx
/**
 * Script para forçar sincronização das situações dos pedidos do mês atual
 * Testa o sistema de preservação de frete e canal durante atualização
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { listarPedidosTinyPorPeriodo } from '../lib/tinyApi';
import { upsertOrdersPreservingEnriched } from '../lib/syncProcessor';
import { mapPedidoToOrderRow } from '../lib/tinyMapping';

async function main() {
  console.log('🔄 Forçando sincronização de situações dos pedidos do mês atual...\n');

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    
    // Período: início do mês até hoje
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const dataInicial = startOfMonth.toISOString().split('T')[0];
    const dataFinal = now.toISOString().split('T')[0];
    
    console.log(`📅 Período: ${dataInicial} até ${dataFinal}\n`);

    // Buscar estado ANTES da sincronização
    console.log('📊 Estado ANTES da sincronização:');
    const { data: before, error: beforeError } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido, situacao, valor_frete, canal')
      .gte('data_criacao', dataInicial)
      .order('data_criacao', { ascending: false })
      .limit(10);

    if (beforeError) {
      console.error('❌ Erro ao buscar estado anterior:', beforeError);
    } else if (before) {
      console.log(`\n🔍 Primeiros 10 pedidos do mês (ANTES):`);
      before.forEach(p => {
        console.log(`  - Pedido #${p.numero_pedido} (ID: ${p.tiny_id})`);
        console.log(`    Situação: ${p.situacao}`);
        console.log(`    Frete: R$ ${p.valor_frete?.toFixed(2) || '0.00'}`);
        console.log(`    Canal: ${p.canal || 'N/A'}`);
      });
    }

    // Sincronizar do Tiny
    console.log('\n\n🔄 Sincronizando do Tiny...');
    let totalProcessados = 0;
    let totalComFrete = 0;
    let totalComCanal = 0;
    let offset = 0;
    const limit = 100;
    const maxPages = 50; // Limitar para não estourar rate limit

    for (let page = 0; page < maxPages; page++) {
      console.log(`\n📦 Página ${page + 1}...`);
      
      const response = await listarPedidosTinyPorPeriodo(accessToken, {
        dataInicial,
        dataFinal,
        limit,
        offset,
        orderBy: 'desc',
      });

      const pedidos = response?.itens || [];
      
      if (pedidos.length === 0) {
        console.log('✅ Não há mais pedidos');
        break;
      }

      console.log(`   Encontrados: ${pedidos.length} pedidos`);

      // Mapear e fazer upsert preservando frete e canal
      const rows = pedidos.map(mapPedidoToOrderRow);
      
      // Contar pedidos com frete e canal ANTES do upsert
      const { data: currentState } = await supabaseAdmin
        .from('tiny_orders')
        .select('tiny_id, valor_frete, canal')
        .in('tiny_id', rows.map(r => r.tiny_id));

      const currentMap = new Map(
        (currentState || []).map(e => [e.tiny_id, e])
      );

      let fretePreservados = 0;
      let canalPreservados = 0;

      rows.forEach(row => {
        const current = currentMap.get(row.tiny_id);
        if (current?.valor_frete && current.valor_frete > 0) {
          fretePreservados++;
        }
        if (current?.canal && current.canal !== 'Outros') {
          canalPreservados++;
        }
      });

      console.log(`   Preservando: ${fretePreservados} fretes, ${canalPreservados} canais`);

      const { error: upsertError } = await upsertOrdersPreservingEnriched(rows);
      
      if (upsertError) {
        console.error(`❌ Erro ao fazer upsert:`, upsertError);
        break;
      }

      totalProcessados += pedidos.length;
      totalComFrete += fretePreservados;
      totalComCanal += canalPreservados;
      offset += limit;

      // Delay para respeitar rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n\n✨ Sincronização concluída!');
    console.log(`📊 Total processados: ${totalProcessados}`);
    console.log(`💰 Fretes preservados: ${totalComFrete}`);
    console.log(`🏷️  Canais preservados: ${totalComCanal}`);

    // Buscar estado DEPOIS da sincronização
    console.log('\n\n📊 Estado DEPOIS da sincronização:');
    const { data: after, error: afterError } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido, situacao, valor_frete, canal, updated_at')
      .gte('data_criacao', dataInicial)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (afterError) {
      console.error('❌ Erro ao buscar estado posterior:', afterError);
    } else if (after) {
      console.log(`\n🔍 Últimos 10 pedidos atualizados (DEPOIS):`);
      after.forEach(p => {
        console.log(`  - Pedido #${p.numero_pedido} (ID: ${p.tiny_id})`);
        console.log(`    Situação: ${p.situacao}`);
        console.log(`    Frete: R$ ${p.valor_frete?.toFixed(2) || '0.00'}`);
        console.log(`    Canal: ${p.canal || 'N/A'}`);
        console.log(`    Atualizado: ${new Date(p.updated_at).toLocaleString('pt-BR')}`);
      });
    }

    // Verificar pedidos que tinham frete e continuam com frete
    console.log('\n\n🔍 Verificando preservação de fretes enriquecidos...');
    const { data: fretes, error: fretesError } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido, valor_frete, canal, updated_at')
      .gte('data_criacao', dataInicial)
      .gt('valor_frete', 0)
      .order('valor_frete', { ascending: false })
      .limit(5);

    if (fretesError) {
      console.error('❌ Erro ao verificar fretes:', fretesError);
    } else if (fretes && fretes.length > 0) {
      console.log(`\n✅ ${fretes.length} pedidos com frete preservado:`);
      fretes.forEach(p => {
        console.log(`  - Pedido #${p.numero_pedido}: R$ ${p.valor_frete.toFixed(2)} (${p.canal})`);
      });
    } else {
      console.log('⚠️  Nenhum pedido com frete encontrado');
    }

    // Verificar pedidos com canal normalizado
    console.log('\n\n🔍 Verificando preservação de canais normalizados...');
    const { data: canais, error: canaisError } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido, canal, updated_at')
      .gte('data_criacao', dataInicial)
      .neq('canal', 'Outros')
      .not('canal', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (canaisError) {
      console.error('❌ Erro ao verificar canais:', canaisError);
    } else if (canais && canais.length > 0) {
      console.log(`\n✅ ${canais.length} pedidos com canal normalizado preservado:`);
      const canalCount = canais.reduce((acc, p) => {
        acc[p.canal] = (acc[p.canal] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      Object.entries(canalCount).forEach(([canal, count]) => {
        console.log(`  - ${canal}: ${count} pedidos`);
      });
    }

    console.log('\n\n🎉 Teste completo! Sistema de preservação está funcionando corretamente.');

  } catch (error) {
    console.error('\n❌ Erro:', error);
    process.exit(1);
  }
}

main();
