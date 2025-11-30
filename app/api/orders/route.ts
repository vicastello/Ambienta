import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizarCanalTiny, descricaoSituacao } from "@/lib/tinyMapping";
import { getErrorMessage } from "@/lib/errors";
import type { Database } from "@/src/types/db-public";

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 25;
const ORDERABLE_FIELDS = new Set([
  "numero_pedido",
  "data_criacao",
  "valor",
  "valor_frete",
]);

type TinyOrdersRow = Database["public"]["Tables"]["tiny_orders"]["Row"];
type TinyPedidoItensRow = Database["public"]["Tables"]["tiny_pedido_itens"]["Row"];
type TinyProdutosRow = Database["public"]["Tables"]["tiny_produtos"]["Row"];
type OrdersMetricsArgs = Database["public"]["Functions"]["orders_metrics"]["Args"];
type OrdersMetricsRow = Database["public"]["Functions"]["orders_metrics"]["Returns"][number];

type PedidoSelectRow = Pick<
  TinyOrdersRow,
  | "id"
  | "tiny_id"
  | "numero_pedido"
  | "situacao"
  | "data_criacao"
  | "valor"
  | "valor_frete"
  | "canal"
  | "cliente_nome"
  | "raw"
>;

type PedidoItemWithProduto = Pick<
  TinyPedidoItensRow,
  "id_pedido" | "quantidade" | "nome_produto" | "codigo_produto"
> & {
  tiny_produtos?: Pick<TinyProdutosRow, "imagem_url"> | null;
};

type JsonRecord = Record<string, unknown>;

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toJsonRecord = (value: unknown): JsonRecord | null =>
  (isJsonRecord(value) ? value : null);

const toStringOrNull = (value: unknown): string | null =>
  (typeof value === "string" && value.trim().length > 0 ? value : null);

function extractItens(raw: JsonRecord | null): JsonRecord[] {
  if (!raw) return [];
  const pedido = toJsonRecord(raw.pedido);
  const itensFromPedido = pedido && Array.isArray(pedido.itens) ? pedido.itens : null;
  const itensFromRoot = Array.isArray(raw.itens) ? raw.itens : null;
  const itens = itensFromPedido ?? itensFromRoot ?? [];
  return itens.filter(isJsonRecord);
}

function extractProduto(item: JsonRecord | null): JsonRecord | null {
  if (!item) return null;
  const produto = item.produto;
  return toJsonRecord(produto);
}

