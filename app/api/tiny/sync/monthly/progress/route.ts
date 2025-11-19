import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { listarPedidosTinyPorPeriodo, TinyApiError } from '@/lib/tinyApi';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';

function lastDayOfMonth(year: number, month: number): string {
  // month: 1-12
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const year = Number(searchParams.get('year') ?? new Date().getFullYear());
    const monthsParam = searchParams.get('months'); // e.g., "1,2,3"
    const months = monthsParam
      ? monthsParam
          .split(',')
          .map((m) => Number(m))
          .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12)
      : [new Date().getMonth() + 1]; // mês atual se não informado

    // Only hit Tiny if explicitly requested (to avoid 429 and keep UI fast)
    const includeTiny = (searchParams.get('includeTiny') || '').toLowerCase();
    const shouldCallTiny = includeTiny === '1' || includeTiny === 'true';

    let accessToken: string | null = null;
    if (shouldCallTiny) {
      accessToken = req.cookies.get('tiny_access_token')?.value || null;
      if (!accessToken) {
        try { accessToken = await getAccessTokenFromDbOrRefresh(); } catch { accessToken = null; }
      }
    }

    const results: Array<{
      year: number;
      month: number;
      start: string;
      end: string;
      db_count: number;
      tiny_total: number | null;
      percent: number | null;
    }> = [];

    for (const month of months) {
      const start = `${year}-${pad2(month)}-01`;
      const end = lastDayOfMonth(year, month);

      // Count in DB
      const { count, error: countError } = await supabaseAdmin
        .from('tiny_orders')
        .select('tiny_id', { count: 'exact', head: true })
        .gte('data_criacao', start)
        .lte('data_criacao', end);

      if (countError) {
        throw countError;
      }

      let tinyTotal: number | null = null;
      if (shouldCallTiny && accessToken) {
        // Try once with a small backoff if 429
        let attempt = 0;
        const MAX_ATTEMPTS = 3;
        while (attempt < MAX_ATTEMPTS) {
          try {
            const page = await listarPedidosTinyPorPeriodo(accessToken, {
              dataInicial: start,
              dataFinal: end,
              limit: 1,
              offset: 0,
              orderBy: 'desc',
            });
            const pag = page?.paginacao;
            tinyTotal = pag && typeof pag.total === 'number' ? pag.total : null;
            break;
          } catch (err: any) {
            if (err instanceof TinyApiError && err.status === 429) {
              attempt += 1;
              const backoff = Math.min(15000 * Math.pow(2, attempt - 1), 60000);
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
            tinyTotal = null;
            break;
          }
        }
      }

      const percent = tinyTotal && tinyTotal > 0 ? (count ?? 0) / tinyTotal * 100 : null;

      results.push({
        year,
        month,
        start,
        end,
        db_count: count ?? 0,
        tiny_total: tinyTotal,
        percent: percent !== null ? Number(percent.toFixed(1)) : null,
      });
    }

    return NextResponse.json({
      year,
      months: results,
    });
  } catch (err: any) {
    console.error('[API] /api/tiny/sync/monthly/progress erro', err);
    return NextResponse.json(
      {
        message: 'Erro ao calcular progresso mensal.',
        details: err?.message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
