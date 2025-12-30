import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { createOpenAICompatibleClient, resolveAiRuntimeConfig } from '@/lib/ai/ai-runtime';
import { buildRichDashboardContext, contextToPrompt, type RichDashboardContext } from '@/lib/ai/rich-context-builder';
import { getAIDataProvider } from '@/lib/ai/data-provider';
import { buildFallbackIntelligence } from '@/lib/ai/intelligence-fallback';
import { buildDbInsightIndex, buildIndexPrompt, buildIntelligenceFromIndex } from '@/lib/ai/db-insight-index';
import {
    INTELLIGENCE_SYSTEM_PROMPT,
    INTELLIGENCE_USER_PROMPT,
    parseAIResponse,
    type AIIntelligenceResponse
} from '@/lib/ai/prompts/insight-prompt';

interface IntelligenceRequest {
    dashboardData: unknown;
    useDeepAnalysis?: boolean;
    periodDays?: number;
    filters?: {
        canais?: string[];
        situacoes?: number[];
    };
}

export async function POST(req: NextRequest): Promise<NextResponse<AIIntelligenceResponse | { message: string; details?: string }>> {
    let richContext: RichDashboardContext | null = null;
    try {
        const runtime = await resolveAiRuntimeConfig();
        if (!runtime.apiKey) {
            return NextResponse.json(
                { message: 'IA não configurada. Configure as chaves em /configuracoes.' },
                { status: 500 }
            );
        }
        if (process.env.NODE_ENV !== 'production') {
            console.log(
                '[AI/Intelligence] Provider:',
                runtime.providerId,
                'Base:',
                runtime.baseUrl,
                'Model:',
                runtime.modelDeep || runtime.modelQuick
            );
        }
        const aiClient = createOpenAICompatibleClient(runtime);

        // Parse request body
        const body = await req.json().catch(() => null) as IntelligenceRequest | null;

        if (!body?.dashboardData) {
            return NextResponse.json(
                { message: 'dashboardData é obrigatório' },
                { status: 400 }
            );
        }

        // Build rich context from dashboard data
        richContext = buildRichDashboardContext(body.dashboardData);
        let contextText = contextToPrompt(richContext);
        let dataSource: 'dashboard' | 'supabase' | 'mix' = 'dashboard';
        const periodDays =
            typeof body?.periodDays === 'number' && body.periodDays > 0
                ? Math.min(Math.max(body.periodDays, 7), 120)
                : Math.min(Math.max(richContext.periodo?.dias ?? 30, 7), 120);

        if (body?.useDeepAnalysis) {
            try {
                const dataProvider = getAIDataProvider();
                const periodStart = richContext.periodo?.inicio;
                const periodEnd = richContext.periodo?.fim;
                const deepData = periodStart && periodEnd
                    ? await dataProvider.getComprehensiveDataForPeriod(periodStart, periodEnd)
                    : await dataProvider.getComprehensiveData(periodDays);
                const deepContext = dataProvider.formatForAI(deepData);
                const prefix = contextText ? '\n\n## Base Supabase\n' : '';
                contextText = `${contextText}${prefix}${deepContext}`;
                dataSource = contextText && prefix ? 'mix' : 'supabase';
            } catch (deepError) {
                console.error('[AI/Intelligence] Supabase deep analysis failed:', deepError);
            }
        }

        const periodStart = richContext.periodo?.inicio;
        const periodEnd = richContext.periodo?.fim;
        const resolvedStart = periodStart || new Date(Date.now() - (periodDays - 1) * 86_400_000).toISOString().slice(0, 10);
        const resolvedEnd = periodEnd || new Date().toISOString().slice(0, 10);

        const dbIndex = await buildDbInsightIndex({
            inicio: resolvedStart,
            fim: resolvedEnd,
            canais: body?.filters?.canais ?? null,
            situacoes: body?.filters?.situacoes ?? null,
        });

        if (dbIndex) {
            const dbPrompt = buildIndexPrompt(dbIndex);
            contextText = `${contextText}\n\n${dbPrompt}`;
            if (dataSource === 'dashboard') {
                dataSource = 'mix';
            }
        }

        // Build the user message with context
        const userMessage = INTELLIGENCE_USER_PROMPT.replace('{context}', contextText);

        console.log('[AI/Intelligence] Generating insights with context length:', contextText.length);

        // Call AI API
        const response = await aiClient.chat({
            messages: [
                { role: 'system', content: INTELLIGENCE_SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            model: runtime.modelDeep,
            temperature: runtime.temperature,
            maxTokens: Math.max(runtime.maxTokens, 1200),
        });

        // Parse and validate response
        const rawContent = response.content?.trim() ?? '';
        const intelligence = rawContent ? parseAIResponse(rawContent) : null;
        const dbFallback = dbIndex ? buildIntelligenceFromIndex(dbIndex) : null;
        const fallback = dbFallback ?? buildFallbackIntelligence(richContext);

        const hasAiContent = Boolean(intelligence) && (
            (intelligence?.insights?.length ?? 0) > 0 ||
            (intelligence?.drivers?.length ?? 0) > 0 ||
            (intelligence?.acoes?.length ?? 0) > 0 ||
            (intelligence?.sinais?.length ?? 0) > 0
        );
        const useAiSummary = hasAiContent && Boolean(intelligence?.resumoExecutivo?.contexto);

        const merged: AIIntelligenceResponse = {
            ...fallback,
            ...(intelligence ?? {}),
            resumoExecutivo: useAiSummary ? intelligence!.resumoExecutivo : fallback.resumoExecutivo,
            insights: hasAiContent && intelligence?.insights?.length ? intelligence.insights : fallback.insights,
            drivers: hasAiContent && intelligence?.drivers?.length ? intelligence.drivers : fallback.drivers,
            acoes: hasAiContent && intelligence?.acoes?.length ? intelligence.acoes : fallback.acoes,
            sinais: hasAiContent && intelligence?.sinais?.length ? intelligence.sinais : fallback.sinais,
            qualidadeDados: hasAiContent && intelligence?.qualidadeDados ? intelligence.qualidadeDados : fallback.qualidadeDados,
            projecao: hasAiContent && intelligence?.projecao ? intelligence.projecao : fallback.projecao,
            meta: {
                ...fallback.meta,
                ...(intelligence?.meta ?? {}),
                origem: hasAiContent ? 'ai' : 'fallback',
                modelo: response.model ?? runtime.modelDeep,
                fonteDados: dataSource,
            },
            generatedAt: intelligence?.generatedAt ?? fallback.generatedAt,
        };

        console.log('[AI/Intelligence] Generated', merged.insights.length, 'insights');

        return NextResponse.json(merged);

    } catch (err) {
        console.error('[API] Error in /api/ai/intelligence:', err);

        if (richContext) {
            const fallback = buildFallbackIntelligence(richContext);
            return NextResponse.json({
                ...fallback,
                meta: {
                    ...fallback.meta,
                    origem: 'fallback',
                    modelo: 'local',
                },
            });
        }

        return NextResponse.json(
            {
                message: 'Erro ao gerar análise inteligente',
                details: getErrorMessage(err) || 'Erro desconhecido',
            },
            { status: 500 }
        );
    }
}
