// app/api/produtos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { listProdutos } from '@/src/repositories/tinyProdutosRepository';
import { getErrorMessage } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const situacao = searchParams.get('situacao') || 'all';
    const tipo = searchParams.get('tipo') || 'all';
    const fornecedor = searchParams.get('fornecedor') || '';
    const limitParam = Number(searchParams.get('limit') ?? '50');
    const offsetParam = Number(searchParams.get('offset') ?? '0');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const { produtos, total } = await listProdutos({ search, situacao, tipo, fornecedor, limit, offset });

    return NextResponse.json({
      produtos,
      total,
      limit,
      offset,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error) ?? 'Erro ao buscar produtos';
    console.error('[API Produtos] Erro:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
