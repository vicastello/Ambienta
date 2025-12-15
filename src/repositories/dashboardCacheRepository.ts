import { getErrorMessage } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type DashboardResumoCacheFilters = {
  canais: string[] | null;
  situacoes: number[] | null;
};

export type DashboardResumoCacheRanges = {
  current: { start: string; end: string };
  previous: { start: string; end: string };
};

export type DashboardResumoCacheDecision<T> =
  | {
      hit: true;
      payload: T;
      canaisKey: string;
      situacoesKey: string;
      cacheSourceMaxUpdatedAt: string | null;
      currentSourceMaxUpdatedAt: string | null;
    }
  | {
      hit: false;
      reason: 'cache_empty' | 'cache_missing_watermark' | 'watermark_changed' | 'watermark_unavailable' | 'expired' | 'schema_mismatch';
      canaisKey: string;
      situacoesKey: string;
      cacheSourceMaxUpdatedAt: string | null;
      currentSourceMaxUpdatedAt: string | null;
    };

type DashboardResumoCacheRow = {
  payload: unknown;
  source_max_updated_at: string | null;
  expires_at?: string | null;
};

class DashboardCacheSchemaMismatchError extends Error {
  name = 'DashboardCacheSchemaMismatchError';
}

function isSchemaMismatchMessage(message: string) {
  const msg = message.toLowerCase();
  if (!msg) return false;

  // Postgres (relação/coluna/função inexistente)
  if (
    msg.includes(' does not exist') &&
    (msg.includes('column ') || msg.includes('relation ') || msg.includes('function '))
  ) {
    return true;
  }

  // PostgREST/Supabase: schema cache desatualizado (migrations ainda não aplicadas)
  if (msg.includes('schema cache') && msg.includes('could not find')) return true;
  if (msg.includes('could not find the table')) return true;
  if (msg.includes('could not find the function')) return true;
  if (msg.includes("could not find the '") && msg.includes("' column")) return true;

  return false;
}

function normalizeKeyParts<T>(values: T[] | null | undefined, sortFn?: (a: T, b: T) => number) {
  const list = (values ?? []).filter((v) => v !== null && v !== undefined) as T[];
  if (!list.length) return { key: 'all', list: null as T[] | null };
  const unique = Array.from(new Set(list));
  if (sortFn) unique.sort(sortFn);
  return { key: unique.join('|'), list: unique };
}

function normalizeCanaisKey(canais: string[] | null | undefined) {
  const normalized = normalizeKeyParts(
    (canais ?? []).map((c) => String(c).trim()).filter(Boolean),
    (a, b) => a.localeCompare(b)
  );
  return { canaisKey: normalized.key, canaisList: normalized.list as string[] | null };
}

function normalizeSituacoesKey(situacoes: number[] | null | undefined) {
  const normalized = normalizeKeyParts(
    (situacoes ?? []).filter((n) => Number.isFinite(n)) as number[],
    (a, b) => a - b
  );
  return { situacoesKey: normalized.key, situacoesList: normalized.list as number[] | null };
}

function normalizeTimestamp(value: string | null) {
  if (!value) return null;

  const tryParse = (raw: string) => {
    const direct = Date.parse(raw);
    if (Number.isFinite(direct)) return direct;

    // Postgres timestamptz costuma vir como: "YYYY-MM-DD HH:MM:SS[.ffffff]+00"
    // Normaliza para ISO 8601: "YYYY-MM-DDTHH:MM:SS[.ffffff]+00:00".
    let normalized = raw.trim().replace(' ', 'T');
    normalized = normalized.replace(/([+-]\d{2})$/, '$1:00');
    normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    normalized = normalized.replace(/\+00:00$/, 'Z');

    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) return parsed;
    return null;
  };

  const parsed = tryParse(value);
  if (parsed === null) return value;
  return new Date(parsed).toISOString();
}

function maxTimestamp(a: string | null, b: string | null) {
  const na = normalizeTimestamp(a);
  const nb = normalizeTimestamp(b);
  if (!na) return nb;
  if (!nb) return na;
  const ta = Date.parse(na);
  const tb = Date.parse(nb);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return na === nb ? na : na;
  return ta >= tb ? na : nb;
}

