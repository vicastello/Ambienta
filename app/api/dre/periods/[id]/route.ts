import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import {
  getPeriodDetail,
  deletePeriod,
  updatePeriod,
  upsertValues,
} from '@/src/repositories/dreRepository';

const isUuid = (value: string | undefined): value is string =>
  !!value && /^[0-9a-fA-F-]{36}$/.test(value);

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const sanitizeValues = (input: unknown) => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const categoryId = typeof raw.categoryId === 'string' ? raw.categoryId : null;
      if (!categoryId) return null;
      const amountManual = toNullableNumber(raw.amountManual);
      const notes = typeof raw.notes === 'string' ? raw.notes : null;
      return { categoryId, amountManual, notes };
    })
    .filter(Boolean) as { categoryId: string; amountManual: number | null; notes: string | null }[];
};

type Params = { params: Promise<{ id: string }> | { id: string } };

const unwrapParams = async (params: Params['params']): Promise<{ id: string }> => {
  return params instanceof Promise ? params : Promise.resolve(params);
};

export async function GET(_req: NextRequest, ctx: Params) {
  try {
    const { id } = await unwrapParams(ctx.params);
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'ID do período inválido.' }, { status: 400 });
    }
    const detail = await getPeriodDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao carregar o período da DRE.';
    console.error('[API DRE][GET /periods/:id]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Params) {
  try {
    const { id } = await unwrapParams(ctx.params);
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'ID do período inválido.' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    await updatePeriod(id, {
      status: body.status === 'closed' || body.status === 'draft' ? body.status : undefined,
      target_net_margin: toNullableNumber(body.target_net_margin),
      reserve_percent: toNullableNumber(body.reserve_percent),
      label: typeof body.label === 'string' ? body.label : undefined,
    });

    const values = sanitizeValues(body.values);
    if (values.length) {
      await upsertValues(id, values);
    }

    const detail = await getPeriodDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao atualizar o período da DRE.';
    console.error('[API DRE][PUT /periods/:id]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  try {
    const { id } = await unwrapParams(ctx.params);
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'ID do período inválido.' }, { status: 400 });
    }
    await deletePeriod(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao excluir o período da DRE.';
    console.error('[API DRE][DELETE /periods/:id]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
