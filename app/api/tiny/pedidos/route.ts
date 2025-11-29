import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listarPedidosTiny, listarPedidosTinyPorPeriodo } from "@/lib/tinyApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccessTokenFromDbOrRefresh } from "@/lib/tinyAuth";
import { mapPedidoToOrderRow } from "@/lib/tinyMapping";
import { getErrorMessage } from "@/lib/errors";
import type { TinyOrdersInsert } from "@/src/types/db-public";

type SyncPedidosBody = {
  dataInicial: string;
  dataFinal: string;
};

type PedidoRow = ReturnType<typeof mapPedidoToOrderRow>;

const TINY_PAGE_LIMIT = 100; // API max
const REQUEST_DELAY_MS = 600;

function isSyncPedidosBody(value: unknown): value is SyncPedidosBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { dataInicial, dataFinal } = value as Record<string, unknown>;
  return (
    typeof dataInicial === "string" &&
    dataInicial.length > 0 &&
    typeof dataFinal === "string" &&
    dataFinal.length > 0
  );
}

function isValidOrderRow(
  row: PedidoRow
): row is PedidoRow & { tiny_id: number; data_criacao: string } {
  return (
    typeof row.tiny_id === "number" &&
    row.tiny_id > 0 &&
    typeof row.data_criacao === "string" &&
    row.data_criacao.length > 0
  );
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("tiny_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        {
          message: "Tiny não está conectado. Faça o fluxo de autorização.",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;
    const offsetParam = Number(searchParams.get("offset"));
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
    const orderByParam = searchParams.get("orderBy");
    const orderBy = orderByParam === "asc" ? "asc" : "desc";

    const situacaoParam = searchParams.get("situacao");
    const situacaoNumber = Number(situacaoParam);
    const situacao = Number.isFinite(situacaoNumber) ? situacaoNumber : undefined;

    const tinyResponse = await listarPedidosTiny(accessToken, {
      limit,
      offset,
      orderBy,
      situacao,
    });

    return NextResponse.json(tinyResponse);
  } catch (err) {
    const details = getErrorMessage(err);
    console.error("[API] Erro em /api/tiny/pedidos", err);
    return NextResponse.json(
      {
        message: "Erro ao buscar pedidos no Tiny",
        details,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => null);

    if (!isSyncPedidosBody(payload)) {
      return NextResponse.json(
        { error: "dataInicial e dataFinal são obrigatórios" },
        { status: 400 }
      );
    }

    const { dataInicial, dataFinal } = payload;

    let accessToken: string | null = process.env.TINY_ACCESS_TOKEN ?? null;
    if (!accessToken) {
      try {
        accessToken = await getAccessTokenFromDbOrRefresh();
      } catch (tokenErr) {
        console.error("[pedidos-POST] Erro ao obter token", tokenErr);
        accessToken = null;
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "Token não disponível" },
        { status: 401 }
      );
    }

    let offset = 0;
    let totalProcessed = 0;
    let totalSaved = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const page = await listarPedidosTinyPorPeriodo(accessToken, {
          dataInicial,
          dataFinal,
          limit: TINY_PAGE_LIMIT,
          offset,
          orderBy: "desc",
        });

        const items = page.itens ?? [];
        if (items.length === 0) {
          hasMore = false;
          break;
        }

        const rows = items.map((item) => mapPedidoToOrderRow(item));
        const validRows = rows.filter(isValidOrderRow);

        if (validRows.length > 0) {
          const tinyIds = validRows.map((row) => row.tiny_id);
          const { data: existing, error: existingError } = await supabaseAdmin
            .from("tiny_orders")
            .select("tiny_id, valor_frete, canal")
            .in("tiny_id", tinyIds);

          if (existingError) {
            console.error("[pedidos-POST] Erro ao buscar pedidos existentes", existingError);
          }

          const existingMap = new Map(
            (existing ?? []).map((entry) => [entry.tiny_id, {
              valor_frete: entry.valor_frete,
              canal: entry.canal,
            }])
          );

          const mergedRows = validRows.map((row) => {
            const exists = existingMap.get(row.tiny_id);
            if (!exists) {
              return row;
            }

            return {
              ...row,
              valor_frete:
                typeof exists.valor_frete === "number" && exists.valor_frete > 0
                  ? exists.valor_frete
                  : row.valor_frete,
              canal:
                exists.canal && exists.canal !== "Outros"
                  ? exists.canal
                  : row.canal,
            };
          });

          const insertPayload = (mergedRows as unknown) as TinyOrdersInsert[];
          const { error: upsertErr } = await supabaseAdmin
            .from("tiny_orders")
            .upsert(insertPayload, { onConflict: "tiny_id" });

          if (upsertErr) {
            console.error("[pedidos-POST] Erro ao upsert batch", upsertErr);
          } else {
            totalSaved += mergedRows.length;
          }
        }

        totalProcessed += items.length;
        offset += TINY_PAGE_LIMIT;

        if (items.length < TINY_PAGE_LIMIT) {
          hasMore = false;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
      } catch (err) {
        console.error("[pedidos-POST] Erro ao buscar página", err);
        hasMore = false;
      }
    }

    return NextResponse.json({
      success: true,
      period: { dataInicial, dataFinal },
      totalProcessed,
      totalSaved,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("[pedidos-POST] Erro geral", error);
    return NextResponse.json(
      { error: message ?? "Erro ao sincronizar" },
      { status: 500 }
    );
  }
}
