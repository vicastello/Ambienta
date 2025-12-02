import { NextRequest, NextResponse } from 'next/server';
import { TinyProdutoNotFoundError, updateFornecedorEmbalagem } from '@/src/repositories/tinyProdutosRepository';
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
  let idProdutoTiny: number | null = null;
  try {
    const rawBody = await req.json().catch(() => null);
    const body: UpdateFornecedorBody = isRecord(rawBody) ? (rawBody as UpdateFornecedorBody) : {};
    const rawFornecedorCodigo = isRecord(rawBody)
      ? (('fornecedor_codigo' in rawBody ? rawBody.fornecedor_codigo : null) as string | number | null)
      : null;
    const rawEmbalagem = isRecord(rawBody)
      ? (('embalagem_qtd' in rawBody ? rawBody.embalagem_qtd : null) as string | number | null)
      : null;
    const rawObservacao = isRecord(rawBody)
      ? (('observacao_compras' in rawBody ? rawBody.observacao_compras : null) as string | null)
      : null;
    const idProdutoTinyValue = typeof body.id_produto_tiny === 'string'
      ? Number(body.id_produto_tiny)
      : body.id_produto_tiny;
    idProdutoTiny = Number.isFinite(idProdutoTinyValue) ? Number(idProdutoTinyValue) : null;
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

    if (idProdutoTiny == null) {
      return NextResponse.json({ error: 'id_produto_tiny é obrigatório' }, { status: 400 });
    }

    console.info('[API Compras/Produto] Payload recebido', {
      raw_id_produto_tiny: isRecord(rawBody) ? rawBody.id_produto_tiny ?? null : null,
      parsed_id_produto_tiny: idProdutoTiny,
      raw_fornecedor_codigo: rawFornecedorCodigo,
      sanitized_fornecedor_codigo: fornecedorCodigo,
      raw_embalagem_qtd: rawEmbalagem,
      sanitized_embalagem_qtd: embalagemQtd,
      raw_observacao_length: typeof rawObservacao === 'string' ? rawObservacao.length : null,
      sanitized_has_observacao: Boolean(observacaoCompras),
    });

    console.info('[API Compras/Produto] Atualizando produto manualmente', {
      id_produto_tiny: idProdutoTiny,
      fornecedor_codigo: fornecedorCodigo ?? null,
      embalagem_qtd: embalagemQtd,
      has_observacao: Boolean(observacaoCompras),
    });

    await updateFornecedorEmbalagem({
      id_produto_tiny: idProdutoTiny,
      fornecedor_codigo: fornecedorCodigo,
      embalagem_qtd: embalagemQtd,
      observacao_compras: observacaoCompras,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof TinyProdutoNotFoundError) {
      console.warn('[API Compras/Produto] Produto não encontrado ao salvar campos manuais', {
        id_produto_tiny: idProdutoTiny,
      });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const message = getErrorMessage(error) ?? 'Erro ao salvar produto';
    console.error('[API Compras/Produto] Erro:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
