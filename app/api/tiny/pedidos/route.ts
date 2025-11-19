// app/api/tiny/pedidos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listarPedidosTiny, listarPedidosTinyPorPeriodo } from "@/lib/tinyApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccessTokenFromDbOrRefresh } from "@/lib/tinyAuth";

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

        // Save orders with valorFrete from list endpoint
        for (const item of items) {
          try {
            const tinyId = (item as any).id;
            const dataCriacao = (item as any).dataCriacao;

            if (!tinyId || !dataCriacao) continue;

            // Fetch existing order to merge data
            const { data: existing } = await supabaseAdmin
              .from('tiny_orders')
              .select('raw')
              .eq('tiny_id', tinyId)
              .single();

            // Merge: preserve enriched fields but update with new data
            const existingRaw = existing?.raw ?? {};
            const newRaw = item as any;
            const mergedRaw = {
              ...newRaw,
              // Only preserve enriched fields that came from detailed API if they exist
              // but DO NOT override valorFrete from the list API (which is current)
              ...(existingRaw.valorTotalPedido !== undefined && !newRaw.valorTotalPedido && { valorTotalPedido: existingRaw.valorTotalPedido }),
              ...(existingRaw.valorTotalProdutos !== undefined && !newRaw.valorTotalProdutos && { valorTotalProdutos: existingRaw.valorTotalProdutos }),
            };

            const { error: upsertErr } = await supabaseAdmin
              .from('tiny_orders')
              .upsert(
                {
                  tiny_id: tinyId,
                  data_criacao: dataCriacao,
                  situacao: (item as any).situacao,
                  raw: mergedRaw,
                },
                { onConflict: 'tiny_id' }
              );

            if (!upsertErr) {
              totalSaved++;
            }
          } catch (err) {
            console.warn('[pedidos-POST] Erro ao processar item:', err);
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