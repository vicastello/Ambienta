#!/usr/bin/env tsx
/**
 * Script para sincronizar itens dos pedidos do Tiny desde 01/11/2024
 * diretamente do raw_payload já armazenado, sem chamar a API
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

const toNumberOrNull = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

async function syncItemsFromRaw() {
  console.log('='.repeat(80));
  console.log('SINCRONIZAÇÃO DE ITENS DO TINY A PARTIR DO RAW_PAYLOAD');
  console.log('='.repeat(80));
  console.log();

  const startDate = '2024-11-01';

  // 1. Buscar todos os pedidos desde 01/11
  console.log(`1️⃣  Buscando pedidos sem itens desde ${startDate}...`);

  // Fetch orders without items
  const { data: allOrders, error: ordersError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, numero_pedido, data_criacao, raw_payload')
    .gte('data_criacao', startDate)
    .order('data_criacao', { ascending: true });

  if (ordersError) {
    console.error('   Erro ao buscar pedidos:', ordersError);
    process.exit(1);
  }

  if (!allOrders || allOrders.length === 0) {
    console.log('   Nenhum pedido encontrado');
    return;
  }

  console.log(`   Encontrados ${allOrders.length} pedidos totais`);

  // Filter out orders that already have items
  const orderIds = allOrders.map(o => o.id);
  const { data: existingItems } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', orderIds);

  const ordersWithItems = new Set(existingItems?.map(i => i.id_pedido) || []);
  const ordersWithoutItems = allOrders.filter(o => !ordersWithItems.has(o.id));

  console.log(`   ${ordersWithItems.size} pedidos já têm itens`);
  console.log(`   ${ordersWithoutItems.length} pedidos sem itens`);
  console.log();

  if (ordersWithoutItems.length === 0) {
    console.log('✓ Todos os pedidos já têm itens!');
    return;
  }

  // 2. Extract items from raw_payload and save
  console.log(`2️⃣  Extraindo itens do raw_payload...`);
  console.log();

  let processados = 0;
  let sucesso = 0;
  let falhas = 0;
  let totalItens = 0;
  const pedidosSemPayload: number[] = [];

  // First, ensure we have product codes in catalog
  console.log('   📚 Verificando catálogo de produtos...');
  const { data: produtos } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny, codigo');

  const produtosMap = new Map<number, string>();
  produtos?.forEach((p: any) => {
    if (p.id_produto_tiny && p.codigo) {
      produtosMap.set(p.id_produto_tiny, p.codigo);
    }
  });
  console.log(`   Encontrados ${produtosMap.size} produtos no catálogo`);
  console.log();

  for (const order of ordersWithoutItems) {
    processados++;

    const raw = order.raw_payload as any;
    if (!raw || typeof raw !== 'object') {
      pedidosSemPayload.push(order.id);
      falhas++;
      continue;
    }

    // Extract items from different possible structures
    const itensRaw =
      (Array.isArray((raw as any).itens)
        ? (raw as any).itens
        : Array.isArray((raw as any).pedido?.itens)
          ? (raw as any).pedido.itens
          : Array.isArray((raw as any).pedido?.itensPedido)
            ? (raw as any).pedido.itensPedido
            : []) as any[];

    if (!itensRaw.length) {
      pedidosSemPayload.push(order.id);
      falhas++;
      continue;
    }

    const itensParaSalvar = itensRaw.map((item) => {
      const produto = (item as any).produto || item;
      const qtd = toNumberOrNull(item.quantidade) ?? 0;
      const valorUnit = toNumberOrNull(item.valorUnitario) ?? 0;
      const valorTot = toNumberOrNull(item.valorTotal) ?? valorUnit * qtd;
      const produtoId = toNumberOrNull(produto.id ?? item.idProduto);

      // Get codigo from API or from catalog
      const codigoFromApi = produto.codigo ?? item.codigo ?? null;
      const codigoFromCatalogo = produtoId ? produtosMap.get(produtoId) : null;

      return {
        id_pedido: order.id,
        id_produto_tiny: produtoId,
        codigo_produto: codigoFromApi || codigoFromCatalogo || null,
        nome_produto: produto.descricao ?? produto.nome ?? item.descricao ?? 'Sem descrição',
        quantidade: qtd ?? 0,
        valor_unitario: valorUnit ?? 0,
        valor_total: valorTot ?? 0,
        info_adicional: item.informacoesAdicionais || null,
        unidade: produto.unidade || item.unidade || null,
        ncm: produto.ncm || null,
        gtin: produto.gtin || null,
        preco: produto.preco || null,
        preco_promocional: produto.precoPromocional || null,
        raw_payload: produto,
      };
    });

    try {
      const { error: insertErr } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .upsert(itensParaSalvar, {
          onConflict: 'id_pedido,id_produto_tiny,codigo_produto',
          ignoreDuplicates: false
        });

      if (insertErr) {
        console.error(`   Erro ao salvar itens do pedido ${order.numero_pedido}:`, insertErr.message);
        falhas++;
      } else {
        sucesso++;
        totalItens += itensParaSalvar.length;

        if (sucesso % 50 === 0) {
          console.log(`   Progresso: ${sucesso}/${ordersWithoutItems.length} pedidos processados (${totalItens} itens)`);
        }
      }
    } catch (err: any) {
      console.error(`   Erro ao salvar pedido ${order.numero_pedido}:`, err.message);
      falhas++;
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('RESULTADO FINAL');
  console.log('='.repeat(80));
  console.log();
  console.log(`✓ Pedidos processados: ${processados}`);
  console.log(`✓ Sincronizações bem-sucedidas: ${sucesso}`);
  console.log(`✗ Falhas: ${falhas}`);
  console.log(`📦 Total de itens sincronizados: ${totalItens}`);
  console.log();

  if (pedidosSemPayload.length > 0) {
    console.log(`⚠️  ${pedidosSemPayload.length} pedidos sem raw_payload ou sem itens no payload`);
    console.log('   Esses pedidos precisariam de sincronização via API do Tiny.');
  }
}

syncItemsFromRaw()
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
