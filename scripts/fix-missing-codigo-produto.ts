#!/usr/bin/env tsx
/**
 * Script para preencher codigo_produto em tiny_pedido_itens
 * buscando do catálogo tiny_produtos
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

async function fixMissingCodigos() {
  console.log('='.repeat(80));
  console.log('CORRIGINDO CÓDIGOS DE PRODUTOS FALTANTES');
  console.log('='.repeat(80));
  console.log();

  // Buscar TODOS os itens sem codigo_produto mas com id_produto_tiny
  console.log('1️⃣  Buscando TODOS os itens sem código...');

  let itens: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id, id_produto_tiny, codigo_produto')
      .is('codigo_produto', null)
      .not('id_produto_tiny', 'is', null)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Erro ao buscar itens:', error);
      break;
    }

    if (!data || data.length === 0) break;
    itens = itens.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
    console.log(`   Buscados ${itens.length} itens...`);
  }

  console.log(`   Encontrados ${itens?.length || 0} itens sem código`);
  console.log();

  if (!itens || itens.length === 0) {
    console.log('✓ Nenhum item precisa de correção');
    return;
  }

  // Buscar códigos do catálogo
  console.log('2️⃣  Buscando códigos no catálogo tiny_produtos...');
  const produtoIds = [...new Set(itens.map((i) => i.id_produto_tiny).filter(Boolean))];

  const { data: produtos, error: produtosError } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny, codigo')
    .in('id_produto_tiny', produtoIds);

  if (produtosError) {
    console.error('Erro ao buscar produtos:', produtosError);
    return;
  }

  const produtosMap = new Map<number, string>();
  produtos?.forEach((p) => {
    if (p.id_produto_tiny && p.codigo) {
      produtosMap.set(p.id_produto_tiny, p.codigo);
    }
  });

  console.log(`   Encontrados ${produtosMap.size} produtos com código`);
  console.log();

  // Atualizar itens
  console.log('3️⃣  Atualizando itens...');
  let updated = 0;
  let notFound = 0;

  for (const item of itens) {
    if (!item.id_produto_tiny) continue;

    const codigo = produtosMap.get(item.id_produto_tiny);

    if (codigo) {
      const { error: updateError } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .update({ codigo_produto: codigo })
        .eq('id', item.id);

      if (updateError) {
        console.error(`   Erro ao atualizar item ${item.id}:`, updateError);
      } else {
        updated++;
        if (updated % 10 === 0) {
          process.stdout.write(`\r   Atualizados: ${updated}/${itens.length}`);
        }
      }
    } else {
      notFound++;
    }
  }

  console.log();
  console.log();
  console.log('='.repeat(80));
  console.log('RESULTADO');
  console.log('='.repeat(80));
  console.log();
  console.log(`✓ ${updated} itens atualizados com código`);
  console.log(`⚠️  ${notFound} itens sem código no catálogo (produto não sincronizado)`);
  console.log();
}

fixMissingCodigos()
  .then(() => {
    console.log('Correção concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
