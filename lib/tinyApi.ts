// Interface de paginação padrão das respostas Tiny
export interface TinyPaginacao {
  pagina: number;
  paginas: number;
  por_pagina: number;
  total: number;
}
// Resposta da listagem de pedidos Tiny v3
export interface TinyListarPedidosResponse {
  itens: TinyPedidoListaItem[];
  total?: number;
  paginacao?: TinyPaginacao;
  [key: string]: unknown;
}
// Parâmetros genéricos para GETs na Tiny API
export type TinyGetParams = Record<string, string | number | boolean | undefined>;
// Situações possíveis do pedido segundo o Swagger oficial Tiny v3
export type TinyPedidoSituacao =
  | 8 // Dados Incompletos
  | 0 // Aberta
  | 3 // Aprovada
  | 4 // Preparando Envio
  | 1 // Faturada
  | 7 // Pronto Envio
  | 5 // Enviada
  | 6 // Entregue
  | 2 // Cancelada
  | 9; // Não Entregue

// Parâmetros para GET /pedidos conforme Swagger oficial
export interface TinyListarPedidosParams {
  numero?: number;
  nomeCliente?: string;
  codigoCliente?: string;
  cnpj?: string;
  dataInicial?: string;      // formato "YYYY-MM-DD"
  dataFinal?: string;        // formato "YYYY-MM-DD"
  dataAtualizacao?: string;  // formato "YYYY-MM-DD"
  situacao?: TinyPedidoSituacao;
  numeroPedidoEcommerce?: string;
  idVendedor?: number;
  marcadores?: string[];
  orderBy?: 'asc' | 'desc';
  limit?: number;   // default 100
  offset?: number;  // default 0
}

// lib/tinyApi.ts

const TINY_BASE_URL =
  process.env.TINY_API_BASE_URL ?? "https://api.tiny.com.br/public-api/v3";

export class TinyApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Tipos básicos da listagem de pedidos (ListagemPedidoModelResponse)
export interface TinyPedidoListaItem {
  id: number | null;
  situacao: number | null;
  numeroPedido: number | null;
  ecommerce?: {
    numeroPedidoEcommerce?: string | null;
    canal?: string | null;
  };
  dataCriacao: string | null;
  dataPrevista: string | null;
  // ...demais campos conforme uso real
}
export type TinyGetOptions = {
  headers?: Record<string, string>;
  allowNotModified?: boolean;
  context?: string;
  endpointLabel?: string;
};

