// @ts-nocheck
/**
 * Utilitário para salvar itens dos pedidos
 * 
 * Extrai itens de pedidos detalhados e salva na tabela tiny_pedido_itens
 */

import { supabaseAdmin } from './supabaseAdmin';
import { obterPedidoDetalhado } from './tinyApi';
import { getErrorMessage } from './errors';

const toNumberOrNull = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

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
  const fallbackFromRaw = async (): Promise<number | null> => {
    try {
      const { data: pedidoLocal, error: rawErr } = await supabaseAdmin
        .from('tiny_orders')
        .select('raw')
        .eq('id', idPedidoLocal)
        .maybeSingle();
      if (rawErr) {
        console.error(`[Itens Pedido] Falha ao buscar raw do pedido ${idPedidoTiny}`, rawErr);
        return null;
      }
      const raw = pedidoLocal?.raw as any;
      if (!raw || typeof raw !== 'object') return null;

      const itensRaw =
        (Array.isArray((raw as any).itens)
          ? (raw as any).itens
          : Array.isArray((raw as any).pedido?.itens)
            ? (raw as any).pedido.itens
            : Array.isArray((raw as any).pedido?.itensPedido)
              ? (raw as any).pedido.itensPedido
              : []) as any[];

      if (!itensRaw.length) return null;

      const itensParaSalvar = itensRaw.map((item) => {
        const produto = (item as any).produto || item;
        const qtd = toNumberOrNull(item.quantidade) ?? 0;
        const valorUnit = toNumberOrNull(item.valorUnitario) ?? 0;
        const valorTot = toNumberOrNull(item.valorTotal) ?? valorUnit * qtd;
        return {
          id_pedido: idPedidoLocal,
          id_produto_tiny: toNumberOrNull(produto.id ?? item.idProduto),
          codigo_produto: produto.codigo ?? item.codigo ?? null,
          nome_produto: produto.descricao ?? produto.nome ?? item.descricao ?? 'Sem descrição',
          quantidade: qtd ?? 0,
          valor_unitario: valorUnit ?? 0,
          valor_total: valorTot ?? 0,
          info_adicional: item.informacoesAdicionais || null,
        };
      });

      const { error: insertErr } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .insert(itensParaSalvar);
      if (insertErr) {
        console.error(`[Itens Pedido] Erro ao salvar itens (fallback raw) do pedido ${idPedidoTiny}:`, insertErr);
        return null;
      }

      console.warn(`[Itens Pedido] Usou fallback do raw para salvar itens do pedido ${idPedidoTiny}`);
      return itensParaSalvar.length;
    } catch (err) {
      console.error(`[Itens Pedido] Erro no fallback raw do pedido ${idPedidoTiny}:`, getErrorMessage(err));
      return null;
    }
  };

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

    // Extrair itens do formato da API do Tiny (v3 pode devolver em níveis diferentes)
    const itens =
      (Array.isArray((pedidoDetalhado as any).itens)
        ? (pedidoDetalhado as any).itens
        : Array.isArray((pedidoDetalhado as any).pedido?.itens)
          ? (pedidoDetalhado as any).pedido.itens
          : Array.isArray((pedidoDetalhado as any).pedido?.itensPedido)
            ? (pedidoDetalhado as any).pedido.itensPedido
            : []) as any[];

    if (itens.length === 0) {
      console.warn(`[Itens Pedido] Pedido ${idPedidoTiny} sem itens retornados pelo Tiny`);
      const fallbackCount = await fallbackFromRaw();
      return fallbackCount;
    }

    // Preparar dados - API retorna produto.id, produto.codigo, etc
    const itensParaSalvar: any[] = itens.map((item) => {
      const produto = (item as any).produto || item;
      const qtd = toNumberOrNull(item.quantidade) ?? 0;
      const valorUnit = toNumberOrNull(item.valorUnitario) ?? 0;
      const valorTot = toNumberOrNull(item.valorTotal) ?? valorUnit * qtd;
      return {
        id_pedido: idPedidoLocal,
        id_produto_tiny: toNumberOrNull(produto.id ?? item.idProduto),
        codigo_produto: produto.codigo || item.codigo || null,
        nome_produto: produto.descricao || produto.nome || item.descricao || 'Sem descrição',
        quantidade: qtd,
        valor_unitario: valorUnit,
        valor_total: valorTot,
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
    console.error(`[Itens Pedido] Erro ao processar pedido ${idPedidoTiny}:`, error.message || error);
    const fallbackCount = await fallbackFromRaw();
    return fallbackCount;
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
  options?: { delayMs?: number; retries?: number; force?: boolean }
): Promise<{ processados: number; sucesso: number; falhas: number; totalItens: number }> {
  const uniqueTinyIds = Array.from(new Set(tinyIds.filter((id): id is number => Boolean(id))));

  if (!uniqueTinyIds.length) {
    return { processados: 0, sucesso: 0, falhas: 0, totalItens: 0 };
  }

  // Buscar os pedidos locais correspondentes
  const { data: pedidos } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, tiny_id')
    .in('tiny_id', uniqueTinyIds);

  if (!pedidos || pedidos.length === 0) {
    return { processados: 0, sucesso: 0, falhas: 0, totalItens: 0 };
  }

  const pedidoIds = pedidos.map((p) => p.id);

  async function buscarPedidosSemItens(ids: number[]) {
    const { data: pedidosComItens } = await supabaseAdmin
      .from('tiny_pedido_itens')
      .select('id_pedido')
      .in('id_pedido', ids);
    const idsComItens = new Set(pedidosComItens?.map((p) => p.id_pedido) || []);
    return ids.filter((id) => !idsComItens.has(id));
  }

  const pedidosSemItensIds = await buscarPedidosSemItens(pedidoIds);
  const pedidosSemItens = options?.force
    ? pedidos
    : pedidos.filter((p) => pedidosSemItensIds.includes(p.id));

  if (!pedidosSemItens.length) {
    return { processados: pedidos.length, sucesso: 0, falhas: 0, totalItens: 0 };
  }

  if (options?.force) {
    // Remove itens existentes para reprocessar e evitar duplicidade
    await supabaseAdmin.from('tiny_pedido_itens').delete().in('id_pedido', pedidosSemItens.map((p) => p.id));
  }

  const delayMs = options?.delayMs ?? 1000;
  const retries = Math.max(0, options?.retries ?? 1);

  let resultado = await salvarItensLote(
    accessToken,
    pedidosSemItens.map((p) => ({ idTiny: p.tiny_id!, idLocal: p.id })),
    delayMs
  );

  let restantes = await buscarPedidosSemItens(pedidosSemItens.map((p) => p.id));

  for (let tentativa = 0; tentativa < retries && restantes.length > 0; tentativa++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    resultado = await salvarItensLote(
      accessToken,
      pedidosSemItens
        .filter((p) => restantes.includes(p.id))
        .map((p) => ({ idTiny: p.tiny_id!, idLocal: p.id })),
      delayMs
    );
    restantes = await buscarPedidosSemItens(pedidosSemItens.map((p) => p.id));
  }

  const falhas = pedidosSemItens.length - resultado.sucesso;
  return {
    processados: pedidos.length,
    sucesso: resultado.sucesso,
    falhas,
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
// @ts-nocheck
