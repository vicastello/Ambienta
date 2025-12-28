import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { getProactiveInsights } from '@/lib/ai/proactive-insights';

interface ProactiveInsightsRequest {
    dashboardData: unknown;
    includeAI?: boolean;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null) as ProactiveInsightsRequest | null;

        if (!body?.dashboardData) {
            return NextResponse.json(
                { message: 'dashboardData é obrigatório' },
                { status: 400 }
            );
        }

        const insights = await getProactiveInsights(body.dashboardData, {
            includeAI: body.includeAI ?? false,
        });

        return NextResponse.json({
            insights,
            count: insights.length,
            generatedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[API] Error in /api/ai/proactive:', err);
        return NextResponse.json(
            {
                message: 'Erro ao gerar insights proativos',
                details: getErrorMessage(err) || 'Erro desconhecido',
            },
            { status: 500 }
        );
    }
}
