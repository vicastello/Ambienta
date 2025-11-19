import { NextRequest, NextResponse } from 'next/server';
import processJob from '@/lib/syncProcessor';

const WORKER_SECRET = process.env.WORKER_SECRET;

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const resolvedParams = await params;
  const header = (await req.headers.get('x-worker-secret')) ?? '';
  if (!WORKER_SECRET || header !== WORKER_SECRET) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = resolvedParams;
  if (!jobId) return NextResponse.json({ ok: false, message: 'jobId required' }, { status: 400 });

  const result = await processJob(jobId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jobId, totalRequests: result.totalRequests, totalOrders: result.totalOrders });
}
