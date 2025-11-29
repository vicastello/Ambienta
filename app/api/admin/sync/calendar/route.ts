import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';
import type { Json } from '@/src/types/db-public';

export type CalendarDayStatus = {
  date: string; // YYYY-MM-DD no fuso local
  status: 'none' | 'success' | 'error';
  lastSyncAt: string | null;
  successesCount: number;
  errorsCount: number;
  lastMessage: string | null;
};

type RawSyncLog = {
  id: number;
  created_at: string;
  level: string;
  message: string;
  meta: Json | null;
};

export async function GET(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const monthParam = searchParams.get('month');
    const { startUTC, endUTC, daysInMonth, year, monthIndex } = getMonthRange(monthParam);

    const lookbackStart = new Date(startUTC);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 60);

    const { data, error } = await supabaseAdmin
      .from('sync_logs')
      .select('id, created_at, level, message, meta')
      .contains('meta', { step: 'orders' })
      .gte('created_at', lookbackStart.toISOString())
      .lt('created_at', endUTC.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;
    const dayAcc = aggregateLogsByDay((data ?? []) as RawSyncLog[]);

    const days: CalendarDayStatus[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = formatDateKey(year, monthIndex, day);
      const acc = dayAcc.get(dateKey);
      days.push(
        acc
          ? {
              date: dateKey,
              status: resolveDayStatus(acc),
              lastSyncAt: acc.lastSyncAt,
              successesCount: acc.successes,
              errorsCount: acc.errors,
              lastMessage: acc.lastMessage,
            }
          : {
              date: dateKey,
              status: 'none',
              lastSyncAt: null,
              successesCount: 0,
              errorsCount: 0,
              lastMessage: null,
            }
      );
    }

    return NextResponse.json({
      month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      range: {
        start: startUTC.toISOString(),
        endExclusive: endUTC.toISOString(),
      },
      days,
    });
  } catch (error: unknown) {
    console.error('[sync/calendar] error', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Erro ao consultar calendário de sincronização' },
      { status: 500 }
    );
  }
}

type DayAccumulator = {
  successes: number;
  errors: number;
  lastSyncAt: string | null;
  lastEventLevel: 'info' | 'error' | null;
  lastMessage: string | null;
};

function aggregateLogsByDay(rows: RawSyncLog[]) {
  const map = new Map<string, DayAccumulator>();

  for (const row of rows) {
    const dayKeys = resolveLogDays(row.meta, row.created_at);
    if (!dayKeys.length) continue;

    for (const dayKey of dayKeys) {
      const acc: DayAccumulator = map.get(dayKey) ?? {
        successes: 0,
        errors: 0,
        lastSyncAt: null,
        lastEventLevel: null,
        lastMessage: null,
      };

      const createdAt = row.created_at;
      if (!acc.lastSyncAt || createdAt > acc.lastSyncAt) {
        acc.lastSyncAt = createdAt;
        acc.lastEventLevel = row.level === 'error' ? 'error' : 'info';
        acc.lastMessage = row.message ?? null;
      }

      if (row.level === 'error') {
        acc.errors += 1;
      } else {
        acc.successes += 1;
      }

      map.set(dayKey, acc);
    }
  }

  return map;
}

function resolveDayStatus(day: DayAccumulator): CalendarDayStatus['status'] {
  if (day.lastEventLevel === 'error') return 'error';
  if (day.successes > 0) return 'success';
  if (day.errors > 0) return 'error';
  return 'none';
}

function getMonthRange(monthParam: string | null) {
  const now = new Date();
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth(); // 0-based

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [rawYear, rawMonth] = monthParam.split('-').map((val) => Number(val));
    if (!Number.isNaN(rawYear) && !Number.isNaN(rawMonth)) {
      year = rawYear;
      monthIndex = Math.min(Math.max(rawMonth - 1, 0), 11);
    }
  }

  const startUTC = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const endUTC = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  return { startUTC, endUTC, daysInMonth, year, monthIndex };
}

function resolveLogDays(meta: Json | null, createdAt: string) {
  const metaObj = isRecord(meta) ? meta : null;
  const days = new Set<string>();

  const janelaIni = parseMetaDate(metaObj?.janelaIni);
  const janelaFim = parseMetaDate(metaObj?.janelaFim);
  addRange(days, janelaIni, janelaFim ?? janelaIni);

  const compactRange = parseMetaRange(metaObj?.janela);
  if (compactRange) {
    addRange(days, compactRange.start, compactRange.end);
  }

  if (!days.size) {
    const fallback = safeDayKey(createdAt);
    if (fallback) days.add(fallback);
  }

  return Array.from(days);
}

function addRange(target: Set<string>, start: string | null, end: string | null) {
  if (!start && !end) return;
  const startKey = safeDayKey(start ?? end);
  const endKey = safeDayKey(end ?? start);
  if (!startKey || !endKey) return;

  const startDate = new Date(`${startKey}T00:00:00Z`);
  const endDate = new Date(`${endKey}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;

  const current = new Date(startDate);
  while (current.getTime() <= endDate.getTime()) {
    target.add(formatDateKey(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

function parseMetaDate(value: unknown) {
  if (typeof value !== 'string') return null;
  return safeDayKey(value);
}

function parseMetaRange(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

function safeDayKey(value: string | null) {
  if (!value) return null;
  const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
  return isoMatch ? isoMatch[0] : null;
}

function formatDateKey(year: number, monthIndex: number, day: number) {
  return [
    year,
    String(monthIndex + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
