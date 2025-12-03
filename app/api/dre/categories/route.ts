import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { createCustomCategory, listCategories } from '@/src/repositories/dreRepository';

export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao listar categorias da DRE.';
    console.error('[API DRE][GET /categories]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Nome da categoria é obrigatório.' }, { status: 400 });
    }

    const sign = body.sign === 'ENTRADA' || body.sign === 'SAIDA' ? body.sign : null;
    const groupType = [
      'RECEITA',
      'CUSTO_VARIAVEL',
      'DESPESA_FIXA',
      'DESPESA_OPERACIONAL',
      'OUTROS',
    ].includes(body.group_type)
      ? (body.group_type as
          | 'RECEITA'
          | 'CUSTO_VARIAVEL'
          | 'DESPESA_FIXA'
          | 'DESPESA_OPERACIONAL'
          | 'OUTROS')
      : null;

    if (!sign || !groupType) {
      return NextResponse.json(
        { error: 'Informe sign (ENTRADA/SAIDA) e group_type válidos.' },
        { status: 400 }
      );
    }

    const category = await createCustomCategory({
      name,
      sign,
      group_type: groupType,
      channel: typeof body.channel === 'string' ? body.channel : null,
      parent_code: typeof body.parent_code === 'string' ? body.parent_code : null,
    });

    return NextResponse.json({ category });
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao criar categoria.';
    console.error('[API DRE][POST /categories]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