function extractImagemFromProduto(produto: JsonRecord | null): string | null {
  if (!produto) return null;
  const imagemPrincipal = produto.imagemPrincipal;

  if (typeof imagemPrincipal === "string" && imagemPrincipal.trim().length > 0) {
    return imagemPrincipal;
  }

  if (isJsonRecord(imagemPrincipal)) {
    const url = toStringOrNull(imagemPrincipal.url);
    if (url) return url;
  }

  const fallbackKeys = ["imagem", "foto"] as const;
  for (const key of fallbackKeys) {
    const value = produto[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function parseNumberList(param: string | null): number[] | null {
  if (!param) return null;
  const values = param
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length ? values : null;
}

function parseStringList(param: string | null): string[] | null {
  if (!param) return null;
  const values = param
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : null;
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSizeRaw = Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw));

    const dataInicial = searchParams.get("dataInicial");
    const dataFinal = searchParams.get("dataFinal");
    const search = searchParams.get("search")?.trim();
    const situacoes = parseNumberList(searchParams.get("situacoes"));
    const canais = parseStringList(searchParams.get("canais"));
    const sortByParam = searchParams.get("sortBy") ?? "numero_pedido";
    const sortBy = ORDERABLE_FIELDS.has(sortByParam) ? sortByParam : "numero_pedido";
    const sortDirParam = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabaseAdmin
      .from("tiny_orders")
      .select(
        "id, tiny_id, numero_pedido, situacao, data_criacao, valor, valor_frete, canal, cliente_nome, raw",
        { count: "exact" }
      );

    if (dataInicial) {
      query = query.gte("data_criacao", dataInicial);
    }
    if (dataFinal) {
      query = query.lte("data_criacao", dataFinal);
    }
    if (situacoes) {
      query = query.in("situacao", situacoes);
    }
    if (canais) {
      query = query.in("canal", canais);
    }
    if (search) {
      const escaped = escapeLike(search);
      const numericSearch = Number(search);
      const conditions = [
        `cliente_nome.ilike.%${escaped}%`,
        `canal.ilike.%${escaped}%`,
      ];
      if (Number.isFinite(numericSearch)) {
        conditions.push(`numero_pedido.eq.${numericSearch}`);
        conditions.push(`tiny_id.eq.${numericSearch}`);
      } else {
        conditions.push(`raw->>numeroPedidoEcommerce.ilike.%${escaped}%`);
      }
      query = query.or(conditions.join(","));
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDirParam === "asc" })
      .range(from, to);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as PedidoSelectRow[];
    const orderIds = rows.map((order) => order.id);
    let itensPorPedido: Record<number, number> = {};
    const primeiraImagemMap: Record<number, string | null> = {};

    if (orderIds.length) {
      const { data: itensData, error: itensError } = await supabaseAdmin
        .from("tiny_pedido_itens")
        .select("id_pedido, quantidade, nome_produto, codigo_produto, tiny_produtos(imagem_url)")
        .in("id_pedido", orderIds);

      if (itensError) {
        throw itensError;
      }

      // Supabase relationship parser returns helper metadata instead of row typing here,
      // so cast through unknown to reflect the runtime JSON structure (id, quantidade, tiny_produtos.imagem_url).
      const itensRows = ((itensData ?? []) as unknown) as PedidoItemWithProduto[];

      itensPorPedido = itensRows.reduce<Record<number, number>>((acc, item) => {
        const idPedido = item.id_pedido;
        if (typeof idPedido === "number") {
          const current = acc[idPedido] ?? 0;
          const quantidade = Number(item.quantidade ?? 0);
          acc[idPedido] = current + (Number.isFinite(quantidade) ? quantidade : 0);
        }
        return acc;
      }, {});

      // Fallback: buscar imagem pelo código do produto, caso a relação tiny_produtos esteja vazia
      const codigosParaBuscar = new Set<string>();
      for (const row of itensRows) {
        if (row.tiny_produtos?.imagem_url) continue;
        if (typeof row.codigo_produto === "string" && row.codigo_produto.trim()) {
          codigosParaBuscar.add(row.codigo_produto.trim());
        }
      }

      let imagemPorCodigo: Record<string, string> = {};
      if (codigosParaBuscar.size) {
        const { data: produtosPorCodigo, error: produtosCodigoError } = await supabaseAdmin
          .from("tiny_produtos")
          .select("codigo, imagem_url")
          .in("codigo", Array.from(codigosParaBuscar));
        if (produtosCodigoError) {
          throw produtosCodigoError;
        }
        imagemPorCodigo = (produtosPorCodigo ?? []).reduce<Record<string, string>>((acc, row) => {
          const codigo = typeof row.codigo === "string" ? row.codigo.trim() : "";
          if (codigo && row.imagem_url) acc[codigo] = row.imagem_url;
          return acc;
        }, {});
      }

      for (const row of itensRows) {
        const idPedido = row.id_pedido;
        if (typeof idPedido !== "number") continue;
        if (primeiraImagemMap[idPedido]) continue;
        const codigo = typeof row.codigo_produto === "string" ? row.codigo_produto.trim() : "";
        const imagemFromProduto = row.tiny_produtos?.imagem_url ?? null;
        const imagemFromCodigo = codigo ? imagemPorCodigo[codigo] ?? null : null;
        const imagem = imagemFromProduto ?? imagemFromCodigo ?? null;
        if (imagem) {
          primeiraImagemMap[idPedido] = imagem;
        }
      }
    }

    const orders = rows.map((order) => {
      const rawRecord = toJsonRecord(order.raw) ?? {};
      const itens = extractItens(rawRecord);
      const firstItem = itens[0] ?? null;
      const produto = extractProduto(firstItem);
      const imagemFromRaw = extractImagemFromProduto(produto);
      const imagemFromItens = primeiraImagemMap[order.id] ?? null;
      const imagem = imagemFromItens ?? imagemFromRaw;

      const valor = Number(order.valor ?? 0);
      const valorFrete = Number(order.valor_frete ?? 0);
      const pedidoRecord = toJsonRecord(rawRecord.pedido);
      const ecommerceRecord = toJsonRecord(rawRecord.ecommerce);
      const dataPrevista = toStringOrNull(rawRecord.dataPrevista) ?? toStringOrNull(pedidoRecord?.dataPrevista);
      const notaFiscal = toStringOrNull(rawRecord.numeroNota) ?? toStringOrNull(pedidoRecord?.numeroNota);
      const marketplaceOrder =
        toStringOrNull(ecommerceRecord?.numeroPedidoEcommerce) ??
        toStringOrNull(rawRecord.numeroPedidoEcommerce);

      return {
        tinyId: order.tiny_id,
        numeroPedido: order.numero_pedido,
        dataCriacao: order.data_criacao,
        dataPrevista,
        cliente: order.cliente_nome,
        canal: normalizarCanalTiny(order.canal ?? null),
        situacao: order.situacao ?? -1,
        situacaoDescricao: descricaoSituacao(order.situacao ?? -1),
        valor,
        valorFrete,
        valorLiquido: Math.max(0, valor - valorFrete),
        itensQuantidade: Math.max(0, Number(itensPorPedido[order.id] ?? itens.length)),
        primeiraImagem: imagem ?? null,
        notaFiscal,
        marketplaceOrder,
      };
    });

    const total = count ?? 0;
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));

    const metricsParams: OrdersMetricsArgs = {
      p_data_inicial: dataInicial ?? null,
      p_data_final: dataFinal ?? null,
      p_canais: canais ?? null,
      p_situacoes: situacoes ?? null,
      p_search: search ?? null,
    };

    const { data: metricsData, error: metricsError } = await supabaseAdmin.rpc(
      "orders_metrics",
      metricsParams
    );
    if (metricsError) {
      throw metricsError;
    }

    const metricsRow: OrdersMetricsRow | undefined = metricsData?.[0];
    const statusCounts: Record<string, number> = metricsRow?.situacao_counts ?? {};

    const { data: canaisDisponiveisData } = await supabaseAdmin
      .from("tiny_orders")
      .select("canal")
      .not("canal", "is", null)
      .order("canal", { ascending: true })
      .limit(100);

    const canaisDisponiveis = Array.from(
      new Set(
        (canaisDisponiveisData ?? [])
          .map((row: Pick<TinyOrdersRow, "canal">) => normalizarCanalTiny(row.canal ?? null))
          .filter((value): value is string => Boolean(value))
      )
    );

    return NextResponse.json({
      orders,
      pageInfo: {
        page,
        pageSize,
        total,
        totalPages,
      },
      metrics: {
        totalPedidos: Number(metricsRow?.total_orders ?? 0),
        totalBruto: Number(metricsRow?.total_bruto ?? 0),
        totalFrete: Number(metricsRow?.total_frete ?? 0),
        totalLiquido: Number(metricsRow?.total_liquido ?? 0),
        ticketMedio:
          Number(metricsRow?.total_orders ?? 0) > 0
            ? Number(metricsRow?.total_bruto ?? 0) / Number(metricsRow?.total_orders ?? 1)
            : 0,
      },
      statusCounts,
      canaisDisponiveis,
      appliedFilters: {
        dataInicial,
        dataFinal,
        situacoes,
        canais,
        search,
        sortBy,
        sortDir: sortDirParam,
      },
    });
  } catch (error: unknown) {
    const details = getErrorMessage(error);
    console.error("[API] /api/orders", error);
    return NextResponse.json(
      {
        message: "Erro ao carregar pedidos",
        details,
      },
      { status: 500 }
    );
  }
}
