import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getErrorMessage } from "@/lib/errors";
import {
  addCodeCandidates,
  addIdCandidates,
  extractRelatedEntries,
  isRecord,
  toTrimmedStringOrNull,
} from "@/lib/productRelationships";
import type { Database, TinyProdutosRow } from "@/src/types/db-public";

const PAGE_SIZE = 1000;
const CACHE_MAX_AGE_SECONDS = 30;
const PRESETS = ["30d", "month", "year"] as const;

type ProdutoSeriePreset = (typeof PRESETS)[number];

type TinyPedidoItensRow = Database["public"]["Tables"]["tiny_pedido_itens"]["Row"];
type TinyOrdersRow = Database["public"]["Tables"]["tiny_orders"]["Row"];

type PedidoItemWithOrder = Pick<
  TinyPedidoItensRow,
  "id" | "id_produto_tiny" | "codigo_produto" | "quantidade" | "valor_total" | "valor_unitario"
> & {
  tiny_orders: Pick<TinyOrdersRow, "data_criacao" | "situacao"> | null;
};

type SeriePoint = {
  data: string;
  quantidade: number;
  receita: number;
};

type ProdutoSerieMeta = {
  aggregatedIds: number[];
  aggregatedCodes: string[];
  matchedIds: number[];
  matchedCodes: string[];
  consolidatedChildren: number;
  childSource: "variacoes" | "kit" | null;
  usedCodigoFallback: boolean;
};

type ApiResponseBody = {
  produtoId: number;
  preset: ProdutoSeriePreset;
  startDate: string;
  endDate: string;
  totalQuantidade: number;
  totalReceita: number;
  serie: SeriePoint[];
  melhorDia: SeriePoint | null;
  meta?: ProdutoSerieMeta;
};

const now = () => new Date();

function resolvePreset(value: string | null): ProdutoSeriePreset {
  if (!value) return "30d";
  return PRESETS.includes(value as ProdutoSeriePreset) ? (value as ProdutoSeriePreset) : "30d";
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolveRange(preset: ProdutoSeriePreset) {
  const today = now();
  const endDate = formatDate(today);
  if (preset === "month") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { startDate: formatDate(start), endDate };
  }
  if (preset === "year") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { startDate: formatDate(start), endDate };
  }
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 29);
  return { startDate: formatDate(start), endDate };
}

type ProdutoResumoRow = Pick<TinyProdutosRow, "id_produto_tiny" | "codigo" | "tipo" | "raw_payload">;

type ProdutoSerieTargets = {
  produto: ProdutoResumoRow;
  ids: number[];
  codes: string[];
  childSource: "variacoes" | "kit" | null;
  usedCodigoFallback: boolean;
};