export async function tinyGet<T>(
  path: string,
  accessToken: string,
  params: TinyGetParams = {},
  options: TinyGetOptions = {}
): Promise<T> {
  const context = options.context ?? 'unknown';
  const endpointLabel = options.endpointLabel ?? path;
  const url = new URL(TINY_BASE_URL + path);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  let res: Response | null = null;
  let text = '';
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(options.headers ?? {}),
      },
    });

    text = await res.text();

    if (res.status === 304 && options.allowNotModified) {
      return { notModified: true } as unknown as T;
    }

    const logPayload = {
      context,
      endpoint: endpointLabel,
      method: 'GET',
      statusCode: res.status,
      success: res.ok,
      errorCode: null as string | null,
      errorMessage: null as string | null,
    };

    if (!res.ok) {
      // Lógica de Retry para Rate Limit (429) ou Gateway Timeout (504)
      const isRetryable = res.status === 429 || res.status === 504;
      const currentRetry = (options as any)._retryCount || 0;
      const maxRetries = 3;

      if (isRetryable && currentRetry < maxRetries) {
        const delay = 1000 * Math.pow(2, currentRetry); // 1s, 2s, 4s...
        console.warn(`[TinyApi] Rate Limit ${res.status} detectado. Retrying em ${delay}ms... (Tentativa ${currentRetry + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Chamada recursiva com contador incrementado
        return tinyGet<T>(path, accessToken, params, {
          ...options,
          _retryCount: currentRetry + 1,
        } as any);
      }

      try {
        const json = JSON.parse(text);
        logPayload.errorCode = (json?.error as string) ?? (json?.code as string) ?? null;
        logPayload.errorMessage = (json?.message as string) ?? text;
      } catch {
        logPayload.errorMessage = text;
      }
      // Fire and forget logging
      import('@/src/lib/tinyUsageLogger').then(({ logTinyUsage }) =>
        logTinyUsage(logPayload).catch(() => { })
      );

      throw new TinyApiError(
        `Erro ao chamar Tiny (${res.status})`,
        res.status,
        text
      );
    }

    // Log sucesso
    import('@/src/lib/tinyUsageLogger').then(({ logTinyUsage }) =>
      logTinyUsage(logPayload).catch(() => { })
    );

    try {
      return JSON.parse(text) as T;
    } catch (err) {
      console.error("[TinyApi] Erro ao parsear JSON Tiny", err, text);
      throw new TinyApiError("Erro ao ler resposta do Tiny.", res.status, text);
    }
  } catch (error: any) {
    // Falha de rede ou erro antes de obter res
    if (!res) {
      import('@/src/lib/tinyUsageLogger').then(({ logTinyUsage }) =>
        logTinyUsage({
          context,
          endpoint: endpointLabel,
          method: 'GET',
          statusCode: null,
          success: false,
          errorCode: 'NETWORK_ERROR',
          errorMessage: error?.message ?? String(error),
        }).catch(() => { })
      );
    }
    throw error;
  }
}

/**
 * Listagem de pedidos exatamente como o /pedidos da v3 espera
 * Doc: GET /pedidos  [oai_citation:1‡Swagger UI (16_11_2025 15：58：34).txt](sediment://file_000000004b7071f59d0340e3a86fcdc6)
 */
export async function listarPedidosTiny(
  accessToken: string,
  options?: {
    limit?: number;
    offset?: number;
    orderBy?: "asc" | "desc";
    situacao?: number; // 0,1,2,... conforme enum
    fields?: string;
    dataAtualizacao?: string; // yyyy-mm-dd - busca pedidos atualizados desde essa data
  },
  context?: string
): Promise<TinyListarPedidosResponse> {
  const { limit = 100, offset = 0, orderBy = "desc", situacao, fields, dataAtualizacao } = options ?? {};

  const params: TinyGetParams = {
    limit,
    offset,
    orderBy,
    // Always request freight and detailed values
    fields: fields ?? 'valorFrete,valorTotalPedido,valorTotalProdutos,valorDesconto,valorOutrasDespesas,transportador',
  };

  if (typeof situacao === "number") {
    params.situacao = situacao;
  }

  if (dataAtualizacao) {
    params.dataAtualizacao = dataAtualizacao;
  }

  return tinyGet<TinyListarPedidosResponse>("/pedidos", accessToken, params, {
    context,
    endpointLabel: '/pedidos',
  });
}

/**
 * Listagem de pedidos com filtros de período (quando possível)
 * Usa exatamente os nomes esperados pela API v3: dataInicial / dataFinal
 * Caso a API rejeite (400), quem chamar deve tratar o erro.
 */
export async function listarPedidosTinyPorPeriodo(
  accessToken: string,
  options: {
    dataInicial: string; // yyyy-mm-dd
    dataFinal: string;   // yyyy-mm-dd
    limit?: number;
    offset?: number;
    orderBy?: "asc" | "desc";
    situacao?: number;
    fields?: string; // comma-separated fields to include
  },
  context?: string
): Promise<TinyListarPedidosResponse> {
  const {
    dataInicial,
    dataFinal,
    limit = 100,
    offset = 0,
    orderBy = "desc",
    situacao,
    fields,
  } = options;

  const params: TinyGetParams = {
    limit,
    offset,
    orderBy,
    dataInicial,
    dataFinal,
    // Always request freight and detailed values unless explicitly overridden
    fields: fields ?? 'valorFrete,valorTotalPedido,valorTotalProdutos,valorDesconto,valorOutrasDespesas,transportador',
  };

  if (typeof situacao === "number") {
    params.situacao = situacao;
  }

  return tinyGet<TinyListarPedidosResponse>("/pedidos", accessToken, params, {
    context,
    endpointLabel: '/pedidos',
  });
}

/**
 * Get detailed order information including frete (shipping cost)
 */
export interface TinyPedidoDetalhado {
  id: number;
  numeroPedido?: number;
  situacao: number;
  dataCriacao: string;
  dataPrevista: string;
  data: string;
  valor?: number | string;
  valorFrete?: number | string;
  valorDesconto?: number | string;
  valorOutrasDespesas?: number | string;
  valorTotalPedido?: number | string;
  valorTotalProdutos?: number | string;
  itens?: Array<{
    id?: number;
    idProduto?: number;
    codigo?: string;
    descricao?: string;
    quantidade?: number;
    valorUnitario?: number;
    valorTotal?: number;
    informacoesAdicionais?: string;
  }>;
  [key: string]: any;
}

/**
 * Get detailed order information by ID
 * This is the only endpoint that returns valorFrete reliably
 */
export async function obterPedidoDetalhado(
  accessToken: string,
  pedidoId: number,
  context?: string
): Promise<TinyPedidoDetalhado> {
  return tinyGet<TinyPedidoDetalhado>(`/pedidos/${pedidoId}`, accessToken, {}, {
    context,
    endpointLabel: `/pedidos/${pedidoId}`,
  });
}

// ==================== PRODUTOS ====================

/**
 * Produto da listagem (ListagemProdutosResponseModel)
 */
export interface TinyProdutoListaItem {
  id: number;
  sku: string;
  descricao: string;
  tipo: 'K' | 'S' | 'V' | 'F' | 'M'; // Kit, Simples, Com Variações, Fabricado, Matéria Prima
  situacao: 'A' | 'I' | 'E'; // Ativo, Inativo, Excluído
  dataCriacao?: string | null;
  dataAlteracao?: string | null;
  unidade: string;
  gtin: string;
  precos?: {
    preco?: number;
    precoPromocional?: number;
  };
}

/**
 * Produto detalhado (ObterProdutoModelResponse)
 */
export interface TinyProdutoDetalhado {
  id: number;
  codigo: string;
  nome: string;
  unidade: string;
  tipo: 'K' | 'S' | 'V' | 'F' | 'M';
  situacao: 'A' | 'I' | 'E';
  gtin?: string;
  descricao?: string;
  descricaoComplementar?: string;
  ncm?: string;
  origem?: string;
  dimensoes?: {
    pesoLiquido?: number;
    pesoBruto?: number;
  };
  precos?: {
    preco?: number;
    precoPromocional?: number;
  };
  estoque?: {
    controlar?: boolean;
    sobEncomenda?: boolean;
    minimo?: number;
    maximo?: number;
    saldo?: number;
    reservado?: number;
    disponivel?: number;
  };
  fornecedores?: Array<{
    id?: number;
    nome?: string;
    codigoProdutoNoFornecedor?: string;
  }>;
  anexos?: Array<{
    url?: string;
    interno?: boolean;
  }>;
  [key: string]: any;
}

/**
 * Estoque detalhado por produto (ObterEstoqueProdutoModelResponse)
 */
export interface TinyEstoqueProduto {
  id: number;
  nome: string;
  codigo: string;
  unidade: string;
  saldo: number;
  reservado: number;
  disponivel: number;
  depositos?: Array<{
    id: number;
    nome: string;
    desconsiderar: boolean;
    saldo: number;
    reservado: number;
    disponivel: number;
  }>;
}

export interface TinyListarProdutosResponse {
  itens: TinyProdutoListaItem[];
  paginacao?: TinyPaginacao;
}

/**
 * Listar produtos com paginação
 * Doc: GET /produtos
 */
export async function listarProdutos(
  accessToken: string,
  options?: {
    nome?: string; // busca por nome parcial
    codigo?: string; // busca por código
    gtin?: number; // busca por GTIN
    situacao?: 'A' | 'I' | 'E'; // A=Ativo, I=Inativo, E=Excluído
    dataCriacao?: string; // yyyy-mm-dd HH:mm:ss
    dataAlteracao?: string; // yyyy-mm-dd HH:mm:ss
    limit?: number;
    offset?: number;
  },
  context?: string
): Promise<TinyListarProdutosResponse> {
  const {
    nome,
    codigo,
    gtin,
    situacao,
    dataCriacao,
    dataAlteracao,
    limit = 100,
    offset = 0,
  } = options ?? {};

  const params: TinyGetParams = {
    limit,
    offset,
  };

  const isCronLike = Boolean(context && (/cron/i.test(context) || /estoque/i.test(context)));
  if (nome) params.nome = nome;
  if (codigo) params.codigo = codigo;
  if (gtin) params.gtin = gtin;
  const allowedSituacao = new Set(['A', 'I', 'E']);
  // Em crons/backfill (context cron/estoque) nunca enviamos situacao
  if (!isCronLike && situacao && allowedSituacao.has(situacao)) {
    params.situacao = situacao;
  }
  if (dataCriacao) params.dataCriacao = dataCriacao;
  if (dataAlteracao) params.dataAlteracao = dataAlteracao;

  const isSituacaoRetryableError = (body: string) => {
    try {
      const parsed = JSON.parse(body);
      const detalhes = parsed?.detalhes ?? parsed?.erros ?? parsed?.errors ?? [];
      return Array.isArray(detalhes) && detalhes.some((item) => item?.campo === 'situacao');
    } catch {
      return body.includes('situacao');
    }
  };

  try {
    return await tinyGet<TinyListarProdutosResponse>("/produtos", accessToken, params, {
      context,
      endpointLabel: '/produtos',
    });
  } catch (err) {
    const hasSituacaoParam = params.situacao !== undefined;
    if (err instanceof TinyApiError && err.status === 400 && hasSituacaoParam && isSituacaoRetryableError(err.body)) {
      console.warn('[TinyApi] 400 em /produtos com situacao, retry sem situacao', {
        context,
        status: err.status,
        body: err.body,
      });
      const retryParams = { ...params };
      delete retryParams.situacao;
      return tinyGet<TinyListarProdutosResponse>("/produtos", accessToken, retryParams, {
        context,
        endpointLabel: '/produtos',
      });
    }
    throw err;
  }
}

/**
 * Obter produto detalhado por ID
 * Doc: GET /produtos/{idProduto}
 */
export async function obterProduto(
  accessToken: string,
  produtoId: number,
  opts?: TinyGetOptions
): Promise<TinyProdutoDetalhado> {
  return tinyGet<TinyProdutoDetalhado>(`/produtos/${produtoId}`, accessToken, {}, {
    ...opts,
    context: opts?.context,
    endpointLabel: `/produtos/${produtoId}`,
  });
}

/**
 * Obter estoque detalhado de um produto
 * Doc: GET /estoque/{idProduto}
 */
export async function obterEstoqueProduto(
  accessToken: string,
  produtoId: number,
  opts?: TinyGetOptions
): Promise<TinyEstoqueProduto> {
  return tinyGet<TinyEstoqueProduto>(`/estoque/${produtoId}`, accessToken, {}, {
    ...opts,
    context: opts?.context,
    endpointLabel: `/estoque/${produtoId}`,
  });
}