async function fetchSourceMaxUpdatedAtForRange(args: {
  start: string;
  end: string;
  canais: string[] | null;
  situacoes: number[] | null;
}): Promise<string | null> {
  try {
    const { data, error } = await (supabaseAdmin as any).rpc('dashboard_resumo_source_max_updated_at', {
      p_data_inicial: args.start,
      p_data_final: args.end,
      p_canais: args.canais,
      p_situacoes: args.situacoes,
    });

    if (error) {
      const msg = getErrorMessage(error) ?? '';
      if (isSchemaMismatchMessage(msg)) {
        throw new DashboardCacheSchemaMismatchError(msg);
      }
      console.warn('[dashboard-cache] watermark rpc error', {
        message: msg,
      });
      return null;
    }

    if (!data) return null;
    return typeof data === 'string' ? data : String(data);
  } catch (e) {
    const msg = getErrorMessage(e) ?? '';
    if (e instanceof DashboardCacheSchemaMismatchError || isSchemaMismatchMessage(msg)) {
      throw e;
    }
    console.warn('[dashboard-cache] watermark rpc threw', { message: getErrorMessage(e) });
    return null;
  }
}

async function fetchCacheRow(args: {
  periodoInicio: string;
  periodoFim: string;
  canaisKey: string;
  situacoesKey: string;
}): Promise<DashboardResumoCacheRow | null> {
  const { data, error } = await (supabaseAdmin as any)
    .from('dashboard_resumo_cache')
    .select('payload, source_max_updated_at, expires_at')
    .eq('periodo_inicio', args.periodoInicio)
    .eq('periodo_fim', args.periodoFim)
    .eq('canais_key', args.canaisKey)
    .eq('situacoes_key', args.situacoesKey)
    .maybeSingle();

  if (error) {
    const msg = getErrorMessage(error) ?? '';
    if (isSchemaMismatchMessage(msg)) {
      throw new DashboardCacheSchemaMismatchError(msg);
    }
    throw error;
  }

  return data as DashboardResumoCacheRow | null;
}

