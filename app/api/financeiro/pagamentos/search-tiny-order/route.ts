import { NextRequest, NextResponse } from 'next/server';
import { fetchTinyOrderByMarketplaceId } from '@/lib/tinyClient';

/**
 * Search Tiny orders endpoint
 * Searches for orders in Tiny API with rate limit protection
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { query, marketplace } = body;

        if (!query || !marketplace) {
            return NextResponse.json(
                { error: 'Query e marketplace são obrigatórios' },
                { status: 400 }
            );
        }

        console.log('[SearchTinyOrder] Searching:', { query, marketplace });

        // Use the enhanced Tiny client with rate limit protection
        const result = await fetchTinyOrderByMarketplaceId(query, marketplace);

        if (result.rateLimited) {
            return NextResponse.json(
                {
                    error: 'Limite de requisições da API Tiny atingido',
                    retryAfter: result.retryAfter || 5,
                },
                { status: 429 }
            );
        }

        if (result.error) {
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            orders: result.orders || [],
        });

    } catch (error) {
        console.error('[SearchTinyOrder] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
