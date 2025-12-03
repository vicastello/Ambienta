import { NextRequest, NextResponse } from 'next/server';
import { refreshProdutoFromTiny } from '@/src/lib/sync/refreshSingleProduto';
import { getErrorMessage } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const produtoId = Number(body?.produtoId ?? body?.id ?? body?.id_produto_tiny);
    if (!Number.isFinite(produtoId) || produtoId <= 0) {
      return NextResponse.json({ error: 'produtoId inválido' }, { status: 400 });
    }

    const enrichEstoque = body?.enrichEstoque !== false;
    const result = await refreshProdutoFromTiny(produtoId, { enrichEstoque });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Produtos refresh] erro', error);
    return NextResponse.json(
      { error: getErrorMessage(error) ?? 'Erro ao atualizar produto' },
      { status: 500 }
    );
  }
}
