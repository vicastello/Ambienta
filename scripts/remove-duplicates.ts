#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function removeDuplicates() {
  console.log('🧹 Removendo itens duplicados...\n');

  // Buscar todos os itens
  const { data: allItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id, id_pedido, codigo_produto, nome_produto, quantidade')
    .order('id_pedido')
    .order('id');

  if (!allItems) {
    console.log('❌ Erro ao buscar itens');
    return;
  }

  console.log(`📊 Total de itens: ${allItems.length}\n`);

  // Agrupar por pedido
  const porPedido = new Map<number, typeof allItems>();
  allItems.forEach(item => {
    if (!porPedido.has(item.id_pedido)) {
      porPedido.set(item.id_pedido, []);
    }
    porPedido.get(item.id_pedido)!.push(item);
  });

  console.log(`📦 Pedidos com itens: ${porPedido.size}\n`);

  // Encontrar duplicatas
  const duplicateIds: number[] = [];
  let totalDuplicates = 0;

  for (const [pedidoId, itens] of porPedido) {
    if (itens.length <= 1) continue;

    // Verificar duplicatas exatas
    const seen = new Map<string, number>();
    
    for (const item of itens) {
      const key = `${item.codigo_produto || 'null'}-${item.nome_produto}-${item.quantidade}`;
      
      if (seen.has(key)) {
        // É duplicata - marcar para remoção
        duplicateIds.push(item.id);
        totalDuplicates++;
      } else {
        seen.set(key, item.id);
      }
    }
  }

  console.log(`🔍 Encontradas ${totalDuplicates} duplicatas em ${duplicateIds.length} registros\n`);

  if (duplicateIds.length === 0) {
    console.log('✅ Nenhuma duplicata encontrada!');
    return;
  }

  // Remover em lotes de 1000
  const BATCH_SIZE = 1000;
  let removed = 0;

  for (let i = 0; i < duplicateIds.length; i += BATCH_SIZE) {
    const batch = duplicateIds.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`❌ Erro ao remover lote: ${error.message}`);
    } else {
      removed += batch.length;
      console.log(`   Removidos: ${removed}/${duplicateIds.length}`);
    }
  }

  console.log(`\n✅ Limpeza concluída! ${removed} duplicatas removidas\n`);
}

removeDuplicates().catch(console.error);
