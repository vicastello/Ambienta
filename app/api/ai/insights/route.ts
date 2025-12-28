import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';

// Groq API configuration (free tier)
const apiKey = process.env.GROQ_API_KEY;
const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const apiBaseUrl = process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1';

type InsightsPayload = {
  resumoAtual?: unknown;
  resumoGlobal?: unknown;
  filtrosVisuais?: Record<string, unknown>;
  contexto?: string;
  visaoFiltrada?: unknown;
};

type GroqChatResponse = {
  choices?: Array<{
    message?: { content?: string | null } | null;
  }>;
};

export async function POST(req: NextRequest) {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { message: 'GROQ_API_KEY não configurada no ambiente' },
        { status: 500 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    const body = isRecord(rawBody) ? (rawBody as InsightsPayload) : null;

    if (!body || !body.resumoAtual) {
      return NextResponse.json(
        { message: 'Payload inválido. Envie resumoAtual e filtros.' },
        { status: 400 }
      );
    }

    const { resumoAtual, resumoGlobal, filtrosVisuais, contexto, visaoFiltrada } = body;

    console.debug('[AI] Modelo Groq ativo:', modelName);

    const systemPrompt = `Você é um consultor de operações de e-commerce da Ambienta (cor institucional #009DA8).
Analise a base consolidada SEM filtros abaixo e entregue no máximo 4 bullet points curtos (<200 caracteres) destacando oportunidades, riscos e ações claras.
Mantenha tom profissional em português do Brasil, sempre citando números relevantes. Ignore filtros visuais eventualmente aplicados pelo usuário.`;

    const userPrompt = `Filtros visuais ignorados (apenas referência): ${JSON.stringify(filtrosVisuais ?? {})}
Visão filtrada (não utilizar para cálculos, apenas contexto): ${JSON.stringify(visaoFiltrada ?? null)}
Contexto adicional: ${contexto ?? 'N/A'}
Resumo consolidado (30 dias, sem filtros): ${JSON.stringify(resumoAtual)}
Resumo adicional: ${JSON.stringify(resumoGlobal ?? null)}`;

    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq respondeu ${response.status}: ${errorText}`);
    }

    const data: GroqChatResponse = await response.json();

    const text = data.choices?.[0]?.message?.content?.trim() ?? '';

    return NextResponse.json({ insights: text });
  } catch (err: unknown) {
    console.error('[API] Erro em /api/ai/insights', err);
    return NextResponse.json(
      {
        message: 'Erro ao gerar insights inteligentes',
        details: getErrorMessage(err) || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
