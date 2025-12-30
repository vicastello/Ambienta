import { NextResponse } from 'next/server';

/**
 * Returns a NextResponse.json with HTTP cache headers for CDN/browser caching.
 * 
 * @param data - The JSON payload to return
 * @param maxAge - The max-age directive in seconds (how long the response is considered fresh)
 * @param swr - The stale-while-revalidate window in seconds (how long stale content can be served while revalidating)
 * @param extraHeaders - Additional headers to include in the response
 * @returns NextResponse with cache headers
 * 
 * @example
 * // Cache for 60s, serve stale for 5min while revalidating
 * return jsonWithCache(data, 60, 300);
 */
export function jsonWithCache(
    data: unknown,
    maxAge = 60,
    swr = 120,
    extraHeaders?: Record<string, string>
): NextResponse {
    return NextResponse.json(data, {
        headers: {
            'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${swr}`,
            ...extraHeaders,
        },
    });
}

/**
 * Returns a NextResponse.json with no-cache headers (for dynamic/authenticated endpoints).
 */
export function jsonNoCache(
    data: unknown,
    status = 200,
    extraHeaders?: Record<string, string>
): NextResponse {
    return NextResponse.json(data, {
        status,
        headers: {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            ...extraHeaders,
        },
    });
}
