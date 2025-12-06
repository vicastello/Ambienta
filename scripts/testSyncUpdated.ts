#!/usr/bin/env tsx
/**
 * Script para testar a sincronização de pedidos atualizados
 * Busca pedidos modificados nas últimas horas e atualiza no banco
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { listarPedidosTiny } from '../lib/tinyApi';
import { upsertOrdersPreservingEnriched } from '../lib/syncProcessor';
import { mapPedidoToOrderRow } from '../lib/tinyMapping';

async function main() {
  console.log('🔄 Testando sincronização de pedidos atualizados...\n');

  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();
    
    // Buscar pedidos atualizados nas últimas 24 horas
    const hoursAgo = 24;
    const lookbackDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const dataAtualizacao = lookbackDate.toISOString().split('T')[0];
    
    console.log(`📅 Buscando pedidos atualizados desde ${dataAtualizacao} (últimas ${hoursAgo}h)\n`);

    let totalProcessados = 0;
    let totalAtualizados = 0;
    let offset = 0;
    const limit = 20; // Pequeno para teste

    // Primeira página apenas
    console.log('📦 Buscando primeira página...');
    const response = await listarPedidosTiny(accessToken, {
      dataAtualizacao,
      limit,
      offset,
      orderBy: 'desc',
    }, 'cron_pedidos');

    const pedidos = response?.itens || [];
    
    if (pedidos.length === 0) {
      console.log('ℹ️  Nenhum pedido atualizado encontrado');
      return;
    }

    console.log(`✅ Encontrados ${pedidos.length} pedidos\n`);

    // Mostrar alguns exemplos
    console.log('📋 Primeiros pedidos encontrados:');
    pedidos.slice(0, 5).forEach(p => {
      console.log(`  - Pedido #${p.numeroPedido} (ID: ${p.id})`);
      console.log(`    Situação: ${p.situacao}`);
      console.log(`    Data Criação: ${p.dataCriacao}`);
      console.log(`    Cliente: ${p.cliente?.nome || 'N/A'}`);
      console.log('');
    });

    // Mapear para o formato do banco
    const rows = pedidos.map(mapPedidoToOrderRow);
    
    console.log('💾 Salvando no banco (preservando frete e canal enriquecidos)...');
    const { error } = await upsertOrdersPreservingEnriched(rows);
    
    if (error) {
      console.error('❌ Erro ao salvar:', error);
      throw error;
    }

    totalProcessados = pedidos.length;
    totalAtualizados = pedidos.length;

    console.log('\n✨ Teste concluído com sucesso!');
    console.log(`📊 Total processados: ${totalProcessados}`);
    console.log(`📊 Total atualizados: ${totalAtualizados}`);

    // Verificar algumas atualizações no banco
    console.log('\n🔍 Verificando pedidos no banco...');
    const { data: updated, error: selectError } = await supabaseAdmin
      .from('tiny_orders')
      .select('tiny_id, numero_pedido, situacao, valor_frete, canal, updated_at')
      .in('tiny_id', rows.map(r => r.tiny_id))
      .order('updated_at', { ascending: false })
      .limit(5);

    if (selectError) {
      console.error('❌ Erro ao verificar:', selectError);
    } else if (updated) {
      console.log('\n📋 Pedidos atualizados no banco:');
      updated.forEach(p => {
        console.log(`  - Pedido #${p.numero_pedido} (ID: ${p.tiny_id})`);
        console.log(`    Situação: ${p.situacao}`);
        console.log(`    Frete: R$ ${p.valor_frete?.toFixed(2) || '0.00'}`);
        console.log(`    Canal: ${p.canal || 'N/A'}`);
        console.log(`    Atualizado em: ${new Date(p.updated_at).toLocaleString('pt-BR')}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

main();
