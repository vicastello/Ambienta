import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { sincronizarItensPorPedidos } from '@/lib/pedidoItensHelper';

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
    const body = (await req.json().catch(() => ({}))) as Body;

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

      tinyIds = (data ?? []).map((r: any) => Number(r.tiny_id)).filter(Boolean);
    } else if (body.mode === 'numero' && body.numeroPedido) {
      const numero = String(body.numeroPedido);
      // Try to find by local numero_pedido first
      let { data } = await supabaseAdmin
        .from('tiny_orders')
        .select('id, tiny_id, numero_pedido')
        .eq('numero_pedido', numero)
        .limit(1);

      if (!data || data.length === 0) {
        // Fallback: search by raw JSON field if present (ecommerce.numeroPedidoEcommerce)
        const { data: data2 } = await supabaseAdmin
          .from('tiny_orders')
          .select('id, tiny_id, raw')
          .filter("raw->>ecommerce", 'cs', numero)
          .limit(1);

        if (data2 && data2.length) {
          tinyIds = [Number(data2[0].tiny_id)];
        }
      } else {
        tinyIds = [Number((data as any)[0].tiny_id)];
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
  } catch (err: any) {
    console.error('[API] /api/tiny/enrich erro', err);
    return NextResponse.json({ message: 'Erro ao enriquecer pedidos.', details: err?.message }, { status: 500 });
  }
}
