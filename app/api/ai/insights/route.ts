import { NextRequest, NextResponse } from 'next/server';
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite-001';
const apiVersion = process.env.GEMINI_API_VERSION || 'v1';
const apiBaseUrl = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';

export async function POST(req: NextRequest) {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { message: 'GEMINI_API_KEY não configurada no ambiente' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !body.resumoAtual) {
      return NextResponse.json(
        { message: 'Payload inválido. Envie resumoAtual e filtros.' },
        { status: 400 }
      );
    }

    const { resumoAtual, resumoGlobal, filtrosVisuais, contexto, visaoFiltrada } = body;

    console.debug('[AI] Modelo Gemini ativo:', modelName);

    const prompt = `Você é um consultor de operações de e-commerce da Ambienta (cor institucional #009DA8).
  Analise a base consolidada SEM filtros abaixo e entregue no máximo 4 bullet points curtos (<200 caracteres) destacando oportunidades, riscos e ações claras.
  Mantenha tom profissional em português do Brasil, sempre citando números relevantes. Ignore filtros visuais eventualmente aplicados pelo usuário.

  Filtros visuais ignorados (apenas referência): ${JSON.stringify(filtrosVisuais ?? {})}
  Visão filtrada (não utilizar para cálculos, apenas contexto): ${JSON.stringify(visaoFiltrada ?? null)}
  Contexto adicional: ${contexto ?? 'N/A'}
  Resumo consolidado (30 dias, sem filtros): ${JSON.stringify(resumoAtual)}
  Resumo adicional: ${JSON.stringify(resumoGlobal ?? null)}
  `;

    const response = await fetch(
      `${apiBaseUrl}/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini respondeu ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const candidateParts = data.candidates?.flatMap((candidate) =>
      (candidate.content?.parts ?? []).map((part) => part.text ?? '')
    );

    const text = (candidateParts ?? []).join('\n').trim();

    return NextResponse.json({ insights: text });
  } catch (err: any) {
    console.error('[API] Erro em /api/ai/insights', err);
    return NextResponse.json(
      {
        message: 'Erro ao gerar insights inteligentes',
        details: err?.message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
