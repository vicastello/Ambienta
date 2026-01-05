import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import type { ChatMessage } from '@/lib/ai/groq-client';
import { getAIDataProvider } from '@/lib/ai/data-provider';
import { COPILOT_SYSTEM_PROMPT } from '@/lib/ai/prompts/system-prompt';
import { createOpenAICompatibleClient, resolveAiRuntimeConfig, resolveModelForMode } from '@/lib/ai/ai-runtime';

interface ChatRequest {
    message: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    dashboardData?: unknown;
    useDeepAnalysis?: boolean;
    periodDays?: number;
    stream?: boolean;
    screenContext?: { screen?: string; context?: unknown } | null;
}

interface ChatResponse {
    message: string;
    tokensUsed?: number;
    dataSource?: 'dashboard' | 'supabase';
    actionPolicy?: {
        sync: boolean;
        filters: boolean;
    };
}

// Enhanced system prompt for deep analysis mode
const DEEP_ANALYSIS_PROMPT = `${COPILOT_SYSTEM_PROMPT}

## Modo Análise Profunda
Você tem acesso a dados detalhados do Supabase incluindo:
- Vendas: faturamento, pedidos, canais, produtos top, variação vs período anterior
- Estoque: níveis, alertas de baixo estoque, estoque parado, velocidade de venda
- Financeiro: fluxo de caixa, categorias, contas a pagar/receber, tendências

Use esses dados para:
1. Fazer análises comparativas completas
2. Identificar tendências e padrões
3. Sugerir ações específicas com base nos números
4. Alertar sobre riscos iminentes (estoque, caixa, vendas)

Seja específico com números e porcentagens. Cite os dados exatos.`;

const buildActionInstructions = (allowActions: { sync: boolean; filters: boolean }) => {
    if (!allowActions.sync && !allowActions.filters) {
        return `
## Ações disponíveis
Ações desativadas. Não use tags [ACTION] nesta conversa.
`;
    }

    const actionLines: string[] = [];
    if (allowActions.sync) {
        actionLines.push(
            'run_sync_pipeline { diasRecentes?, enrichEnabled?, produtosEnabled?, produtosLimit?, produtosEnrichEstoque?, estoqueOnly? }',
            'sync_recent_orders { diasRecentes }',
            'sync_orders_range { dataInicial, dataFinal }',
            'sync_produtos { limit?, estoqueOnly?, enrichEstoque? }'
        );
    }
    if (allowActions.filters) {
        actionLines.push('set_dashboard_filters { preset?, customStart?, customEnd?, canaisSelecionados?, situacoesSelecionadas? }');
    }

    return `
## Ações disponíveis
Use UMA ou mais tags no formato: [ACTION: {...}]
- Sem markdown, JSON válido.
- Só use ações quando o usuário pedir explicitamente.
- Nunca invente canais/situações; use apenas as opções do contexto.

Tipos suportados:
${actionLines.map((line, idx) => `${idx + 1}. ${line}`).join('\n')}
`;
};

const buildChatCompletionUrl = (baseUrl: string) => {
    const trimmed = baseUrl.replace(/\/$/, '');
    return `${trimmed}/chat/completions`;
};

const buildResponsesUrl = (baseUrl: string) => {
    const trimmed = baseUrl.replace(/\/$/, '');
    return `${trimmed}/responses`;
};

const shouldUseResponsesApi = (baseUrl: string, model: string) =>
    baseUrl.includes('api.openai.com') && model.startsWith('gpt-5');

const extractResponsesOutput = (payload: unknown): string => {
    const data = payload as Record<string, unknown> | null;
    if (!data) return '';
    if (typeof (data as any).output_text === 'string') return String((data as any).output_text);
    const output = Array.isArray((data as any).output) ? (data as any).output : [];
    const chunks: string[] = [];
    output.forEach((item: any) => {
        const isMessage = item?.type === 'message' || item?.role === 'assistant';
        if (!isMessage) return;
        const parts = Array.isArray(item?.content) ? item.content : [];
        parts.forEach((part: any) => {
            if (typeof part?.text === 'string') chunks.push(part.text);
            if (typeof part?.output_text === 'string') chunks.push(part.output_text);
        });
    });
    return chunks.join('');
};

const toResponsesInput = (messages: ChatMessage[]) =>
    messages.map((message) => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
    }));

const encodeSse = (payload: Record<string, unknown>) => {
    return `data: ${JSON.stringify(payload)}\n\n`;
};

