'use client';

type CacheEntry<T> = {
  data: T;
  ts: number;
};

const CACHE_PREFIX = 'swrcache:';
const inFlight = new Map<string, Promise<any>>();

function namespaced(key: string) {
  return `${CACHE_PREFIX}${key}`;
}

function readCache<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}

export type StaleCacheOptions<T> = {
  key: string;
  ttlMs?: number;
  fetcher: () => Promise<T>;
  onUpdate?: (data: T) => void;
};

export async function staleWhileRevalidate<T>({
  key,
  ttlMs = 60_000,
  fetcher,
  onUpdate,
}: StaleCacheOptions<T>): Promise<{ data: T; fromCache: boolean }> {
  const namespacedKey = namespaced(key);
  const now = Date.now();
  const cached = readCache<T>(namespacedKey);
  const isFresh = cached && now - cached.ts < ttlMs;

  const runFetch = () => {
    const existing = inFlight.get(namespacedKey);
    if (existing) return existing as Promise<T>;
    const promise = fetcher()
      .then((data) => {
        writeCache(namespacedKey, data);
        onUpdate?.(data);
        return data;
      })
      .finally(() => {
        inFlight.delete(namespacedKey);
      });
    inFlight.set(namespacedKey, promise);
    return promise;
  };

  if (cached) {
    if (!isFresh) {
      runFetch().catch(() => {
        /* silent */
      });
    }
    return { data: cached.data, fromCache: true };
  }

  const fresh = await runFetch();
  return { data: fresh, fromCache: false };
}

export function clearCacheKey(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(namespaced(key));
  } catch {
    // ignore
  }
}

export function clearCacheByPrefix(prefix: string) {
  if (typeof window === 'undefined') return;
  try {
    const effectivePrefix = namespaced(prefix);
    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(effectivePrefix)) toDelete.push(k);
    }
    toDelete.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
