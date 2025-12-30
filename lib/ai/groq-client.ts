/**
 * Groq API Client
 * Handles all communication with Groq's OpenAI-compatible API
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_BASE_URL = process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatCompletionOptions {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}

export interface ChatCompletionResponse {
    id: string;
    content: string;
    model: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    finishReason: string;
}

type ResponseInputItem = {
    role: 'system' | 'user' | 'assistant';
    content: Array<{ type: 'input_text'; text: string }>;
};

const toResponsesInput = (messages: ChatMessage[]): ResponseInputItem[] => {
    return messages.map((message) => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
    }));
};

const collectResponseText = (data: any): string => {
    const texts: string[] = [];
    const visited = new Set<unknown>();

    const pushText = (value: unknown) => {
        if (typeof value === 'string' && value.length > 0) {
            texts.push(value);
        }
    };

    const walk = (value: unknown, depth: number = 0) => {
        if (!value || depth > 6) return;
        if (typeof value === 'string') {
            pushText(value);
            return;
        }
        if (typeof value !== 'object') return;
        if (visited.has(value)) return;
        visited.add(value);

        if (Array.isArray(value)) {
            for (const entry of value) walk(entry, depth + 1);
            return;
        }

        const obj = value as Record<string, unknown>;
        walk(obj.text, depth + 1);
        walk(obj.output_text, depth + 1);
        walk(obj.content, depth + 1);
        walk(obj.value, depth + 1);
    };

    walk(data?.output);
    walk(data?.output_text);

    if (texts.length === 0) {
        walk(data?.choices?.[0]?.message?.content);
        walk(data?.choices?.[0]?.text);
    }

    return texts.join('').trim();
};

export class GroqClient {
    private apiKey: string;
    private baseUrl: string;
    private defaultModel: string;

    constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
        this.apiKey = options?.apiKey || GROQ_API_KEY || '';
        this.baseUrl = options?.baseUrl || GROQ_BASE_URL;
        this.defaultModel = options?.model || DEFAULT_MODEL;

        if (!this.apiKey) {
            console.warn('[GroqClient] GROQ_API_KEY not configured');
        }
    }

    async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
        if (!this.apiKey) {
            throw new Error('Chave de API não configurada');
        }

        const model = options.model || this.defaultModel;
        const trimmedBase = this.baseUrl.replace(/\/$/, '');
        const isGpt5 = model.startsWith('gpt-5');
        const shouldUseResponsesApi = trimmedBase.includes('api.openai.com') && isGpt5;

        if (shouldUseResponsesApi) {
            const maxOutputTokens = options.maxTokens ?? 1024;
            const adjustedMaxOutputTokens = Math.max(maxOutputTokens, 2000);
            const payload: Record<string, unknown> = {
                model,
                input: toResponsesInput(options.messages),
                max_output_tokens: adjustedMaxOutputTokens,
                reasoning: { effort: 'minimal' },
                text: { format: { type: 'text' }, verbosity: 'low' },
            };

            const response = await fetch(`${trimmedBase}/responses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI Responses error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const content = collectResponseText(data);
            if (!content && process.env.NODE_ENV !== 'production') {
                const summary = {
                    id: data?.id,
                    model: data?.model ?? model,
                    status: data?.status,
                    outputType: Array.isArray(data?.output) ? data.output.map((item: any) => item?.type ?? typeof item) : typeof data?.output,
                    outputLen: Array.isArray(data?.output) ? data.output.length : data?.output ? 1 : 0,
                    outputTextType: typeof data?.output_text,
                    outputTextLen: typeof data?.output_text === 'string' ? data.output_text.length : Array.isArray(data?.output_text) ? data.output_text.length : null,
                };
                console.error('[GroqClient] Empty content from /responses:', JSON.stringify(summary));
                const raw = JSON.stringify(data);
                console.error('[GroqClient] /responses raw head:', raw.slice(0, 800));
                if (raw.length > 800) {
                    console.error('[GroqClient] /responses raw tail:', raw.slice(-800));
                }
            }
            const usage = data?.usage ?? {};
            const promptTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
            const completionTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
            const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

            return {
                id: data.id ?? 'response',
                content,
                model: data.model ?? model,
                usage: {
                    promptTokens,
                    completionTokens,
                    totalTokens,
                },
                finishReason: data?.status ?? 'unknown',
            };
        }

        const response = await fetch(`${trimmedBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: options.messages,
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? 1024,
                stream: options.stream ?? false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Groq API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        return {
            id: data.id,
            content: data.choices?.[0]?.message?.content?.trim() ?? '',
            model: data.model,
            usage: {
                promptTokens: data.usage?.prompt_tokens ?? 0,
                completionTokens: data.usage?.completion_tokens ?? 0,
                totalTokens: data.usage?.total_tokens ?? 0,
            },
            finishReason: data.choices?.[0]?.finish_reason ?? 'unknown',
        };
    }

    /**
     * Simple chat completion with just a user message
     */
    async complete(prompt: string, systemPrompt?: string): Promise<string> {
        const messages: ChatMessage[] = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        messages.push({ role: 'user', content: prompt });

        const response = await this.chat({ messages });
        return response.content;
    }

    /**
     * Check if the client is properly configured
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }
}

// Singleton instance for convenience
let defaultClient: GroqClient | null = null;

export function getGroqClient(): GroqClient {
    if (!defaultClient) {
        defaultClient = new GroqClient();
    }
    return defaultClient;
}

export default GroqClient;
