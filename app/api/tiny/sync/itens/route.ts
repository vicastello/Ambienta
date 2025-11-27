// @ts-nocheck
/* eslint-disable */
// app/api/tiny/sync/itens/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { sincronizarItensPorPedidos } from '@/lib/pedidoItensHelper';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tinyId: number | null = body.tinyId ?? null;
    const tinyIdsBody: any[] | undefined = Array.isArray(body.tinyIds) ? body.tinyIds : undefined;

    const tinyIds: number[] = [];
    if (typeof tinyId === 'number') tinyIds.push(tinyId);
    if (tinyIdsBody) {
      for (const val of tinyIdsBody) {
        const n = Number(val);
        if (Number.isFinite(n)) tinyIds.push(n);
      }
    }

    if (!tinyIds.length) {
      return NextResponse.json(
        { error: 'Informe tinyId ou tinyIds' },
        { status: 400 }
      );
    }

    const accessToken = await getAccessTokenFromDbOrRefresh();
    const result = await sincronizarItensPorPedidos(accessToken!, tinyIds);

    return NextResponse.json({
      success: true,
      input: { tinyIds },
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Erro ao sincronizar itens' },
      { status: 500 }
    );
  }
}
// @ts-nocheck
