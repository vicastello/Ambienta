/**
 * Rules Cache
 * 
 * Server-side caching for rules to improve performance
 */

import type { AutoRule } from './types';

interface CacheEntry {
    rules: AutoRule[];
    timestamp: number;
    marketplace: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

/**
 * Get cached rules for a marketplace
 */
export function getCachedRules(marketplace: string): AutoRule[] | null {
    const entry = cache.get(marketplace);

    if (!entry) return null;

    // Check if cache is still valid
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(marketplace);
        return null;
    }

    return entry.rules;
}

/**
 * Set cached rules for a marketplace
 */
export function setCachedRules(marketplace: string, rules: AutoRule[]): void {
    cache.set(marketplace, {
        rules,
        timestamp: Date.now(),
        marketplace,
    });
}

/**
 * Invalidate cache for a marketplace (call after rule changes)
 */
export function invalidateRulesCache(marketplace?: string): void {
    if (marketplace) {
        cache.delete(marketplace);
        cache.delete('all'); // Also invalidate 'all' since it affects everything
    } else {
        cache.clear();
    }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
    size: number;
    entries: Array<{ marketplace: string; age: number; count: number }>;
} {
    const now = Date.now();
    const entries = Array.from(cache.entries()).map(([key, entry]) => ({
        marketplace: key,
        age: Math.round((now - entry.timestamp) / 1000),
        count: entry.rules.length,
    }));

    return {
        size: cache.size,
        entries,
    };
}
