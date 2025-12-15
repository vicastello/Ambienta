import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { listEmbalagensByProdutoIds } from '@/src/repositories/produtoEmbalagensRepository';
import type { ProdutoEmbalagem } from '@/src/types/embalagens';

type ProdutoEmbalagemWithEmbalagem = ProdutoEmbalagem & { embalagem?: unknown };

/**
 * GET /api/produtos/embalagens/batch?ids=1,2,3
 * Retorna embalagens agrupadas por produto_id
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const idsParam = url.searchParams.get('ids') || '';

    const ids = idsParam
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v > 0);

    if (ids.length === 0) {
      return NextResponse.json({ embalagensByProdutoId: {} });
    }

    const links = (await listEmbalagensByProdutoIds(ids)) as unknown as ProdutoEmbalagemWithEmbalagem[];

    const embalagensByProdutoId: Record<number, ProdutoEmbalagemWithEmbalagem[]> = {};
    for (const id of ids) embalagensByProdutoId[id] = [];

    for (const link of links) {
      const produtoId = Number(link.produto_id);
      if (!Number.isFinite(produtoId)) continue;
      if (!embalagensByProdutoId[produtoId]) embalagensByProdutoId[produtoId] = [];
      embalagensByProdutoId[produtoId].push(link);
    }

    return NextResponse.json({ embalagensByProdutoId });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao listar embalagens (batch)';
    console.error('[API Produtos/Embalagens/Batch][GET]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
