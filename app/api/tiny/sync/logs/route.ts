// app/api/tiny/sync/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit') ?? '100');

    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('sync_jobs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10);

    if (jobsError) throw jobsError;

    const lastJobId = jobs[0]?.id;

    let logs: any[] = [];
    if (lastJobId) {
      const { data: logsData, error: logsError } = await supabaseAdmin
        .from('sync_logs')
        .select('*')
        .eq('job_id', lastJobId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (logsError) throw logsError;
      logs = logsData ?? [];
    }

    return NextResponse.json({
      jobs,
      logs,
    });
  } catch (err: any) {
    console.error('[API] /api/tiny/sync/logs erro', err);
    return NextResponse.json(
      {
        message: 'Erro ao carregar logs de sincronização.',
        details: err?.message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}