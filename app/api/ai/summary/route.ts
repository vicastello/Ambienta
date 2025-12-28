import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { GroqClient } from '@/lib/ai/groq-client';
import { buildDashboardContext, truncateContext } from '@/lib/ai/context-builder';
import { buildDashboardContextPrompt } from '@/lib/ai/prompts/system-prompt';

interface SummaryRequest {
    dashboardData: unknown;
}

interface ExecutiveSummary {
    summary: string;
    highlights: string[];
    alerts: string[];
    recommendation: string;
    generatedAt: string;
}

const groq = new GroqClient();

const SUMMARY_SYSTEM_PROMPT = `Você é um analista de e-commerce da Ambienta.
Gere um resumo executivo CONCISO dos dados abaixo.

Responda em JSON com este formato EXATO:
{
  "summary": "Resumo geral em 1-2 frases curtas",
  "highlights": ["Destaque positivo 1", "Destaque positivo 2"],
  "alerts": ["Ponto de atenção 1"],
  "recommendation": "Uma recomendação acionável"
}

Regras:
- summary: máximo 100 caracteres
- highlights: máximo 2 itens, 60 chars cada
- alerts: máximo 2 itens, 60 chars cada
- recommendation: máximo 80 caracteres
- Cite números específicos
- Responda APENAS o JSON, sem markdown`;

export async function POST(req: NextRequest): Promise<NextResponse<{ data: ExecutiveSummary } | { message: string; details?: string }>> {
    try {
        if (!groq.isConfigured()) {
            return NextResponse.json(
                { message: 'GROQ_API_KEY não configurada' },
                { status: 500 }
            );
        }

        const body = await req.json().catch(() => null) as SummaryRequest | null;

        if (!body?.dashboardData) {
            return NextResponse.json(
                { message: 'dashboardData é obrigatório' },
                { status: 400 }
            );
        }

        const context = buildDashboardContext(body.dashboardData);
        const truncated = truncateContext(context, 1500);
        const contextPrompt = buildDashboardContextPrompt(truncated);

        const response = await groq.chat({
            messages: [
                { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
                { role: 'user', content: contextPrompt },
            ],
            temperature: 0.5,
            maxTokens: 400,
        });

        // Parse JSON response
        let parsed: Partial<ExecutiveSummary>;
        try {
            const cleanJson = response.content.replace(/```json\n?|\n?```/g, '').trim();
            parsed = JSON.parse(cleanJson);
        } catch {
            // Fallback if parsing fails
            parsed = {
                summary: response.content.substring(0, 100),
                highlights: [],
                alerts: [],
                recommendation: '',
            };
        }

        const data: ExecutiveSummary = {
            summary: parsed.summary || 'Resumo não disponível',
            highlights: parsed.highlights || [],
            alerts: parsed.alerts || [],
            recommendation: parsed.recommendation || '',
            generatedAt: new Date().toISOString(),
        };

        return NextResponse.json({ data });
    } catch (err) {
        console.error('[API] Error in /api/ai/summary:', err);
        return NextResponse.json(
            {
                message: 'Erro ao gerar resumo executivo',
                details: getErrorMessage(err) || 'Erro desconhecido',
            },
            { status: 500 }
        );
    }
}
