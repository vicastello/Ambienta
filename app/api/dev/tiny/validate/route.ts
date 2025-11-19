// app/api/dev/tiny/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { TinyPedidoListaItem } from '@/lib/tinyApi';
import { filtrarEMapearPedidos } from '@/lib/tinyMapping';

/**
 * Endpoint de validação de mapeamento Tiny v3.
 * Use para enviar um JSON de exemplo (copiado do Swagger/response real)
 * e ver como os campos estão sendo mapeados para a tabela tiny_orders.
 *
 * POST /api/dev/tiny/validate?dataInicial=YYYY-MM-DD&dataFinal=YYYY-MM-DD
 * Body (application/json):
 *   {
 *     "itens": [ { ...pedido v3... }, ...],
 *     "paginacao": { ... } // opcional
 *   }
 * Também aceita um único objeto de pedido ou um array puro de pedidos.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dataInicial = searchParams.get('dataInicial') || undefined;
    const dataFinal = searchParams.get('dataFinal') || undefined;

    const bodyText = await req.text();
    if (!bodyText) {
      return NextResponse.json(
        { message: 'Envie o JSON do Tiny no corpo da requisição.' },
        { status: 400 }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      return NextResponse.json(
        { message: 'Body não é um JSON válido.' },
        { status: 400 }
      );
    }

    let itens: TinyPedidoListaItem[] = [];
    if (Array.isArray(payload)) {
      itens = payload as TinyPedidoListaItem[];
    } else if (payload && Array.isArray(payload.itens)) {
      itens = payload.itens as TinyPedidoListaItem[];
    } else if (payload && typeof payload === 'object') {
      itens = [payload as TinyPedidoListaItem];
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json(
        { message: 'Nenhum item de pedido encontrado no JSON enviado.' },
        { status: 400 }
      );
    }

    const rows = filtrarEMapearPedidos(itens, { dataInicial, dataFinal });

    // Coleta chaves de topo presentes nos pedidos recebidos para conferência rápida
    const chavesTopo = new Set<string>();
    for (const p of itens) {
      Object.keys(p || {}).forEach((k) => chavesTopo.add(k));
    }

    return NextResponse.json({
      recebido: {
        quantidadeItens: itens.length,
        chavesTopo: Array.from(chavesTopo),
        filtradoPor: { dataInicial: dataInicial ?? null, dataFinal: dataFinal ?? null },
      },
      mapeado: {
        quantidade: rows.length,
        exemploPrimeiro: rows[0] ?? null,
        rows,
      },
    });
  } catch (err: any) {
    console.error('[dev/tiny/validate] Erro', err);
    return NextResponse.json(
      { message: 'Erro interno ao validar JSON', details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
