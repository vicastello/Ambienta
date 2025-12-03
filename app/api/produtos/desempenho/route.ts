import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getErrorMessage } from "@/lib/errors";
import type { Database } from "@/src/types/db-public";

const PAGE_SIZE = 1000;
const CACHE_MAX_AGE_SECONDS = 30;
const PRESETS = ["30d", "month", "year"] as const;

type ProdutoSeriePreset = (typeof PRESETS)[number];

type TinyPedidoItensRow = Database["public"]["Tables"]["tiny_pedido_itens"]["Row"];
type TinyOrdersRow = Database["public"]["Tables"]["tiny_orders"]["Row"];

type PedidoItemWithOrder = Pick<TinyPedidoItensRow, "quantidade" | "valor_total" | "valor_unitario"> & {
  tiny_orders: Pick<TinyOrdersRow, "data_criacao" | "situacao"> | null;
};

type SeriePoint = {
  data: string;
  quantidade: number;
  receita: number;
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

async function fetchSerieRows(produtoId: number, startDate: string, endDate: string) {
  const rows: PedidoItemWithOrder[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("tiny_pedido_itens")
      .select("quantidade, valor_total, valor_unitario, tiny_orders!inner(data_criacao,situacao)")
      .eq("id_produto_tiny", produtoId)
      .gte("tiny_orders.data_criacao", startDate)
      .lte("tiny_orders.data_criacao", endDate)
      .order("data_criacao", { referencedTable: "tiny_orders", ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...((data as unknown) as PedidoItemWithOrder[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
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

    const rows = await fetchSerieRows(produtoId, startDate, endDate);

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

    const body: ApiResponseBody = {
      produtoId,
      preset,
      startDate,
      endDate,
      totalQuantidade: Number(totalQuantidade.toFixed(4)),
      totalReceita: Number(totalReceita.toFixed(2)),
      serie,
      melhorDia,
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
