#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '../lib/tinyAuth';
import { obterPedidoDetalhado } from '../lib/tinyApi';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function forceResyncAll() {
  console.log('🔄 SINCRONIZAÇÃO FORÇADA TOTAL - Ignorando verificações\n');

  const accessToken = await getAccessTokenFromDbOrRefresh();

  // Buscar TODOS os pedidos sem itens
  const { data: orders } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id')
    .gte('data_criacao', '2024-11-01');

  if (!orders) return;

  const { data: items } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orders.map(o => o.id));

  const withItems = new Set(items?.map(i => i.id_pedido) || []);
  const missing = orders.filter(o => !withItems.has(o.id) && o.tiny_id);

  console.log(`📊 Encontrados ${missing.length} pedidos para sincronizar\n`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalItems = 0;
  let totalApiWithoutItems = 0;

  const BATCH_SIZE = 30;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(missing.length / BATCH_SIZE);

    console.log(`\n📦 Lote ${batchNum}/${totalBatches} (${batch.length} pedidos)...`);

    for (const order of batch) {
      try {
        // Buscar detalhes do pedido
        const resultado = await obterPedidoDetalhado(accessToken, order.tiny_id!, 'force_all_sync');
        
        const itens = (resultado as any)?.itens || [];
        
        if (!Array.isArray(itens) || itens.length === 0) {
          console.log(`   ⚠️  ${order.tiny_id}: API sem itens`);
          totalApiWithoutItems++;
          await delay(800);
          continue;
        }

        // Preparar itens para inserção
        const itensParaSalvar = itens.map((item: any) => {
          const produto = item.produto || item;
          const qtd = Number(item.quantidade) || 0;
          const valorUnit = Number(item.valorUnitario) || 0;
          const valorTot = Number(item.valorTotal) || (valorUnit * qtd);
          
          return {
            id_pedido: order.id,
            id_produto_tiny: Number(produto.id || item.idProduto) || null,
            codigo_produto: produto.codigo || item.codigo || null,
            nome_produto: produto.descricao || produto.nome || item.descricao || 'Sem descrição',
            quantidade: qtd,
            valor_unitario: valorUnit,
            valor_total: valorTot,
            info_adicional: item.informacoesAdicionais || null,
          };
        });

        // Inserir diretamente (sem verificar se já existe)
        const { error } = await supabaseAdmin
          .from('tiny_pedido_itens')
          .insert(itensParaSalvar);

        if (error) {
          console.log(`   ❌ ${order.tiny_id}: Erro ao inserir - ${error.message}`);
          totalFailed++;
        } else {
          totalSuccess++;
          totalItems += itens.length;
        }

        await delay(800);

      } catch (error: any) {
        if (error.message?.includes('429')) {
          console.log(`   ⏳ ${order.tiny_id}: Rate limit (429)`);
          await delay(5000);
        } else {
          console.log(`   ❌ ${order.tiny_id}: ${error.message || error}`);
        }
        totalFailed++;
      }
    }

    console.log(`   Lote completo: ${totalSuccess} ok, ${totalFailed} falhas`);

    // Delay maior entre lotes
    if (i + BATCH_SIZE < missing.length) {
      console.log(`   ⏸️  Aguardando 60s...`);
      await delay(60000);
    }
  }

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`RESULTADO FINAL`);
  console.log(`═════════════════════════════════════════════════`);
  console.log(`✅ Sucessos: ${totalSuccess}`);
  console.log(`❌ Falhas: ${totalFailed}`);
  console.log(`📦 Itens inseridos: ${totalItems}`);
  console.log(`⚠️  Sem itens na API: ${totalApiWithoutItems}`);
  console.log(`═════════════════════════════════════════════════\n`);

  // Verificação final
  const { data: finalItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orders.map(o => o.id));

  const finalWithItems = new Set(finalItems?.map(i => i.id_pedido) || []);
  
  console.log(`📊 VERIFICAÇÃO FINAL:`);
  console.log(`   Total: ${orders.length}`);
  console.log(`   Com itens: ${finalWithItems.size} (${((finalWithItems.size/orders.length)*100).toFixed(1)}%)`);
  console.log(`   Sem itens: ${orders.length - finalWithItems.size}\n`);
}

forceResyncAll().catch(console.error);
