import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { fixMissingPedidoItens } from '@/lib/fixMissingPedidoItens';
import type { Json } from '@/src/types/db-public';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DIAS = 3;
const DEFAULT_LIMIT = 400;

async function logJob(payload: { level: 'info' | 'warn' | 'debug' | 'error'; message: string; meta?: Json }) {
  await supabaseAdmin.from('sync_logs').insert({
    job_id: null,
    level: payload.level,
    message: payload.message,
    meta: payload.meta ?? null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const secret = (body.secret as string | undefined) ?? req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'secret inválido' }, { status: 401 });
  }

  const diasRaw = Number(body.dias ?? DEFAULT_DIAS);
  const dias = Number.isFinite(diasRaw) && diasRaw > 0 ? diasRaw : DEFAULT_DIAS;
  const limitRaw = Number(body.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT;
  const force = body.force === true;

  const since = new Date(Date.now() - dias * DAY_MS);
  const accessToken = await getAccessTokenFromDbOrRefresh();

  const { orders, result } = await fixMissingPedidoItens(accessToken, {
    since,
    limit,
    force,
    delayMs: 900,
    retries: 2,
    context: 'cron_fix_missing_itens',
  });

  await logJob({
    level: 'info',
    message: 'Cron fixMissingPedidoItens executado',
    meta: {
      dias,
      limit,
      force,
      pedidosEncontrados: orders.length,
      result,
    },
  });

  return NextResponse.json({
    success: true,
    dias,
    limit,
    pedidosFixados: orders.length,
    result,
  });
}
