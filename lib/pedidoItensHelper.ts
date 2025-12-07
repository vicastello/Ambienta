// @ts-nocheck
/**
 * Utilitário para salvar itens dos pedidos
 * 
 * Extrai itens de pedidos detalhados e salva na tabela tiny_pedido_itens
 */

import { supabaseAdmin } from './supabaseAdmin';
import { obterPedidoDetalhado, obterProduto, obterEstoqueProduto, TinyApiError } from './tinyApi';
import { getErrorMessage } from './errors';
import { upsertProduto, upsertProdutosEstoque } from '@/src/repositories/tinyProdutosRepository';
import { buildProdutoUpsertPayload } from './productMapper';

const toNumberOrNull = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAndUpsertProduto(accessToken: string, id: number) {
  try {
    const detalhe: any = await obterProduto(accessToken, id, { context: 'pedido_itens_helper' });
    let estoque: any = null;
    try {
      estoque = await obterEstoqueProduto(accessToken, id, { context: 'pedido_itens_helper' });
    } catch (err) {
      console.warn('[Itens Pedido] Estoque falhou para produto', id, err);
    }

    const produtoData = buildProdutoUpsertPayload({ detalhe: detalhe as any, estoque: estoque as any });

    await upsertProduto(produtoData);
  } catch (err) {
    console.error('[Itens Pedido] Falha ao upsert produto faltante', id, err);
  }
}

async function ensureProdutosNoCatalog(accessToken: string, ids: number[]): Promise<Set<number>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is number => Number.isFinite(id))));
  const ensured = new Set<number>();
  if (!uniqueIds.length) return ensured;

  const { data: existentes } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny')
    .in('id_produto_tiny', uniqueIds);
  const setExistentes = new Set((existentes ?? []).map((r: any) => r.id_produto_tiny));
  setExistentes.forEach((id) => ensured.add(id));
  const faltantes = uniqueIds.filter((id) => !setExistentes.has(id));

  for (const id of faltantes) {
    await fetchAndUpsertProduto(accessToken, id);
    const { data: inserted } = await supabaseAdmin
      .from('tiny_produtos')
      .select('id_produto_tiny')
      .eq('id_produto_tiny', id)
      .maybeSingle();
    if (inserted?.id_produto_tiny) {
      ensured.add(id);
    } else {
      console.warn('[Itens Pedido] Produto ainda não disponível após tentativa de cadastro', id);
    }
    await delay(400); // respeitar limite Tiny entre detalhes de produtos
  }

  return ensured;
}

