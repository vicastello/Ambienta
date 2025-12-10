
import type { TinyPedidoListaItem } from '@/lib/tinyApi';

/**
 * Upsert dos itens de um pedido Tiny (TinyPedidoListaItem) na tabela tiny_pedido_itens.
 * Espera que o pedido já tenha sido upsertado em tiny_orders.
 */
export async function upsertPedidoItens(pedido: TinyPedidoListaItem) {
  const tinyId = pedido.id;
  if (!tinyId) return;
  // Busca o pedido local para obter o id
  const { data: order } = await (supabaseAdmin as any)
    .from('tiny_orders')
    .select('id')
    .eq('tiny_id', tinyId)
    .maybeSingle();
  if (!order?.id) return;
  // Extrai itens do pedido (pode variar conforme payload)
  const itens = ((pedido as any).itens || (pedido as any).pedido?.itens || (pedido as any).pedido?.itensPedido || []) as any[];
  if (!Array.isArray(itens) || !itens.length) return;
  // Buscar códigos dos produtos do catálogo
  const produtoIds = itens
    .map((item) => (item.produto || item).id || item.idProduto)
    .filter(Boolean);

  const produtosMap = new Map<number, string>();
  if (produtoIds.length > 0) {
    const { data: produtos } = await (supabaseAdmin as any)
      .from('tiny_produtos')
      .select('id_produto_tiny, codigo')
      .in('id_produto_tiny', produtoIds);

    if (produtos) {
      produtos.forEach((p: any) => {
        if (p.id_produto_tiny && p.codigo) {
          produtosMap.set(p.id_produto_tiny, p.codigo);
        }
      });
    }
  }

  // Monta rows para upsert
  const rows = itens.map((item) => {
    const produto = item.produto || item;
    const produtoId = produto.id || item.idProduto || null;
    const codigoFromApi = produto.codigo || item.codigo || null;
    const codigoFromCatalogo = produtoId ? produtosMap.get(produtoId) : null;

    return {
      id_pedido: order.id,
      id_produto_tiny: produtoId,
      codigo_produto: codigoFromApi || codigoFromCatalogo || null,
      nome_produto: produto.descricao || produto.nome || item.descricao || 'Sem descrição',
      quantidade: Number(item.quantidade || 0),
      valor_unitario: Number(item.valorUnitario || 0),
      valor_total: Number(item.valorTotal || 0),
      info_adicional: item.informacoesAdicionais || null,
      unidade: produto.unidade || item.unidade || null,
      ncm: produto.ncm || null,
      gtin: produto.gtin || null,
      preco: produto.preco || null,
      preco_promocional: produto.precoPromocional || null,
      raw_payload: produto,
    };
  });
  // Upsert em lote (onConflict: id_pedido, id_produto_tiny, codigo_produto)
  if (rows.length) {
    const { error } = await (supabaseAdmin as any)
      .from('tiny_pedido_itens')
      .upsert(rows, { onConflict: ['id_pedido', 'id_produto_tiny', 'codigo_produto'] });
    if (error) throw error;
  }
}
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type ConsumoRow = {
  id_produto_tiny: number | null;
  quantidade: number | null;
  tiny_orders: { data_criacao: string; situacao: number | null };
};

export async function listConsumoPeriodo(startDate: string) {
  const pageSize = 1000;
  let from = 0;
  const allRows: ConsumoRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_produto_tiny, quantidade, tiny_orders!inner(data_criacao,situacao)')
      .gte('tiny_orders.data_criacao', startDate)
      .neq('tiny_orders.situacao', 2)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...((data as unknown) as ConsumoRow[]));

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}
