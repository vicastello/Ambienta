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

// Summarize data to fit Groq's token limits (~4k tokens max)
function summarizeForAI(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};

  const d = data as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  // Core metrics
  if (typeof d.totalValor === 'number') summary.faturamentoTotal = d.totalValor;
  if (typeof d.totalPedidos === 'number') summary.totalPedidos = d.totalPedidos;
  if (typeof d.totalFreteTotal === 'number') summary.frete = d.totalFreteTotal;
  if (typeof d.ticketMedio === 'number') summary.ticketMedio = d.ticketMedio;
  if (typeof d.percentualCancelados === 'number') summary.cancelamentos = `${d.percentualCancelados}%`;

  // Top 5 channels only
  if (Array.isArray(d.canais)) {
    summary.canais = (d.canais as Array<Record<string, unknown>>)
      .slice(0, 5)
      .map(c => ({
        nome: c.canal,
        valor: c.totalValor,
        pedidos: c.totalPedidos,
      }));
  }

  // Top 5 products only
  if (Array.isArray(d.topProdutos)) {
    summary.topProdutos = (d.topProdutos as Array<Record<string, unknown>>)
      .slice(0, 5)
      .map(p => ({
        nome: (p.descricao as string)?.substring(0, 50),
        qtd: p.quantidade,
        valor: p.totalValor,
      }));
  }

  // Last 7 days trend only (not all days)
  if (Array.isArray(d.vendasPorDia)) {
    const vendas = d.vendasPorDia as Array<Record<string, unknown>>;
    summary.ultimos7Dias = vendas.slice(-7).map(v => ({
      data: v.data,
      valor: v.totalDia,
      qtd: v.quantidade,
    }));
  }

  // Diffs if available
  if (d.diffs && typeof d.diffs === 'object') {
    const diffs = d.diffs as Record<string, unknown>;
    summary.comparativo = {
      faturamento: (diffs.faturamento as Record<string, unknown>)?.deltaPercent,
      pedidos: (diffs.pedidos as Record<string, unknown>)?.deltaPercent,
      ticket: (diffs.ticketMedio as Record<string, unknown>)?.deltaPercent,
    };
  }

  return summary;
}

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

    const { resumoAtual, filtrosVisuais, contexto } = body;

    // Summarize data to fit token limits
    const resumoReduzido = summarizeForAI(resumoAtual);

    console.debug('[AI] Modelo Groq ativo:', modelName);
    console.debug('[AI] Resumo reduzido tamanho:', JSON.stringify(resumoReduzido).length, 'chars');

    const systemPrompt = `Você é um consultor de operações de e-commerce da Ambienta.
Analise os dados abaixo e entregue exatamente 4 bullet points curtos (<200 caracteres cada) destacando oportunidades, riscos e ações claras.
Tom profissional em português do Brasil. Cite números específicos.`;

    const userPrompt = `Contexto: ${contexto ?? 'Dashboard Ambienta'}
Filtros: ${JSON.stringify(filtrosVisuais ?? {})}
Dados: ${JSON.stringify(resumoReduzido)}`;

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
        max_tokens: 512,
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
