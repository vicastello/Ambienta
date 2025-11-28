import { NextResponse } from 'next/server';
import { callInternalJson } from '@/lib/internalApi';

function sanitizeLimit(value: unknown, fallback: number) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      enrichEstoque?: boolean;
    };

    const limit = sanitizeLimit(body?.limit, 30);
    const enrichEstoque = typeof body?.enrichEstoque === 'boolean' ? body.enrichEstoque : true;

    const result = await callInternalJson('/api/produtos/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit, enrichEstoque, modoCron: false }),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    const detail = error?.message ?? 'Erro inesperado';
    return NextResponse.json(
      { ok: false, message: 'Falha ao sincronizar produtos', detail },
      { status: 500 }
    );
  }
}
