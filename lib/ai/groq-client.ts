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
            throw new Error('GROQ_API_KEY não configurada');
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: options.model || this.defaultModel,
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
