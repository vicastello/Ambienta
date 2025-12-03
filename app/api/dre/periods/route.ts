import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import {
  listPeriodsWithSummary,
  upsertPeriod,
} from '@/src/repositories/dreRepository';

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export async function GET() {
  try {
    const periods = await listPeriodsWithSummary();
    return NextResponse.json({ periods });
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao listar períodos da DRE.';
    console.error('[API DRE][GET /periods]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return NextResponse.json({ error: 'Ano e mês são obrigatórios.' }, { status: 400 });
    }

    const period = await upsertPeriod({
      year,
      month,
      label: typeof body.label === 'string' ? body.label : undefined,
      target_net_margin: toNullableNumber(body.target_net_margin),
      reserve_percent: toNullableNumber(body.reserve_percent),
      status:
        body.status === 'closed' || body.status === 'draft' ? body.status : undefined,
    });

    return NextResponse.json({ period });
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao criar/atualizar período.';
    console.error('[API DRE][POST /periods]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
