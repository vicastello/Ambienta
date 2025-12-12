import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import {
  getEmbalagemById,
  updateEmbalagem,
  deleteEmbalagem,
} from '@/src/repositories/embalagensRepository';
import type { EmbalagemUpdate } from '@/src/types/embalagens';

/**
 * GET /api/embalagens/[id]
 * Busca uma embalagem por ID
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const embalagem = await getEmbalagemById(id);
    return NextResponse.json({ embalagem });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao buscar embalagem';
    console.error('[API Embalagens][GET by ID]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/embalagens/[id]
 * Atualiza uma embalagem existente
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const update: EmbalagemUpdate = {};

    // Código
    if (body.codigo !== undefined) {
      const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : '';
      if (!codigo) {
        return NextResponse.json({ error: 'O código não pode ficar vazio.' }, { status: 400 });
      }
      update.codigo = codigo;
    }

    // Nome
    if (body.nome !== undefined) {
      const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
      if (!nome) {
        return NextResponse.json({ error: 'O nome não pode ficar vazio.' }, { status: 400 });
      }
      update.nome = nome;
    }

    // Descrição
    if (body.descricao !== undefined) {
      update.descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
    }

    // Altura
    if (body.altura !== undefined) {
      const altura = Number(body.altura);
      if (!Number.isFinite(altura) || altura <= 0) {
        return NextResponse.json({ error: 'A altura deve ser um número maior que zero.' }, { status: 400 });
      }
      update.altura = altura;
    }

    // Largura
    if (body.largura !== undefined) {
      const largura = Number(body.largura);
      if (!Number.isFinite(largura) || largura <= 0) {
        return NextResponse.json({ error: 'A largura deve ser um número maior que zero.' }, { status: 400 });
      }
      update.largura = largura;
    }

    // Comprimento
    if (body.comprimento !== undefined) {
      const comprimento = Number(body.comprimento);
      if (!Number.isFinite(comprimento) || comprimento <= 0) {
        return NextResponse.json({ error: 'O comprimento deve ser um número maior que zero.' }, { status: 400 });
      }
      update.comprimento = comprimento;
    }

    // Preço unitário
    if (body.preco_unitario !== undefined) {
      const preco_unitario = Number(body.preco_unitario);
      if (!Number.isFinite(preco_unitario) || preco_unitario < 0) {
        return NextResponse.json({ error: 'O preço unitário deve ser um número maior ou igual a zero.' }, { status: 400 });
      }
      update.preco_unitario = preco_unitario;
    }

    // Estoque atual
    if (body.estoque_atual !== undefined) {
      const estoque_atual = Number(body.estoque_atual);
      if (!Number.isFinite(estoque_atual) || estoque_atual < 0) {
        return NextResponse.json({ error: 'O estoque atual deve ser um número maior ou igual a zero.' }, { status: 400 });
      }
      update.estoque_atual = estoque_atual;
    }

    const embalagem = await updateEmbalagem(id, update);

    return NextResponse.json({ embalagem });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao atualizar embalagem';
    console.error('[API Embalagens][PUT]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/embalagens/[id]
 * Deleta uma embalagem
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await deleteEmbalagem(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao deletar embalagem';
    console.error('[API Embalagens][DELETE]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
