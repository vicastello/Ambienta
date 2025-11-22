/**
 * Utilitário para salvar itens dos pedidos
 * 
 * Extrai itens de pedidos detalhados e salva na tabela tiny_pedido_itens
 */

import { supabaseAdmin } from './supabaseAdmin';
import { obterPedidoDetalhado } from './tinyApi';

interface PedidoItemData {
  id_pedido: number;
  id_produto_tiny: number | null;
  codigo_produto: string | null;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  info_adicional: string | null;
}

/**
 * Busca detalhes do pedido e salva os itens no banco
 * Retorna número de itens salvos ou null se erro
 */
export async function salvarItensPedido(
  accessToken: string,
  idPedidoTiny: number,
  idPedidoLocal: number
): Promise<number | null> {
  try {
    // Verificar se já tem itens
    const { count: existentes } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('*', { count: 'exact', head: true })
      .eq('id_pedido', idPedidoLocal);

    if (existentes && existentes > 0) {
      return existentes; // Já sincronizado
    }

    // Buscar detalhes do pedido
    const pedidoDetalhado = await obterPedidoDetalhado(accessToken, idPedidoTiny);

    // Extrair itens do formato da API do Tiny
    const itens = pedidoDetalhado.itens || [];

    if (itens.length === 0) {
      return 0; // Pedido sem itens
    }

    // Preparar dados - API retorna produto.id, produto.codigo, etc
    const itensParaSalvar: PedidoItemData[] = itens.map((item) => {
      const produto = (item as any).produto || item;
      return {
        id_pedido: idPedidoLocal,
        id_produto_tiny: produto.id || item.idProduto || null,
        codigo_produto: produto.codigo || item.codigo || null,
        nome_produto: produto.descricao || produto.nome || item.descricao || 'Sem descrição',
        quantidade: Number(item.quantidade || 0),
        valor_unitario: Number(item.valorUnitario || 0),
        valor_total: Number(item.valorTotal || 0),
        info_adicional: item.informacoesAdicionais || null,
      };
    });

    // Inserir no banco (já verificamos que não existe)
    const { error } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .insert(itensParaSalvar);

    if (error) {
      console.error(`[Itens Pedido] Erro ao salvar itens do pedido ${idPedidoTiny}:`, error);
      return null;
    }

    return itens.length;
  } catch (error: any) {
    console.error(`[Itens Pedido] Erro ao processar pedido ${idPedidoTiny}:`, error.message);
    return null;
  }
}

/**
 * Sincroniza itens de múltiplos pedidos em lote
 * Respeita rate limit de 100 req/min (600ms entre chamadas)
 */
export async function salvarItensLote(
  accessToken: string,
  pedidos: Array<{ idTiny: number; idLocal: number }>,
  // delay between requests in milliseconds. Default 600ms (~100 req/min)
  delayMs: number = 600
): Promise<{ sucesso: number; falhas: number; totalItens: number }> {
  let sucesso = 0;
  let falhas = 0;
  let totalItens = 0;

  for (const pedido of pedidos) {
    const numItens = await salvarItensPedido(
      accessToken,
      pedido.idTiny,
      pedido.idLocal
    );

    if (numItens !== null) {
      sucesso++;
      totalItens += numItens;
    } else {
      falhas++;
    }

    // Respect provided rate limit delay
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return { sucesso, falhas, totalItens };
}

/**
 * Sincroniza itens especificamente para uma lista de pedidos (identificados por tiny_id)
 * Usado para garantir que pedidos recém-sincronizados recebam os itens imediatamente
 */
export async function sincronizarItensPorPedidos(
  accessToken: string,
  tinyIds: Array<number | null | undefined>,
  options?: { delayMs?: number }
): Promise<{ processados: number; sucesso: number; totalItens: number }> {
  const uniqueTinyIds = Array.from(new Set(tinyIds.filter((id): id is number => Boolean(id))));

  if (!uniqueTinyIds.length) {
    return { processados: 0, sucesso: 0, totalItens: 0 };
  }

  // Buscar os pedidos locais correspondentes
  const { data: pedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id')
    .in('tiny_id', uniqueTinyIds);

  if (!pedidos || pedidos.length === 0) {
    return { processados: 0, sucesso: 0, totalItens: 0 };
  }

  const pedidoIds = pedidos.map((p) => p.id);

  // Verificar quais já possuem itens
  const { data: pedidosComItens } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', pedidoIds);

  const idsComItens = new Set(pedidosComItens?.map((p) => p.id_pedido) || []);
  const pedidosSemItens = pedidos.filter((p) => !idsComItens.has(p.id));

  if (!pedidosSemItens.length) {
    return { processados: pedidos.length, sucesso: 0, totalItens: 0 };
  }

  const resultado = await salvarItensLote(
    accessToken,
    pedidosSemItens.map((p) => ({ idTiny: p.tiny_id!, idLocal: p.id })),
    options?.delayMs
  );

  return {
    processados: pedidos.length,
    sucesso: resultado.sucesso,
    totalItens: resultado.totalItens,
  };
}

/**
 * Sincroniza automaticamente itens de pedidos que ainda não foram processados
 * Útil para rodar após sincronização de pedidos
 */
export async function sincronizarItensAutomaticamente(
  accessToken: string,
  options?: {
    limit?: number;
    maxRequests?: number;
    dataMinima?: Date;
  }
): Promise<{ processados: number; sucesso: number; totalItens: number }> {
  const { limit = 50, maxRequests = 100, dataMinima } = options ?? {};

  // Buscar pedidos sem itens sincronizados
  let query = supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id, data_criacao')
    .order('data_criacao', { ascending: false })
    .limit(Math.min(limit, maxRequests));

  // Filtrar por data mínima se especificado
  if (dataMinima) {
    query = query.gte('data_criacao', dataMinima.toISOString());
  }

  const { data: pedidos } = await query;

  if (!pedidos || pedidos.length === 0) {
    return { processados: 0, sucesso: 0, totalItens: 0 };
  }

  // Filtrar pedidos que já têm itens
  const { data: pedidosComItens } = await supabaseAdmin
    .from('tiny_pedido_itens')
    .select('id_pedido')
    .in('id_pedido', pedidos.map(p => p.id));

  const idsComItens = new Set(pedidosComItens?.map(p => p.id_pedido) || []);
  const pedidosSemItens = pedidos.filter(p => !idsComItens.has(p.id));

  if (pedidosSemItens.length === 0) {
    return { processados: 0, sucesso: 0, totalItens: 0 };
  }

  console.log(`[Itens Auto] Sincronizando ${pedidosSemItens.length} pedidos sem itens...`);

  // Processar em lote
  const resultado = await salvarItensLote(
    accessToken,
    pedidosSemItens.slice(0, maxRequests).map(p => ({
      idTiny: p.tiny_id,
      idLocal: p.id,
    }))
  );

  return {
    processados: pedidosSemItens.length,
    sucesso: resultado.sucesso,
    totalItens: resultado.totalItens,
  };
}
