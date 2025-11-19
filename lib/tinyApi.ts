// lib/tinyApi.ts
import "server-only";

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
  cliente?: {
    nome?: string | null;
    codigo?: string | null;
    cnpj?: string | null;
  };
  valor: string | null; // vem como string na API v3
  valorFrete?: string | number | null; // frete quando fields incluem isso
  valorTotalPedido?: string | number | null; // valor bruto quando fields incluem isso
  valorTotalProdutos?: string | number | null; // valor líquido quando fields incluem isso
  valorDesconto?: string | number | null;
  valorOutrasDespesas?: string | number | null;
  vendedor?: {
    id?: number | null;
    nome?: string | null;
  };
  transportador?: {
    nome?: string | null;
  };
  [key: string]: any; // allow additional fields from API
}

export interface TinyPaginacao {
  total?: number;
  limit?: number;
  offset?: number;
}

export interface TinyListarPedidosResponse {
  itens: TinyPedidoListaItem[];
  paginacao?: TinyPaginacao;
}

type TinyGetParams = Record<string, string | number | boolean | undefined>;

/**
 * Cliente genérico de GET para a Tiny API v3
 */
export async function tinyGet<T>(
  path: string,
  accessToken: string,
  params: TinyGetParams = {}
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
    },
  });

  const text = await res.text();

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
    // NÃO vamos mandar filtros de data aqui por enquanto, para evitar 400.
    // Se quiser depois, usamos exatamente: dataInicial / dataFinal / dataAtualizacao
    limit?: number;
    offset?: number;
    orderBy?: "asc" | "desc";
    situacao?: number; // 0,1,2,... conforme enum
  }
): Promise<TinyListarPedidosResponse> {
  const { limit = 100, offset = 0, orderBy = "desc", situacao } = options ?? {};

  const params: TinyGetParams = {
    limit,
    offset,
    orderBy,
  };

  if (typeof situacao === "number") {
    params.situacao = situacao;
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
  };

  if (typeof situacao === "number") {
    params.situacao = situacao;
  }

  if (fields) {
    params.fields = fields;
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
  [key: string]: any;
}

export async function obterPedidoDetalhado(
  accessToken: string,
  pedidoId: number
): Promise<TinyPedidoDetalhado> {
  return tinyGet<TinyPedidoDetalhado>(`/pedidos/${pedidoId}`, accessToken);
}