// @ts-nocheck
/* eslint-disable */
// app/api/tiny/pedidos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listarPedidosTiny, listarPedidosTinyPorPeriodo } from "@/lib/tinyApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccessTokenFromDbOrRefresh } from "@/lib/tinyAuth";
import { mapPedidoToOrderRow } from "@/lib/tinyMapping";

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

    const limit = Number(searchParams.get("limit") ?? "50");
    const offset = Number(searchParams.get("offset") ?? "0");
    const orderByParam = searchParams.get("orderBy");
    const orderBy = orderByParam === "asc" ? "asc" : "desc";

    const situacaoParam = searchParams.get("situacao");
    const situacao = situacaoParam ? Number(situacaoParam) : undefined;

    const tinyResponse = await listarPedidosTiny(accessToken, {
      limit,
      offset,
      orderBy,
      situacao: Number.isFinite(situacao) ? situacao : undefined,
    });

    return NextResponse.json(tinyResponse);
  } catch (err: any) {
    console.error("[API] Erro em /api/tiny/pedidos", err);
    return NextResponse.json(
      {
        message: "Erro ao buscar pedidos no Tiny",
        details: err?.message ?? "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

/**
 * POST: Sync pedidos with valorFrete from Tiny API list endpoint
 * This is stable because valorFrete comes directly from the API
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataInicial, dataFinal } = body;

    if (!dataInicial || !dataFinal) {
      return NextResponse.json(
        { error: 'dataInicial e dataFinal são obrigatórios' },
        { status: 400 }
      );
    }

    // Get token
    let accessToken = process.env.TINY_ACCESS_TOKEN || null;
    if (!accessToken) {
      try {
        accessToken = await getAccessTokenFromDbOrRefresh();
      } catch {
        accessToken = null;
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Token não disponível' },
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
          limit: 100,  // Tiny API max limit is 100
          offset,
          orderBy: 'desc',
        });

        const items = page.itens ?? [];
        if (!items.length) {
          hasMore = false;
          break;
        }

        // Map all items using the proper mapping function
        const rows = items.map((item) => mapPedidoToOrderRow(item as any));

        // Filter valid rows
        const validRows = rows.filter((r) => r.tiny_id && r.data_criacao);

        if (validRows.length > 0) {
          // Buscar pedidos existentes para preservar campos enriquecidos
          const tinyIds = validRows.map(r => r.tiny_id);
          const { data: existing } = await supabaseAdmin
            .from('tiny_orders')
            .select('tiny_id, valor_frete, canal')
            .in('tiny_id', tinyIds);

          const existingMap = new Map(
            (existing || []).map(e => [e.tiny_id, { valor_frete: e.valor_frete, canal: e.canal }])
          );

          // Mesclar: preservar valor_frete e canal enriquecidos
          const mergedRows = validRows.map(row => {
            const exists = existingMap.get(row.tiny_id);
            if (!exists) return row; // Novo pedido, usar como está

            return {
              ...row,
              // Preservar valor_frete se já existe e é maior que zero
              valor_frete: (exists.valor_frete && exists.valor_frete > 0) 
                ? exists.valor_frete 
                : row.valor_frete,
              // Preservar canal se já existe e não é "Outros"
              canal: (exists.canal && exists.canal !== 'Outros') 
                ? exists.canal 
                : row.canal,
            };
          });

          const { error: upsertErr } = await supabaseAdmin
            .from('tiny_orders')
            .upsert(mergedRows, { onConflict: 'tiny_id' });

          if (!upsertErr) {
            totalSaved += mergedRows.length;
          } else {
            console.error('[pedidos-POST] Erro ao upsert batch:', upsertErr);
          }
        }

        totalProcessed += items.length;
        offset += 100;

        if (items.length < 100) {
          hasMore = false;
        }

        // Respect API rate limit: 120 req/min = 2 req/sec = 500ms per request
        await new Promise((r) => setTimeout(r, 600));
      } catch (err) {
        console.error('[pedidos-POST] Erro ao buscar página:', err);
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
    console.error('[pedidos-POST] Erro geral:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao sincronizar' },
      { status: 500 }
    );
  }
}
// @ts-nocheck