async function atualizarEstoqueProdutos(accessToken: string, ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is number => Number.isFinite(id))));
  if (!uniqueIds.length) return;

  const ensured = await ensureProdutosNoCatalog(accessToken, uniqueIds);
  const idsParaAtualizar = uniqueIds.filter((id) => ensured.has(id));

  if (!idsParaAtualizar.length) {
    console.warn('[Itens Pedido] Nenhum produto disponível para atualizar estoque após ensure; ids originais:', uniqueIds.join(', '));
    return;
  }

  for (let index = 0; index < idsParaAtualizar.length; index++) {
    const id = idsParaAtualizar[index];
    let atualizado = false;
    let tentativa = 0;
    while (!atualizado) {
      try {
        const estoque: any = await obterEstoqueProduto(accessToken, id, { context: 'pedido_itens_helper' });
        await upsertProdutosEstoque([
          {
            id_produto_tiny: id,
            saldo: estoque?.saldo ?? null,
            reservado: estoque?.reservado ?? null,
            disponivel: estoque?.disponivel ?? null,
            data_atualizacao_tiny: new Date().toISOString(),
          },
        ]);
        atualizado = true;
      } catch (err) {
        const status = err instanceof TinyApiError ? err.status : (typeof err === 'object' && err && 'status' in err ? Number((err as any).status) : undefined);
        if (status === 429) {
          tentativa += 1;
          const backoff = Math.min(4000 + tentativa * 500, 15000);
          console.warn(`[Itens Pedido] 429 ao atualizar estoque do produto ${id}. Tentativa ${tentativa}, aguardando ${backoff}ms`);
          await delay(backoff);
          continue;
        }
        console.error(`[Itens Pedido] Falha ao atualizar estoque do produto ${id}:`, getErrorMessage(err));
        atualizado = true; // evita loop infinito em erros não tratados
      }
    }
    if (index < idsParaAtualizar.length - 1) {
      // respeita limite de requisições do Tiny
      await delay(600);
    }
  }
}

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
  idPedidoLocal: number,
  options?: { context?: string }
): Promise<number | null> {
  const fallbackFromRaw = async (): Promise<number | null> => {
    try {
      const { data: pedidoLocal, error: rawErr } = await supabaseAdmin
        .from('tiny_orders')
        .select('raw, raw_payload')
        .eq('id', idPedidoLocal)
        .maybeSingle();
      if (rawErr) {
        console.error(`[Itens Pedido] Falha ao buscar raw do pedido ${idPedidoTiny}`, rawErr);
        return null;
      }
      const raw = (pedidoLocal?.raw ?? pedidoLocal?.raw_payload) as any;
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

      // Zera id_produto_tiny se produto não existe no catálogo para evitar violar FK
      const idsTiny = itensParaSalvar
        .map((p) => (typeof p.id_produto_tiny === 'number' ? p.id_produto_tiny : null))
        .filter((v): v is number => !!v);
      if (idsTiny.length) {
        await ensureProdutosNoCatalog(accessToken, idsTiny);
        await atualizarEstoqueProdutos(accessToken, idsTiny);
      }

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
    const context = options?.context ?? 'pedido_helper';
    const pedidoDetalhado = await obterPedidoDetalhado(accessToken, idPedidoTiny, context);

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
      console.warn(`[Itens Pedido] Pedido ${idPedidoTiny} sem itens retornados pelo Tiny`, {
        keys: Object.keys(pedidoDetalhado || {}),
      });
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

    // Zera id_produto_tiny se produto não existe no catálogo para evitar violar FK
    const idsTiny = itensParaSalvar
      .map((p) => (typeof p.id_produto_tiny === 'number' ? p.id_produto_tiny : null))
      .filter((v): v is number => !!v);
    if (idsTiny.length) {
      await ensureProdutosNoCatalog(accessToken, idsTiny);
      await atualizarEstoqueProdutos(accessToken, idsTiny);
      const { data: existentes } = await supabaseAdmin
        .from('tiny_produtos')
        .select('id_produto_tiny')
        .in('id_produto_tiny', idsTiny);
      const setExistentes = new Set((existentes ?? []).map((r: any) => r.id_produto_tiny));
      for (const row of itensParaSalvar) {
        if (row.id_produto_tiny && !setExistentes.has(row.id_produto_tiny)) {
          row.id_produto_tiny = null;
        }
      }
    }

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
    console.error(
      `[Itens Pedido] Erro ao processar pedido ${idPedidoTiny}:`,
      error?.message || error
    );
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
  options?: { delayMs?: number; context?: string }
): Promise<{ sucesso: number; falhas: number; totalItens: number }> {
  let sucesso = 0;
  let falhas = 0;
  let totalItens = 0;
  const delayMs = options?.delayMs ?? 600;

  for (const pedido of pedidos) {
    const numItens = await salvarItensPedido(
      accessToken,
      pedido.idTiny,
      pedido.idLocal,
      { context: options?.context }
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
  options?: { delayMs?: number; retries?: number; force?: boolean; context?: string }
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
  const rawRetries = options?.retries;
  const retries = rawRetries === undefined ? 1 : rawRetries;
  const unlimitedRetries = !Number.isFinite(retries);

  let totalSucesso = 0;
  let totalItens = 0;

  async function processSubset(subset: typeof pedidosSemItens) {
    if (!subset.length) return;
    const parcial = await salvarItensLote(
      accessToken,
      subset.map((p) => ({ idTiny: p.tiny_id!, idLocal: p.id })),
      { delayMs, context: options?.context }
    );
    totalSucesso += parcial.sucesso;
    totalItens += parcial.totalItens;
  }

  await processSubset(pedidosSemItens);
  let restantes = await buscarPedidosSemItens(pedidosSemItens.map((p) => p.id));

  let tentativa = 0;
  while (restantes.length > 0 && (unlimitedRetries || tentativa < (retries as number))) {
    tentativa++;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const restantesSet = new Set(restantes);
    const subset = pedidosSemItens.filter((p) => restantesSet.has(p.id));
    if (!subset.length) break;

    await processSubset(subset);

    const antes = restantes.length;
    restantes = await buscarPedidosSemItens(pedidosSemItens.map((p) => p.id));

    if (restantes.length === antes && unlimitedRetries) {
      console.warn(
        '[Itens Pedido] Nenhum progresso na sincronização de itens; aguardando antes da próxima tentativa (modo retries infinitos)'
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs * 2));
    }

    if (restantes.length === antes && !unlimitedRetries) {
      break;
    }
  }

  const falhas = pedidosSemItens.length - totalSucesso;
  return {
    processados: pedidos.length,
    sucesso: totalSucesso,
    falhas,
    totalItens,
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
    context?: string;
  }
): Promise<{ processados: number; sucesso: number; totalItens: number }> {
  const { limit = 50, maxRequests = 100, dataMinima, context } = options ?? {};

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
    })),
    { delayMs: 600, context }
  );

  return {
    processados: pedidosSemItens.length,
    sucesso: resultado.sucesso,
    totalItens: resultado.totalItens,
  };
}
// @ts-nocheck
