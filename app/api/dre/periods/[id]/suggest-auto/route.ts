import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { suggestAutoValuesForPeriod } from '@/src/repositories/dreRepository';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const detail = await suggestAutoValuesForPeriod(params.id);
    return NextResponse.json(detail);
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao sugerir valores automáticos.';
    console.error('[API DRE][POST /periods/:id/suggest-auto]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