const parseSseEvents = (chunk: string, buffer: string) => {
    const nextBuffer = buffer + chunk;
    const events: string[] = [];
    let remaining = nextBuffer;
    let boundaryIndex = remaining.indexOf('\n\n');
    while (boundaryIndex !== -1) {
        events.push(remaining.slice(0, boundaryIndex));
        remaining = remaining.slice(boundaryIndex + 2);
        boundaryIndex = remaining.indexOf('\n\n');
    }
    return { events, remaining };
};

const extractEventData = (event: string) => {
    const lines = event.split('\n');
    const dataLines = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s*/, '').trim());
    return dataLines.join('');
};

const buildScreenContextPrompt = (screen?: string, context?: unknown) => {
    if (!context) return '';
    const label = screen ? `## Contexto da tela (${screen})` : '## Contexto da tela';
    let serialized = '';
    try {
        serialized = JSON.stringify(context);
    } catch {
        serialized = String(context);
    }
    const truncated = serialized.length > 2000 ? `${serialized.slice(0, 2000)}…` : serialized;
    return `${label}\n${truncated}`;
};

export async function POST(req: NextRequest): Promise<NextResponse<ChatResponse | { message: string; details?: string }>> {
    try {
        const runtime = await resolveAiRuntimeConfig();
        if (!runtime.apiKey) {
            return NextResponse.json(
                { message: 'IA não configurada. Configure as chaves em /configuracoes.' },
                { status: 500 }
            );
        }
        const aiClient = createOpenAICompatibleClient(runtime);

        const body = await req.json().catch(() => null) as ChatRequest | null;

        if (!body?.message?.trim()) {
            return NextResponse.json(
                { message: 'Mensagem não pode estar vazia' },
                { status: 400 }
            );
        }

        // Determine if we need deep analysis based on message content
        const deepAnalysisKeywords = [
            'analise', 'análise', 'detalhe', 'profund', 'completo', 'completa',
            'estoque', 'inventário', 'financeiro', 'fluxo', 'caixa',
            'tendência', 'comparar', 'comparação', 'evolução',
            'diagnóstico', 'problema', 'risco', 'oportunidade',
            'margem', 'lucro', 'custo', 'despesa', 'receita'
        ];

        const messageWords = body.message.toLowerCase();
        const shouldUseDeepAnalysis = body.useDeepAnalysis ||
            deepAnalysisKeywords.some(kw => messageWords.includes(kw));
        const modelMode = shouldUseDeepAnalysis ? 'deep' : 'quick';

        let contextPrompt = '';
        let dataSource: 'dashboard' | 'supabase' = 'dashboard';

        if (shouldUseDeepAnalysis) {
            // Use AI Data Provider for comprehensive data
            try {
                console.log('[AI Chat] Using deep analysis mode with Supabase data');
                const dataProvider = getAIDataProvider();
                const comprehensiveData = await dataProvider.getComprehensiveData(body.periodDays || 30);
                contextPrompt = dataProvider.formatForAI(comprehensiveData);
                dataSource = 'supabase';
            } catch (dataError) {
                console.error('[AI Chat] Failed to get deep analysis data:', dataError);
                // Fall back to dashboard data if available
                if (body.dashboardData) {
                    contextPrompt = `Dados básicos do dashboard disponíveis. Análise profunda não disponível devido a erro.`;
                }
            }
        } else if (body.dashboardData) {
            // Use simple dashboard data for quick questions
            const { buildDashboardContext, truncateContext } = await import('@/lib/ai/context-builder');
            const { buildDashboardContextPrompt } = await import('@/lib/ai/prompts/system-prompt');
            const dashboardContext = buildDashboardContext(body.dashboardData);
            const truncatedContext = truncateContext(dashboardContext, 2000);
            contextPrompt = buildDashboardContextPrompt(truncatedContext);
        }

        const screenContextPrompt = buildScreenContextPrompt(
            body?.screenContext?.screen,
            body?.screenContext?.context
        );
        if (screenContextPrompt) {
            contextPrompt = contextPrompt ? `${contextPrompt}\n\n${screenContextPrompt}` : screenContextPrompt;
        }

        // Build messages array
        const actionInstructions = buildActionInstructions(runtime.allowActions);
        const systemPrompt = (shouldUseDeepAnalysis ? DEEP_ANALYSIS_PROMPT : COPILOT_SYSTEM_PROMPT) + actionInstructions;
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: systemPrompt + (contextPrompt ? `\n\n${contextPrompt}` : ''),
            },
        ];

        const model = resolveModelForMode(runtime, modelMode);
        const wantsStream = Boolean(body?.stream) || req.nextUrl.searchParams.get('stream') === '1';

        // Add conversation history (limited to last 8 messages for deep analysis)
        const historyLimit = shouldUseDeepAnalysis ? 8 : 6;
        if (body.conversationHistory?.length) {
            const history = body.conversationHistory.slice(-historyLimit);
            for (const msg of history) {
                messages.push({
                    role: msg.role,
                    content: msg.content,
                });
            }
        }

        // Add current user message
        messages.push({
            role: 'user',
            content: body.message,
        });

        console.log('[AI Chat] Processing message:', body.message.substring(0, 50) + '...',
            `(mode: ${shouldUseDeepAnalysis ? 'deep' : 'quick'}, dataSource: ${dataSource})`);

        const temperature = shouldUseDeepAnalysis
            ? Math.min(runtime.temperature, 0.6)
            : runtime.temperature;
        const maxTokens = shouldUseDeepAnalysis
            ? Math.max(runtime.maxTokens, 900)
            : runtime.maxTokens;

        if (wantsStream) {
            if (shouldUseResponsesApi(runtime.baseUrl, model)) {
                const payload: Record<string, unknown> = {
                    model,
                    input: toResponsesInput(messages),
                    max_output_tokens: maxTokens,
                    stream: false,
                };
                if (!(model.startsWith('gpt-5'))) {
                    payload.temperature = temperature;
                }

                const completionResponse = await fetch(buildResponsesUrl(runtime.baseUrl), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${runtime.apiKey}`,
                    },
                    body: JSON.stringify(payload),
                });

                if (!completionResponse.ok) {
                    const errorText = await completionResponse.text();
                    throw new Error(`Chat responses error ${completionResponse.status}: ${errorText}`);
                }

                const completionJson = await completionResponse.json();
                const content = extractResponsesOutput(completionJson);
                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode(encodeSse({
                            type: 'meta',
                            actionPolicy: runtime.allowActions,
                            dataSource,
                            model,
                            mode: modelMode,
                        })));
                        if (content) {
                            controller.enqueue(encoder.encode(encodeSse({ type: 'delta', content })));
                        }
                        controller.enqueue(encoder.encode(encodeSse({ type: 'done' })));
                        controller.close();
                    },
                });

                return new NextResponse(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache, no-transform',
                        Connection: 'keep-alive',
                    },
                });
            }

            const completionResponse = await fetch(buildChatCompletionUrl(runtime.baseUrl), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${runtime.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    stream: true,
                }),
            });

            if (!completionResponse.ok || !completionResponse.body) {
                const errorText = await completionResponse.text();
                throw new Error(`Chat stream error ${completionResponse.status}: ${errorText}`);
            }

            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            const stream = new ReadableStream({
                async start(controller) {
                    controller.enqueue(encoder.encode(encodeSse({
                        type: 'meta',
                        actionPolicy: runtime.allowActions,
                        dataSource,
                        model,
                        mode: modelMode,
                    })));

                    const reader = completionResponse.body!.getReader();
                    let buffer = '';
                    try {
                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            const chunk = decoder.decode(value, { stream: true });
                            const parsed = parseSseEvents(chunk, buffer);
                            buffer = parsed.remaining;

                            for (const event of parsed.events) {
                                const data = extractEventData(event);
                                if (!data) continue;
                                if (data === '[DONE]') {
                                    controller.enqueue(encoder.encode(encodeSse({ type: 'done' })));
                                    controller.close();
                                    return;
                                }
                                try {
                                    const json = JSON.parse(data) as {
                                        choices?: Array<{ delta?: { content?: string } | null; finish_reason?: string | null }>;
                                    };
                                    const delta = json.choices?.[0]?.delta?.content;
                                    if (delta) {
                                        controller.enqueue(encoder.encode(encodeSse({ type: 'delta', content: delta })));
                                    }
                                } catch {
                                    controller.enqueue(encoder.encode(encodeSse({ type: 'raw', content: data })));
                                }
                            }
                        }
                    } catch (error) {
                        console.error('[AI Chat] Stream error:', error);
                        controller.enqueue(encoder.encode(encodeSse({ type: 'error', message: 'Erro no streaming' })));
                        controller.close();
                    }
                },
            });

            return new NextResponse(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache, no-transform',
                    Connection: 'keep-alive',
                },
            });
        }

        const response = await aiClient.chat({
            messages,
            model,
            temperature,
            maxTokens,
        });

        console.log('[AI Chat] Response tokens:', response.usage.totalTokens);

        return NextResponse.json({
            message: response.content,
            tokensUsed: response.usage.totalTokens,
            dataSource,
            actionPolicy: runtime.allowActions,
        });
    } catch (err) {
        console.error('[AI Chat] Error:', err);
        return NextResponse.json(
            {
                message: 'Erro ao processar mensagem',
                details: getErrorMessage(err) || 'Erro desconhecido',
            },
            { status: 500 }
        );
    }
}
