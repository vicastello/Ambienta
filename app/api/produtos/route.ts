// app/api/produtos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { listProdutos } from '@/src/repositories/tinyProdutosRepository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const situacao = searchParams.get('situacao') || 'A';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { produtos, total } = await listProdutos({ search, situacao, limit, offset });

    return NextResponse.json({
      produtos,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('[API Produtos] Erro:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao buscar produtos' },
      { status: 500 }
    );
  }
}
