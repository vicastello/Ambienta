import { NextResponse } from 'next/server';
import { getProdutosSyncCursor, resetProdutosSyncCursor } from '@/src/repositories/produtosCursorRepository';
import { getErrorMessage } from '@/lib/errors';

export async function POST() {
  const cursorKey = 'catalog';

  try {
    const before = await getProdutosSyncCursor(cursorKey);
    const after = await resetProdutosSyncCursor(cursorKey);

    return NextResponse.json({
      ok: true,
      before,
      after,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error) ?? 'Erro ao resetar cursor';
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    );
  }
}
