import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { sincronizarItensPorPedidos } from '@/lib/pedidoItensHelper';
import { getErrorMessage } from '@/lib/errors';

type RetryBody = {
  limit?: number;
  tinyIds?: number[];
  since?: string;
  force?: boolean;
};

type PedidoItemRow = {
  id_pedido: number;
  codigo_produto: string | null;
  id_produto_tiny: number | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const body: RetryBody = isRecord(rawBody) ? (rawBody as RetryBody) : {};
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(100, Number(body.limit))) : 30;
    const force = body.force !== false; // default true

    let targetTinyIds: number[] = [];

    if (Array.isArray(body.tinyIds) && body.tinyIds.length) {
      targetTinyIds = body.tinyIds
        .map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : null))
        .filter((v): v is number => Number.isFinite(v));
    } else {
      // buscar pedidos sem itens ou sem código/id
      let query = supabaseAdmin
        .from('tiny_orders')
        .select('id,tiny_id')
        .order('tiny_id', { ascending: false })
        .limit(limit);

      if (typeof body.since === 'string' && body.since.trim()) {
        query = query.gte('data_criacao', body.since.trim());
      }

      const { data: pedidos, error } = await query;
      if (error) throw error;
      const idsPedidos = (pedidos ?? []).map((p) => p.id);

      const { data: itensData, error: itensError } = await supabaseAdmin
        .from('tiny_pedido_itens')
        .select('id_pedido,codigo_produto,id_produto_tiny')
        .in('id_pedido', idsPedidos);
      if (itensError) throw itensError;

      const itensByPedido = new Map<number, PedidoItemRow[]>();
      (itensData ?? []).forEach((row) => {
        const arr = itensByPedido.get(row.id_pedido) ?? [];
        arr.push(row);
        itensByPedido.set(row.id_pedido, arr);
      });

      const missing = (pedidos ?? [])
        .filter((p) => {
          const itens = itensByPedido.get(p.id) ?? [];
          if (!itens.length) return true;
          const hasCode = itens.some((it) => typeof it.codigo_produto === 'string' && it.codigo_produto.trim());
          const hasId = itens.some((it) => typeof it.id_produto_tiny === 'number');
          return !hasCode && !hasId;
        })
        .map((p) => p.tiny_id)
        .filter((v): v is number => Number.isFinite(v));

      targetTinyIds = missing.slice(0, limit);
    }

    if (!targetTinyIds.length) {
      return NextResponse.json({ ok: true, message: 'Nenhum pedido pendente de itens' });
    }

    const accessToken = await getAccessTokenFromDbOrRefresh();
    const result = await sincronizarItensPorPedidos(accessToken, targetTinyIds, {
      force,
      retries: 2,
      delayMs: 800,
    });

    return NextResponse.json({
      ok: true,
      input: targetTinyIds,
      result,
    });
  } catch (err: unknown) {
    const msg = getErrorMessage(err) ?? 'Erro inesperado';
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