export async function getDashboardResumoCacheDecision<T>(args: {
  ranges: DashboardResumoCacheRanges;
  filters: DashboardResumoCacheFilters;
}): Promise<DashboardResumoCacheDecision<T>> {
  const { canaisKey, canaisList } = normalizeCanaisKey(args.filters.canais);
  const { situacoesKey, situacoesList } = normalizeSituacoesKey(args.filters.situacoes);

  let cacheRow: DashboardResumoCacheRow | null = null;
  try {
    cacheRow = await fetchCacheRow({
      periodoInicio: args.ranges.current.start,
      periodoFim: args.ranges.current.end,
      canaisKey,
      situacoesKey,
    });
  } catch (e) {
    const msg = getErrorMessage(e) ?? '';
    if (e instanceof DashboardCacheSchemaMismatchError || isSchemaMismatchMessage(msg)) {
      console.warn('[dashboard-cache] schema_mismatch (cache)', { message: msg });
      return {
        hit: false,
        reason: 'schema_mismatch',
        canaisKey,
        situacoesKey,
        cacheSourceMaxUpdatedAt: null,
        currentSourceMaxUpdatedAt: null,
      };
    }

    console.warn('[dashboard-cache] cache fetch error', {
      message: msg,
      periodo: { inicio: args.ranges.current.start, fim: args.ranges.current.end },
      canaisKey,
      situacoesKey,
    });
    cacheRow = null;
  }

  const expiresAt = cacheRow?.expires_at ? Date.parse(cacheRow.expires_at) : null;
  if (expiresAt && Number.isFinite(expiresAt) && Date.now() > expiresAt) {
    return {
      hit: false,
      reason: 'expired',
      canaisKey,
      situacoesKey,
      cacheSourceMaxUpdatedAt: cacheRow?.source_max_updated_at ?? null,
      currentSourceMaxUpdatedAt: null,
    };
  }

  let maxAtual: string | null = null;
  let maxAnterior: string | null = null;
  try {
    maxAtual = await fetchSourceMaxUpdatedAtForRange({
      start: args.ranges.current.start,
      end: args.ranges.current.end,
      canais: canaisList,
      situacoes: situacoesList,
    });

    maxAnterior = await fetchSourceMaxUpdatedAtForRange({
      start: args.ranges.previous.start,
      end: args.ranges.previous.end,
      canais: canaisList,
      situacoes: situacoesList,
    });
  } catch (e) {
    const msg = getErrorMessage(e) ?? '';
    if (e instanceof DashboardCacheSchemaMismatchError || isSchemaMismatchMessage(msg)) {
      console.warn('[dashboard-cache] schema_mismatch (watermark)', { message: msg });
      return {
        hit: false,
        reason: 'schema_mismatch',
        canaisKey,
        situacoesKey,
        cacheSourceMaxUpdatedAt: cacheRow?.source_max_updated_at ?? null,
        currentSourceMaxUpdatedAt: null,
      };
    }
    console.warn('[dashboard-cache] watermark unexpected error', { message: msg });
    maxAtual = null;
    maxAnterior = null;
  }

  const currentSourceMaxUpdatedAt = maxTimestamp(maxAtual, maxAnterior);

  if (!cacheRow) {
    return {
      hit: false,
      reason: 'cache_empty',
      canaisKey,
      situacoesKey,
      cacheSourceMaxUpdatedAt: null,
      currentSourceMaxUpdatedAt,
    };
  }

  const cacheSourceMaxUpdatedAt = normalizeTimestamp(cacheRow.source_max_updated_at);
  const currentNormalized = normalizeTimestamp(currentSourceMaxUpdatedAt);

  if (cacheSourceMaxUpdatedAt === null && currentNormalized === null) {
    return {
      hit: true,
      payload: cacheRow.payload as T,
      canaisKey,
      situacoesKey,
      cacheSourceMaxUpdatedAt: null,
      currentSourceMaxUpdatedAt: null,
    };
  }

  if (!cacheSourceMaxUpdatedAt) {
    return {
      hit: false,
      reason: 'cache_missing_watermark',
      canaisKey,
      situacoesKey,
      cacheSourceMaxUpdatedAt: cacheRow.source_max_updated_at ?? null,
      currentSourceMaxUpdatedAt,
    };
  }

  if (!currentNormalized) {
    return {
      hit: false,
      reason: 'watermark_unavailable',
      canaisKey,
      situacoesKey,
      cacheSourceMaxUpdatedAt: cacheRow.source_max_updated_at ?? null,
      currentSourceMaxUpdatedAt: null,
    };
  }

  if (cacheSourceMaxUpdatedAt === currentNormalized) {
    return {
      hit: true,
      payload: cacheRow.payload as T,
      canaisKey,
      situacoesKey,
      cacheSourceMaxUpdatedAt: cacheRow.source_max_updated_at ?? null,
      currentSourceMaxUpdatedAt: currentNormalized,
    };
  }

  return {
    hit: false,
    reason: 'watermark_changed',
    canaisKey,
    situacoesKey,
    cacheSourceMaxUpdatedAt: cacheRow.source_max_updated_at ?? null,
    currentSourceMaxUpdatedAt: currentNormalized,
  };
}

export async function upsertDashboardResumoCache(args: {
  periodoInicio: string;
  periodoFim: string;
  canais: string[] | null;
  situacoes: number[] | null;
  payload: unknown;
  sourceMaxUpdatedAt: string | null;
  expiresAt?: string | null;
}) {
  const { canaisKey } = normalizeCanaisKey(args.canais);
  const { situacoesKey } = normalizeSituacoesKey(args.situacoes);

  const row = {
    periodo_inicio: args.periodoInicio,
    periodo_fim: args.periodoFim,
    canais_key: canaisKey,
    situacoes_key: situacoesKey,
    payload: args.payload,
    source_max_updated_at: args.sourceMaxUpdatedAt,
    built_at: new Date().toISOString(),
    expires_at: args.expiresAt ?? null,
  };

  const { error } = await (supabaseAdmin as any)
    .from('dashboard_resumo_cache')
    .upsert(row, { onConflict: 'periodo_inicio,periodo_fim,canais_key,situacoes_key' });

  if (error) throw error;
}
