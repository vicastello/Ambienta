import { NextRequest, NextResponse } from 'next/server';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { sincronizarItensPorPedidos } from '@/lib/pedidoItensHelper';
import { getErrorMessage } from '@/lib/errors';

type SyncItensBody = {
  tinyId?: number | string;
  tinyIds?: Array<number | string>;
  force?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    const body: SyncItensBody = isRecord(rawBody) ? (rawBody as SyncItensBody) : {};
    const tinyId = body.tinyId;
    const tinyIdsBody = Array.isArray(body.tinyIds) ? body.tinyIds : undefined;
    const force = body.force === true;

    const tinyIds: number[] = [];
    const tinyIdNumber = typeof tinyId === 'number' ? tinyId : typeof tinyId === 'string' ? Number(tinyId) : null;
    if (Number.isFinite(tinyIdNumber)) {
      tinyIds.push(Number(tinyIdNumber));
    }
    if (tinyIdsBody) {
      for (const val of tinyIdsBody) {
        const parsed = typeof val === 'number' ? val : typeof val === 'string' ? Number(val) : NaN;
        if (Number.isFinite(parsed)) {
          tinyIds.push(Number(parsed));
        }
      }
    }

    if (!tinyIds.length) {
      return NextResponse.json(
        { error: 'Informe tinyId ou tinyIds' },
        { status: 400 }
      );
    }

    const accessToken = await getAccessTokenFromDbOrRefresh();
    const result = await sincronizarItensPorPedidos(accessToken, tinyIds, { force });

    return NextResponse.json({
      success: true,
      input: { tinyIds },
      result,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error) ?? 'Erro ao sincronizar itens';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
