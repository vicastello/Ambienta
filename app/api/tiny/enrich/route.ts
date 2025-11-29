import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { sincronizarItensPorPedidos } from '@/lib/pedidoItensHelper';
import { getErrorMessage } from '@/lib/errors';

type Body = {
  mode?: 'last' | 'numero';
  last?: number;
  numeroPedido?: string;
  tinyIds?: number[];
  // desired delay between requests in ms (optional). Use ~500 for 120 req/min
  delayMs?: number;
};

export async function POST(req: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = {};
    }
    const body = isRecord(rawBody) ? (rawBody as Body) : {};

    let tinyIds: number[] = [];

    if (Array.isArray(body.tinyIds) && body.tinyIds.length) {
      tinyIds = body.tinyIds.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    } else if (body.mode === 'last') {
      const last = Number(body.last ?? 10) || 10;
      const { data } = await supabaseAdmin
        .from('tiny_orders')
        .select('tiny_id')
        .order('data_criacao', { ascending: false })
        .limit(Math.max(1, Math.min(1000, last)));

      tinyIds = (data ?? [])
        .map((row) => row.tiny_id)
        .filter((value): value is number => typeof value === 'number');
    } else if (body.mode === 'numero' && body.numeroPedido) {
      const numeroStr = String(body.numeroPedido);
      const numeroValue = Number(numeroStr);
      let data: { tiny_id: number | null }[] | null = null;

      if (Number.isFinite(numeroValue)) {
        const selectResult = await supabaseAdmin
          .from('tiny_orders')
          .select('id, tiny_id, numero_pedido')
          .eq('numero_pedido', numeroValue)
          .limit(1);
        data = selectResult.data;
      }

      if (!data || data.length === 0) {
        // Fallback: search by raw JSON field if present (ecommerce.numeroPedidoEcommerce)
        const { data: data2 } = await supabaseAdmin
          .from('tiny_orders')
          .select('id, tiny_id, raw')
          .filter('raw->>ecommerce', 'cs', numeroStr)
          .limit(1);

        if (data2 && data2.length) {
          const candidate = data2[0].tiny_id;
          if (typeof candidate === 'number') tinyIds = [candidate];
        }
      } else {
        const candidate = data[0].tiny_id;
        if (typeof candidate === 'number') tinyIds = [candidate];
      }
    }

    if (!tinyIds.length) {
      return NextResponse.json({ message: 'Nenhum pedido encontrado para enriquecer.' }, { status: 400 });
    }

    const accessToken = await getAccessTokenFromDbOrRefresh();
    if (!accessToken) {
      return NextResponse.json({ message: 'Tiny não está conectado.' }, { status: 401 });
    }

    // delayMs default keeps previous behavior (600ms). Caller can request ~500ms for 120req/min
    const delayMs = typeof body.delayMs === 'number' ? body.delayMs : undefined;

    const result = await sincronizarItensPorPedidos(accessToken, tinyIds, { delayMs });

    return NextResponse.json({ success: true, tinyIds, result });
  } catch (err: unknown) {
    console.error('[API] /api/tiny/enrich erro', err);
    return NextResponse.json({ message: 'Erro ao enriquecer pedidos.', details: getErrorMessage(err) || 'Erro desconhecido' }, { status: 500 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
