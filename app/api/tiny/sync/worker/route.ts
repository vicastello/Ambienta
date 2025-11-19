import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import processJob from '@/lib/syncProcessor';

export async function POST(req: NextRequest) {
  // protect worker with secret header
  const WORKER_SECRET = process.env.WORKER_SECRET;
  const header = req.headers.get('x-worker-secret') ?? '';
  if (!WORKER_SECRET || header !== WORKER_SECRET) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // pick a queued job id
    const { data: jobRow, error: jobFetchErr } = await supabaseAdmin
      .from('sync_jobs')
      .select('id')
      .eq('status', 'queued')
      // started_at tem default now() na criação do job
      // usamos como proxy para FIFO
      .order('started_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobFetchErr) throw jobFetchErr;
    if (!jobRow) {
      return NextResponse.json({ ok: false, message: 'Nenhum job na fila' });
    }

    const jobId = jobRow.id as string;

    const result = await processJob(jobId);

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, jobId, totalRequests: result.totalRequests, totalOrders: result.totalOrders });
  } catch (err: any) {
    console.error('[Worker] erro', err);
    return NextResponse.json({ ok: false, message: err?.message ?? String(err) }, { status: 500 });
  }
}
