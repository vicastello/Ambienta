#!/usr/bin/env tsx
import process from 'node:process';
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  const numeroArg = process.argv[2];
  if (!numeroArg) {
    console.error('Uso: npx tsx scripts/inspectOrder.ts <numero_pedido>');
    process.exit(1);
  }

  const numeroPedido = Number(numeroArg);
  if (!Number.isFinite(numeroPedido)) {
    console.error(`Número de pedido inválido: ${numeroArg}`);
    process.exit(1);
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('tiny_orders')
    .select('*')
    .eq('numero_pedido', numeroPedido)
    .maybeSingle();

  if (orderError) {
    console.error('Erro ao buscar pedido:', orderError.message);
    process.exit(1);
  }

  if (!order) {
    console.error(`Pedido ${numeroPedido} não encontrado no banco.`);
    process.exit(1);
  }

  console.log('Pedido:');
  console.log({
    id: order.id,
    tiny_id: order.tiny_id,
    numero_pedido: order.numero_pedido,
    data_criacao: order.data_criacao,
    situacao: order.situacao,
    canal: order.canal,
    valor: order.valor,
    valor_frete: order.valor_frete,
  });

  const rawPayload = order.raw_payload as Record<string, unknown> | null;
  if (rawPayload) {
    const itensRaw = extractRawItems(rawPayload);
    console.log(`Itens brutos Tiny (${itensRaw.length}):`);
    for (const item of itensRaw) {
      const produto = (item?.produto ?? {}) as Record<string, unknown>;
      console.log({
        nome: produto?.descricao ?? produto?.nome ?? item?.descricao ?? null,
        codigo: produto?.codigo ?? produto?.sku ?? null,
        sku: produto?.sku ?? null,
        quantidade: item?.quantidade ?? null,
        variacao: produto?.variacao ?? null,
      });
    }
  }

  const { data: itens, error: itensError } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('*')
    .eq('id_pedido', order.id)
    .order('id');

  if (itensError) {
    console.error('Erro ao carregar itens:', itensError.message);
    process.exit(1);
  }

  console.log(`Itens (${itens?.length ?? 0}):`);
  for (const item of itens ?? []) {
    console.log({
      id: item.id,
      codigo_produto: item.codigo_produto,
      nome_produto: item.nome_produto,
      quantidade: item.quantidade,
      id_produto_tiny: item.id_produto_tiny,
      valor_total: item.valor_total,
      info_adicional: item.info_adicional,
    });
  }

  const produtoIds = Array.from(
    new Set((itens ?? []).map((item) => item.id_produto_tiny).filter((id): id is number => typeof id === 'number'))
  );

  if (produtoIds.length) {
    const { data: produtos, error: produtosError } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny,codigo,nome,tipo,raw_payload')
      .in('id_produto_tiny', produtoIds);

    if (produtosError) {
      console.error('Erro ao buscar produtos relacionados:', produtosError.message);
      process.exit(1);
    }

    console.log('Produtos relacionados:');
    for (const produto of produtos ?? []) {
      console.log({
        id_produto_tiny: produto.id_produto_tiny,
        codigo: produto.codigo,
        nome: produto.nome,
        tipo: produto.tipo,
        raw_payload: produto.raw_payload,
      });
    }
  }
}

main();

function extractRawItems(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates: Array<unknown> = [];
  const pushIfArray = (value: unknown) => {
    if (Array.isArray(value)) candidates.push(value);
  };

  pushIfArray(raw.itens);
  if (raw.pedido && typeof raw.pedido === 'object') {
    const pedido = raw.pedido as Record<string, unknown>;
    pushIfArray(pedido.itens);
    pushIfArray(pedido.itensPedido);
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
  }
  return [];
}