async function loadProdutoSerieTargets(produtoId: number): Promise<ProdutoSerieTargets | null> {
  const { data, error } = await supabaseAdmin
    .from("tiny_produtos")
    .select("id_produto_tiny,codigo,tipo,raw_payload")
    .eq("id_produto_tiny", produtoId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const produto = data as ProdutoResumoRow;
  const ids = new Set<number>();
  const codes = new Set<string>();
  ids.add(produtoId);
  const codigoBase = toTrimmedStringOrNull(produto.codigo);
  if (codigoBase) codes.add(codigoBase);

  let childSource: "variacoes" | "kit" | null = null;

  if (produto.raw_payload) {
    const { entries, source } = extractRelatedEntries(produto.raw_payload, produto.tipo);
    if (entries.length) {
      childSource = source;
      for (const entryRaw of entries) {
        if (!isRecord(entryRaw)) continue;
        addIdCandidates(entryRaw, ids);
        addCodeCandidates(entryRaw, codes);
      }
    }
  }

  const aggregatedIds = Array.from(ids).filter((value) => Number.isFinite(value) && value > 0);
  const aggregatedCodes = Array.from(codes).filter(Boolean);
  const usedCodigoFallback = aggregatedCodes.some((code) => code !== codigoBase);

  return {
    produto,
    ids: aggregatedIds,
    codes: aggregatedCodes,
    childSource,
    usedCodigoFallback,
  };
}

async function fetchSerieRowsForColumn(
  column: "id_produto_tiny" | "codigo_produto",
  rawValues: Array<number | string>,
  startDate: string,
  endDate: string
): Promise<PedidoItemWithOrder[]> {
  const values = Array.from(new Set(rawValues)).filter((value) =>
    column === "id_produto_tiny" ? typeof value === "number" && Number.isFinite(value) : typeof value === "string"
  ) as Array<number | string>;

  if (!values.length) return [];

  const rows: PedidoItemWithOrder[] = [];
  let from = 0;

  while (true) {
    let query = supabaseAdmin
      .from("tiny_pedido_itens")
      .select(
        "id,id_produto_tiny,codigo_produto,quantidade,valor_total,valor_unitario,tiny_orders!inner(data_criacao,situacao)"
      )
      .gte("tiny_orders.data_criacao", startDate)
      .lte("tiny_orders.data_criacao", endDate)
      .order("data_criacao", { referencedTable: "tiny_orders", ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (column === "id_produto_tiny") {
      query = query.in(column, values as number[]);
    } else {
      query = query.in(column, values as string[]);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    rows.push(...((data as unknown) as PedidoItemWithOrder[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchSerieRows(targets: ProdutoSerieTargets, startDate: string, endDate: string) {
  const rowsById = await fetchSerieRowsForColumn("id_produto_tiny", targets.ids, startDate, endDate);
  const rowsByCode = await fetchSerieRowsForColumn("codigo_produto", targets.codes, startDate, endDate);

  if (!rowsById.length) {
    const dedupByCode = new Map<string, PedidoItemWithOrder>();
    for (const row of rowsByCode) {
      const key = row.codigo_produto ?? String(row.id ?? Math.random());
      dedupByCode.set(key, row);
    }
    return Array.from(dedupByCode.values());
  }

  const dedup = new Map<number, PedidoItemWithOrder>();
  for (const row of rowsById) {
    if (typeof row.id === "number") {
      dedup.set(row.id, row);
    }
  }
  for (const row of rowsByCode) {
    if (typeof row.id === "number" && !dedup.has(row.id)) {
      dedup.set(row.id, row);
    }
  }
  return Array.from(dedup.values());
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const produtoIdParam = searchParams.get("produtoId") ?? searchParams.get("id");
    const produtoId = Number(produtoIdParam);

    if (!Number.isFinite(produtoId) || produtoId <= 0) {
      return NextResponse.json({ error: "produtoId inválido" }, { status: 400 });
    }

    const preset = resolvePreset(searchParams.get("preset"));
    const { startDate, endDate } = resolveRange(preset);

    const targets = await loadProdutoSerieTargets(produtoId);
    if (!targets) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    const rows = await fetchSerieRows(targets, startDate, endDate);

    const serieMap = new Map<string, { quantidade: number; receita: number }>();
    let totalQuantidade = 0;
    let totalReceita = 0;

    for (const row of rows) {
      const dataPedido = row.tiny_orders?.data_criacao;
      if (!dataPedido) continue;
      const quantidade = typeof row.quantidade === "number" ? row.quantidade : Number(row.quantidade ?? 0);
      if (!Number.isFinite(quantidade) || quantidade === 0) continue;
      const receita =
        typeof row.valor_total === "number"
          ? row.valor_total
          : quantidade * (typeof row.valor_unitario === "number" ? row.valor_unitario : Number(row.valor_unitario ?? 0));

      const entry = serieMap.get(dataPedido) ?? { quantidade: 0, receita: 0 };
      entry.quantidade += quantidade;
      entry.receita += receita;
      serieMap.set(dataPedido, entry);
      totalQuantidade += quantidade;
      totalReceita += receita;
    }

    const serie: SeriePoint[] = Array.from(serieMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([data, info]) => ({
        data,
        quantidade: Number(info.quantidade.toFixed(4)),
        receita: Number(info.receita.toFixed(2)),
      }));

    const melhorDia = serie.reduce<SeriePoint | null>((acc, dia) => {
      if (!acc) return dia;
      return dia.receita > acc.receita ? dia : acc;
    }, null);

    const matchedIdsSet = new Set<number>();
    const matchedCodesSet = new Set<string>();
    for (const row of rows) {
      if (typeof row.id_produto_tiny === "number" && Number.isFinite(row.id_produto_tiny)) {
        matchedIdsSet.add(row.id_produto_tiny);
      }
      const codigo = toTrimmedStringOrNull(row.codigo_produto);
      if (codigo) matchedCodesSet.add(codigo);
    }

    const meta: ProdutoSerieMeta = {
      aggregatedIds: targets.ids,
      aggregatedCodes: targets.codes,
      matchedIds: Array.from(matchedIdsSet),
      matchedCodes: Array.from(matchedCodesSet),
      consolidatedChildren: Array.from(matchedIdsSet).filter((id) => id !== produtoId).length,
      childSource: targets.childSource,
      usedCodigoFallback: targets.usedCodigoFallback || matchedCodesSet.size > 0,
    };

    const body: ApiResponseBody = {
      produtoId,
      preset,
      startDate,
      endDate,
      totalQuantidade: Number(totalQuantidade.toFixed(4)),
      totalReceita: Number(totalReceita.toFixed(2)),
      serie,
      melhorDia,
      meta,
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE_SECONDS}`,
        "CDN-Cache-Control": `public, max-age=${CACHE_MAX_AGE_SECONDS}`,
      },
    });
  } catch (error) {
    console.error("[Produtos desempenho]", error);
    return NextResponse.json({ error: getErrorMessage(error) ?? "Erro ao buscar desempenho" }, { status: 500 });
  }
}
