import { NextRequest, NextResponse } from 'next/server';
import { updateFornecedorEmbalagem } from '@/src/repositories/tinyProdutosRepository';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id_produto_tiny, fornecedor_codigo, embalagem_qtd } = body;

    if (!id_produto_tiny) {
      return NextResponse.json({ error: 'id_produto_tiny é obrigatório' }, { status: 400 });
    }

    await updateFornecedorEmbalagem({
      id_produto_tiny,
      fornecedor_codigo: fornecedor_codigo ?? null,
      embalagem_qtd: embalagem_qtd ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[API Compras/Produto] Erro:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao salvar produto' },
      { status: 500 }
    );
  }
}
