import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { GroqClient, type ChatMessage } from '@/lib/ai/groq-client';
import { buildDashboardContext, truncateContext } from '@/lib/ai/context-builder';
import { COPILOT_SYSTEM_PROMPT, buildDashboardContextPrompt } from '@/lib/ai/prompts/system-prompt';

interface ChatRequest {
    message: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    dashboardData?: unknown;
    context?: {
        currentPage?: string;
        filters?: Record<string, unknown>;
    };
}

interface ChatResponse {
    message: string;
    tokensUsed?: number;
}

const groq = new GroqClient();

export async function POST(req: NextRequest): Promise<NextResponse<ChatResponse | { message: string; details?: string }>> {
    try {
        if (!groq.isConfigured()) {
            return NextResponse.json(
                { message: 'GROQ_API_KEY não configurada' },
                { status: 500 }
            );
        }

        const body = await req.json().catch(() => null) as ChatRequest | null;

        if (!body?.message?.trim()) {
            return NextResponse.json(
                { message: 'Mensagem não pode estar vazia' },
                { status: 400 }
            );
        }

        // Build context from dashboard data
        let contextPrompt = '';
        if (body.dashboardData) {
            const dashboardContext = buildDashboardContext(body.dashboardData);
            const truncatedContext = truncateContext(dashboardContext, 2000);
            contextPrompt = buildDashboardContextPrompt(truncatedContext);
        }

        // Build messages array
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: COPILOT_SYSTEM_PROMPT + (contextPrompt ? `\n\n${contextPrompt}` : '')
            },
        ];

        // Add conversation history (limited to last 6 messages to save tokens)
        if (body.conversationHistory?.length) {
            const history = body.conversationHistory.slice(-6);
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

        console.log('[AI Chat] Processing message:', body.message.substring(0, 50) + '...');

        const response = await groq.chat({
            messages,
            temperature: 0.7,
            maxTokens: 800,
        });

        console.log('[AI Chat] Response tokens:', response.usage.totalTokens);

        return NextResponse.json({
            message: response.content,
            tokensUsed: response.usage.totalTokens,
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
