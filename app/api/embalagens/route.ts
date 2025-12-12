import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import {
  listEmbalagens,
  createEmbalagem,
  getEmbalagemByCodigo,
} from '@/src/repositories/embalagensRepository';
import type { EmbalagemInput } from '@/src/types/embalagens';

/**
 * GET /api/embalagens
 * Lista todas as embalagens
 */
export async function GET() {
  try {
    const embalagens = await listEmbalagens();
    return NextResponse.json({ embalagens });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao listar embalagens';
    console.error('[API Embalagens][GET]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/embalagens
 * Cria uma nova embalagem
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Validações
    const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : '';
    if (!codigo) {
      return NextResponse.json({ error: 'O código da embalagem é obrigatório.' }, { status: 400 });
    }

    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    if (!nome) {
      return NextResponse.json({ error: 'O nome da embalagem é obrigatório.' }, { status: 400 });
    }

    const altura = Number(body.altura);
    if (!Number.isFinite(altura) || altura <= 0) {
      return NextResponse.json({ error: 'A altura deve ser um número maior que zero.' }, { status: 400 });
    }

    const largura = Number(body.largura);
    if (!Number.isFinite(largura) || largura <= 0) {
      return NextResponse.json({ error: 'A largura deve ser um número maior que zero.' }, { status: 400 });
    }

    const comprimento = Number(body.comprimento);
    if (!Number.isFinite(comprimento) || comprimento <= 0) {
      return NextResponse.json({ error: 'O comprimento deve ser um número maior que zero.' }, { status: 400 });
    }

    const preco_unitario = Number(body.preco_unitario);
    if (!Number.isFinite(preco_unitario) || preco_unitario < 0) {
      return NextResponse.json({ error: 'O preço unitário deve ser um número maior ou igual a zero.' }, { status: 400 });
    }

    const estoque_atual = Number(body.estoque_atual);
    if (!Number.isFinite(estoque_atual) || estoque_atual < 0) {
      return NextResponse.json({ error: 'O estoque atual deve ser um número maior ou igual a zero.' }, { status: 400 });
    }

    // Verificar se já existe embalagem com este código
    const existente = await getEmbalagemByCodigo(codigo);
    if (existente) {
      return NextResponse.json({ error: 'Já existe uma embalagem com este código.' }, { status: 400 });
    }

    const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';

    const input: EmbalagemInput = {
      codigo,
      nome,
      descricao: descricao || undefined,
      altura,
      largura,
      comprimento,
      preco_unitario,
      estoque_atual,
    };

    const embalagem = await createEmbalagem(input);

    return NextResponse.json({ embalagem }, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao criar embalagem';
    console.error('[API Embalagens][POST]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
