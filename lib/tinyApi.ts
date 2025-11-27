// Interface de paginação padrão das respostas Tiny
export interface TinyPaginacao {
  pagina: number;
  paginas: number;
  por_pagina: number;
  total: number;
}
// Resposta da listagem de pedidos Tiny v3
export interface TinyListarPedidosResponse {
  itens: any[];
  total?: number;
  [key: string]: any;
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
};

export async function tinyGet<T>(
  path: string,
  accessToken: string,
  params: TinyGetParams = {},
  options: TinyGetOptions = {}
): Promise<T> {
  const url = new URL(TINY_BASE_URL + path);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();

  if (res.status === 304 && options.allowNotModified) {
    return { notModified: true } as unknown as T;
  }

  if (!res.ok) {
    console.error("[TinyApi] Erro ao chamar Tiny", res.status, text, {
      url: url.toString(),
    });
    throw new TinyApiError(
      `Erro ao chamar Tiny (${res.status})`,
      res.status,
      text
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("[TinyApi] Erro ao parsear JSON Tiny", err, text);
    throw new TinyApiError("Erro ao ler resposta do Tiny.", res.status, text);
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
  }
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

  return tinyGet<TinyListarPedidosResponse>("/pedidos", accessToken, params);
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
  }
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

  return tinyGet<TinyListarPedidosResponse>("/pedidos", accessToken, params);
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
  pedidoId: number
): Promise<TinyPedidoDetalhado> {
  return tinyGet<TinyPedidoDetalhado>(`/pedidos/${pedidoId}`, accessToken, {});
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
  }
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

  if (nome) params.nome = nome;
  if (codigo) params.codigo = codigo;
  if (gtin) params.gtin = gtin;
  if (situacao) params.situacao = situacao;
  if (dataCriacao) params.dataCriacao = dataCriacao;
  if (dataAlteracao) params.dataAlteracao = dataAlteracao;

  return tinyGet<TinyListarProdutosResponse>("/produtos", accessToken, params);
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
  return tinyGet<TinyProdutoDetalhado>(`/produtos/${produtoId}`, accessToken, {}, opts);
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
  return tinyGet<TinyEstoqueProduto>(`/estoque/${produtoId}`, accessToken, {}, opts);
}
