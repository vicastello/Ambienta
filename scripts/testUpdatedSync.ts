/**
 * Script para testar o que está acontecendo com a sincronização de pedidos atualizados
 */

import { createClient } from "@supabase/supabase-js";
import { getAccessTokenFromDbOrRefresh } from "../lib/tinyAuth";
import { listarPedidosTinyPorPeriodo } from "../lib/tinyApi";
import { mapPedidoToOrderRow } from "../lib/tinyMapping";
import { upsertOrdersPreservingEnriched } from "../lib/syncProcessor";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testUpdatedSync() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🔍 TESTE DE SINCRONIZAÇÃO DE PEDIDOS ATUALIZADOS');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const accessToken = await getAccessTokenFromDbOrRefresh();
  
  // Buscar pedidos atualizados nas últimas 6 horas
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const dataAtualizacao = lookbackDate.toISOString().split('T')[0];
  
  console.log(`📅 Período: ${dataAtualizacao} até hoje`);
  console.log(`⏰ Últimas 6 horas\n`);
  
  const response = await listarPedidosTinyPorPeriodo(accessToken, {
    dataInicial: dataAtualizacao,
    dataFinal: now.toISOString().split('T')[0],
    limit: 5,
    offset: 0,
    orderBy: 'desc',
  });

  const pedidos = response?.itens || [];
  console.log(`📦 Encontrados: ${pedidos.length} pedidos\n`);
  
  if (pedidos.length === 0) {
    console.log('⚠️  Nenhum pedido encontrado no período\n');
    return;
  }

  for (const pedido of pedidos) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Pedido #${pedido.numeroPedido} (Tiny ID: ${pedido.id})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    console.log('\n📋 DADOS BRUTOS DA API:');
    console.log(`  situacao: ${pedido.situacao}`);
    console.log(`  ecommerce?.canal: ${pedido.ecommerce?.canal || '❌ NULL'}`);
    console.log(`  valorFrete: ${pedido.valorFrete || '❌ 0'}`);
    console.log(`  valor: ${pedido.valor || '❌ NULL'}`);
    
    // Verificar no banco ANTES do upsert
    const { data: existing } = await supabase
      .from('tiny_orders')
      .select('tiny_id, situacao, canal, valor_frete')
      .eq('tiny_id', pedido.id)
      .single();
    
    if (existing) {
      console.log('\n💾 DADOS NO BANCO (ANTES):');
      console.log(`  situacao: ${existing.situacao}`);
      console.log(`  canal: ${existing.canal || '❌ NULL'}`);
      console.log(`  valor_frete: R$ ${existing.valor_frete || '❌ 0.00'}`);
    } else {
      console.log('\n💾 PEDIDO NÃO EXISTE NO BANCO');
    }
    
    // Mapear
    const row = mapPedidoToOrderRow(pedido);
    console.log('\n🔄 APÓS MAPEAMENTO:');
    console.log(`  situacao: ${row.situacao}`);
    console.log(`  canal: ${row.canal || '❌ NULL'}`);
    console.log(`  valor_frete: R$ ${row.valor_frete || '❌ 0.00'}`);
    
    // Fazer upsert preservando
    const { error } = await upsertOrdersPreservingEnriched([row]);
    
    if (error) {
      console.log(`\n❌ ERRO AO FAZER UPSERT: ${error.message}`);
    } else {
      // Verificar DEPOIS do upsert
      const { data: afterUpsert } = await supabase
        .from('tiny_orders')
        .select('tiny_id, situacao, canal, valor_frete')
        .eq('tiny_id', pedido.id)
        .single();
      
      console.log('\n✅ DADOS NO BANCO (DEPOIS):');
      console.log(`  situacao: ${afterUpsert?.situacao}`);
      console.log(`  canal: ${afterUpsert?.canal || '❌ NULL'}`);
      console.log(`  valor_frete: R$ ${afterUpsert?.valor_frete || '❌ 0.00'}`);
      
      // Verificar se preservou
      if (existing) {
        const preservouCanal = existing.canal && afterUpsert?.canal === existing.canal;
        const preservouFrete = existing.valor_frete > 0 && afterUpsert?.valor_frete === existing.valor_frete;
        
        console.log('\n🔍 VERIFICAÇÃO:');
        console.log(`  Canal preservado? ${preservouCanal ? '✅' : '❌'}`);
        console.log(`  Frete preservado? ${preservouFrete ? '✅' : (existing.valor_frete > 0 ? '❌ PERDEU!' : 'N/A')}`);
      }
    }
    
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════\n');
}

testUpdatedSync().catch(console.error);
