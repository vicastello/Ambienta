import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';
import type { Json } from '@/src/types/db-public';

export type SyncLogEntry = {
  id: string;
  createdAt: string;
  level: string;
  type: string;
  message: string;
  meta: Record<string, unknown> | null;
  jobId: string | null;
};

const LOG_TYPES = ['orders', 'enrich', 'produtos'] as const;
type LogTypeFilter = (typeof LOG_TYPES)[number] | 'all';

type RawLogRow = {
  id: number;
  job_id: string | null;
  created_at: string;
  level: string | null;
  message: string;
  meta: Json | null;
  sync_jobs?: {
    id: string;
    params: Json | null;
  } | null;
};

export async function GET(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const limitParam = Number(searchParams.get('limit') ?? '50');
    const limit = Math.min(Math.max(limitParam, 1), 200);
    const requestedType = (searchParams.get('type') ?? 'all').toLowerCase();
    const typeParam: LogTypeFilter = isLogType(requestedType) ? requestedType : 'all';

    const fetchLimit = Math.min(limit * 3, 200);
    const { data, error } = await supabaseAdmin
      .from('sync_logs')
      .select(
        'id, job_id, created_at, level, message, meta, sync_jobs:sync_jobs!sync_logs_job_id_fkey!left(id, params)'
      )
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    if (error) throw error;

    const rows = (data ?? []) as unknown as RawLogRow[];
    const normalized: SyncLogEntry[] = rows.map((log) => {
      const meta = toRecord(log.meta);
      const jobParams = toRecord(log.sync_jobs?.params ?? null);

      const resolvedType = inferLogType({ meta, jobParams });

      return {
        id: String(log.id),
        createdAt: log.created_at,
        level: log.level ?? 'info',
        type: resolvedType,
        message: log.message,
        meta,
        jobId: log.job_id ?? null,
      };
    });

    const filtered = typeParam !== 'all'
      ? normalized.filter((log) => normalizeType(log.type) === typeParam)
      : normalized;

    return NextResponse.json({ logs: filtered.slice(0, limit) });
  } catch (error: unknown) {
    console.error('[sync/logs] error', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Erro ao consultar logs de sincronização' },
      { status: 500 }
    );
  }
}

type InferLogInput = {
  meta: Record<string, unknown> | null;
  jobParams: Record<string, unknown> | null;
};

function inferLogType({ meta, jobParams }: InferLogInput): LogTypeFilter {
  const candidates = [
    meta?.type,
    meta?.source,
    meta?.context,
    meta?.job,
    jobParams?.mode,
  ];

  for (const cand of candidates) {
    if (typeof cand === 'string' && cand.trim().length) {
      return normalizeType(cand);
    }
  }

  return 'orders';
}

function normalizeType(raw: string): LogTypeFilter {
  const value = raw.toLowerCase();
  if (value.includes('prod')) return 'produtos';
  if (value.includes('enrich') || value.includes('item')) return 'enrich';
  if (value.includes('order') || value.includes('pedido')) return 'orders';
  return 'orders';
}

function isLogType(value: string): value is (typeof LOG_TYPES)[number] {
  return (LOG_TYPES as readonly string[]).includes(value);
}

function toRecord(value: Json | null): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
