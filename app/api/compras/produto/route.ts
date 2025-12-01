import { NextRequest, NextResponse } from 'next/server';
import { updateFornecedorEmbalagem } from '@/src/repositories/tinyProdutosRepository';
import { getErrorMessage } from '@/lib/errors';

type UpdateFornecedorBody = {
  id_produto_tiny?: number | string;
  fornecedor_codigo?: string | null;
  embalagem_qtd?: number | string | null;
  observacao_compras?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function PATCH(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    const body: UpdateFornecedorBody = isRecord(rawBody) ? (rawBody as UpdateFornecedorBody) : {};
    const idProdutoTiny = typeof body.id_produto_tiny === 'string'
      ? Number(body.id_produto_tiny)
      : body.id_produto_tiny;
    const fornecedorCodigo = typeof body.fornecedor_codigo === 'string' && body.fornecedor_codigo.trim().length > 0
      ? body.fornecedor_codigo
      : null;
    const observacaoCompras = typeof body.observacao_compras === 'string' && body.observacao_compras.trim().length > 0
      ? body.observacao_compras
      : null;
    const embalagemQtdRaw = typeof body.embalagem_qtd === 'string'
      ? Number(body.embalagem_qtd)
      : body.embalagem_qtd ?? null;
    const embalagemQtd =
      typeof embalagemQtdRaw === 'number' && Number.isFinite(embalagemQtdRaw)
        ? embalagemQtdRaw
        : null;

    if (!Number.isFinite(idProdutoTiny)) {
      return NextResponse.json({ error: 'id_produto_tiny é obrigatório' }, { status: 400 });
    }

    await updateFornecedorEmbalagem({
      id_produto_tiny: Number(idProdutoTiny),
      fornecedor_codigo: fornecedorCodigo,
      embalagem_qtd: embalagemQtd,
      observacao_compras: observacaoCompras,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error) ?? 'Erro ao salvar produto';
    console.error('[API Compras/Produto] Erro:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
