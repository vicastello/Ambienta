import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import {
  listEmbalagensByProdutoId,
  vincularEmbalagem,
  desvincularEmbalagem,
} from '@/src/repositories/produtoEmbalagensRepository';
import type { ProdutoEmbalagemInput } from '@/src/types/embalagens';

/**
 * GET /api/produtos/[id]/embalagens
 * Lista embalagens vinculadas a um produto
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const produtoId = Number(id);

    if (!Number.isFinite(produtoId)) {
      return NextResponse.json({ error: 'ID do produto inválido' }, { status: 400 });
    }

    const embalagens = await listEmbalagensByProdutoId(produtoId);
    return NextResponse.json({ embalagens });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao listar embalagens do produto';
    console.error('[API Produtos/Embalagens][GET]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/produtos/[id]/embalagens
 * Vincula uma embalagem a um produto
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const produtoId = Number(id);

    if (!Number.isFinite(produtoId)) {
      return NextResponse.json({ error: 'ID do produto inválido' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const embalagemId = typeof body.embalagem_id === 'string' ? body.embalagem_id.trim() : '';
    if (!embalagemId) {
      return NextResponse.json({ error: 'ID da embalagem é obrigatório' }, { status: 400 });
    }

    const quantidade = Number(body.quantidade) || 1;
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: 'Quantidade deve ser maior que zero' }, { status: 400 });
    }

    const input: ProdutoEmbalagemInput = {
      produto_id: produtoId,
      embalagem_id: embalagemId,
      quantidade,
    };

    const vinculo = await vincularEmbalagem(input);

    return NextResponse.json({ vinculo }, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao vincular embalagem';
    console.error('[API Produtos/Embalagens][POST]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/produtos/[id]/embalagens/[embalagemId]
 * Remove vínculo de embalagem com produto
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const produtoId = Number(id);

    if (!Number.isFinite(produtoId)) {
      return NextResponse.json({ error: 'ID do produto inválido' }, { status: 400 });
    }

    const url = new URL(req.url);
    const embalagemId = url.searchParams.get('embalagem_id');

    if (!embalagemId) {
      return NextResponse.json({ error: 'ID da embalagem é obrigatório' }, { status: 400 });
    }

    await desvincularEmbalagem(produtoId, embalagemId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao desvincular embalagem';
    console.error('[API Produtos/Embalagens][DELETE]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
