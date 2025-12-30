import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { createOpenAICompatibleClient, resolveAiRuntimeConfig } from '@/lib/ai/ai-runtime';
import { buildDbInsightIndex, buildIndexPrompt, buildInsightBullets } from '@/lib/ai/db-insight-index';

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
  let parsedBody: InsightsPayload | null = null;
  try {
    const runtime = await resolveAiRuntimeConfig();
    if (!runtime.apiKey) {
      return NextResponse.json(
        { message: 'IA não configurada. Configure as chaves em /configuracoes.' },
        { status: 500 }
      );
    }
    const aiClient = createOpenAICompatibleClient(runtime);

    const rawBody = await req.json().catch(() => null);
    const body = isRecord(rawBody) ? (rawBody as InsightsPayload) : null;
    parsedBody = body;

    if (!body || !body.resumoAtual) {
      return NextResponse.json(
        { message: 'Payload inválido. Envie resumoAtual e filtros.' },
        { status: 400 }
      );
    }

    const { resumoAtual, filtrosVisuais, contexto } = body;

    // Summarize data to fit token limits
    const resumoReduzido = summarizeForAI(resumoAtual);
    const filtros = filtrosVisuais || {};
    const canaisSelecionados = Array.isArray((filtros as any).canaisSelecionados)
      ? (filtros as any).canaisSelecionados.filter((c: unknown) => typeof c === 'string')
      : null;
    const situacoesSelecionadas = Array.isArray((filtros as any).situacoesSelecionadas)
      ? (filtros as any).situacoesSelecionadas.filter((n: unknown) => typeof n === 'number')
      : null;

    const resumoAtualObj = resumoAtual as Record<string, unknown>;
    const periodoInicio = typeof resumoAtualObj?.dataInicial === 'string' ? resumoAtualObj.dataInicial : null;
    const periodoFim = typeof resumoAtualObj?.dataFinal === 'string' ? resumoAtualObj.dataFinal : null;

    const dbIndex = periodoInicio && periodoFim
      ? await buildDbInsightIndex({
        inicio: periodoInicio,
        fim: periodoFim,
        canais: canaisSelecionados,
        situacoes: situacoesSelecionadas,
      })
      : null;

    console.debug('[AI] Modelo ativo:', runtime.modelDeep);
    console.debug('[AI] Resumo reduzido tamanho:', JSON.stringify(resumoReduzido).length, 'chars');

    const systemPrompt = `Você é um consultor de operações de e-commerce da Ambienta.
Analise os dados abaixo e entregue exatamente 4 bullet points curtos (<200 caracteres cada) destacando oportunidades, riscos e ações claras.
Tom profissional em português do Brasil. Cite números específicos.`;

    const userPrompt = `Contexto: ${contexto ?? 'Dashboard Ambienta'}
Filtros: ${JSON.stringify(filtrosVisuais ?? {})}
Dados: ${JSON.stringify(resumoReduzido)}
${dbIndex ? `\n${buildIndexPrompt(dbIndex)}` : ''}`;

    const response = await aiClient.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: runtime.modelQuick,
      temperature: runtime.temperature,
      maxTokens: Math.max(runtime.maxTokens, 512),
    });

    const data: GroqChatResponse = {
      choices: [
        {
          message: { content: response.content },
        },
      ],
    };

    const aiText = data.choices?.[0]?.message?.content?.trim() ?? '';
    const fallbackText = dbIndex ? buildInsightBullets(dbIndex) : '';
    const text = aiText || fallbackText;

    return NextResponse.json({ insights: text });
  } catch (err: unknown) {
    console.error('[API] Erro em /api/ai/insights', err);
    try {
      const resumoAtual = parsedBody?.resumoAtual as Record<string, unknown> | undefined;
      const filtros = (parsedBody?.filtrosVisuais ?? {}) as Record<string, unknown>;
      const canaisSelecionados = Array.isArray((filtros as any).canaisSelecionados)
        ? (filtros as any).canaisSelecionados.filter((c: unknown) => typeof c === 'string')
        : null;
      const situacoesSelecionadas = Array.isArray((filtros as any).situacoesSelecionadas)
        ? (filtros as any).situacoesSelecionadas.filter((n: unknown) => typeof n === 'number')
        : null;
      const periodoInicio = typeof resumoAtual?.dataInicial === 'string' ? resumoAtual.dataInicial : null;
      const periodoFim = typeof resumoAtual?.dataFinal === 'string' ? resumoAtual.dataFinal : null;

      if (periodoInicio && periodoFim) {
        const dbIndex = await buildDbInsightIndex({
          inicio: periodoInicio,
          fim: periodoFim,
          canais: canaisSelecionados,
          situacoes: situacoesSelecionadas,
        });
        if (dbIndex) {
          return NextResponse.json({ insights: buildInsightBullets(dbIndex) });
        }
      }
    } catch (fallbackError) {
      console.error('[API] Fallback DB insights failed', fallbackError);
    }
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
