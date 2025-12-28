'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { SUGGESTED_PROMPTS } from '@/lib/ai/prompts/system-prompt';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface CopilotChatProps {
    dashboardData?: unknown;
    className?: string;
}

export function CopilotChat({ dashboardData, className = '' }: CopilotChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const sendMessage = async (messageText: string) => {
        if (!messageText.trim() || isLoading) return;

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: messageText.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setError(null);
        setIsLoading(true);

        try {
            const conversationHistory = messages.map(m => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText.trim(),
                    conversationHistory,
                    dashboardData,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.details || 'Erro ao enviar mensagem');
            }

            const assistantMessage: Message = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: data.message,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro desconhecido');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const handleSuggestedPrompt = (prompt: string) => {
        sendMessage(prompt);
    };

    const formatMessage = (content: string) => {
        // Simple markdown-like formatting
        return content
            .split('\n')
            .map((line, i) => {
                // Bold
                line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                // Headers
                if (line.startsWith('### ')) {
                    return `<h4 class="font-semibold mt-2 mb-1">${line.slice(4)}</h4>`;
                }
                if (line.startsWith('## ')) {
                    return `<h3 class="font-semibold text-lg mt-2 mb-1">${line.slice(3)}</h3>`;
                }
                // List items
                if (line.match(/^[\-\*]\s/)) {
                    return `<li class="ml-4">${line.slice(2)}</li>`;
                }
                if (line.match(/^\d+\.\s/)) {
                    return `<li class="ml-4">${line}</li>`;
                }
                return line ? `<p>${line}</p>` : '<br/>';
            })
            .join('');
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-accent text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 ${className}`}
                aria-label="Abrir Copilot"
            >
                <Sparkles size={20} />
                <span className="font-medium">Copilot</span>
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] flex flex-col bg-surface-dark rounded-2xl shadow-2xl border border-white/10 overflow-hidden ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-accent/10 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-accent" />
                    <span className="font-semibold">Ambienta Copilot</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        aria-label="Minimizar"
                    >
                        <ChevronDown size={18} />
                    </button>
                    <button
                        onClick={() => {
                            setIsOpen(false);
                            setMessages([]);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        aria-label="Fechar"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-96 min-h-48">
                {messages.length === 0 ? (
                    <div className="text-center py-4">
                        <MessageSquare size={32} className="mx-auto mb-3 text-muted" />
                        <p className="text-sm text-muted mb-4">
                            Olá! Sou o Copilot da Ambienta. Como posso ajudar?
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {SUGGESTED_PROMPTS.slice(0, 3).map(prompt => (
                                <button
                                    key={prompt.id}
                                    onClick={() => handleSuggestedPrompt(prompt.prompt)}
                                    className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                                >
                                    {prompt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map(message => (
                        <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${message.role === 'user'
                                        ? 'bg-accent text-white rounded-br-md'
                                        : 'bg-white/5 rounded-bl-md'
                                    }`}
                            >
                                {message.role === 'assistant' ? (
                                    <div
                                        className="text-sm prose prose-invert prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                                    />
                                ) : (
                                    <p className="text-sm">{message.content}</p>
                                )}
                            </div>
                        </div>
                    ))
                )}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white/5 rounded-2xl rounded-bl-md px-4 py-3">
                            <Loader2 size={18} className="animate-spin text-accent" />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="bg-negative/10 border border-negative/20 rounded-lg px-3 py-2 text-sm text-negative">
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-white/10">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite sua pergunta..."
                        rows={1}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/25 placeholder:text-muted"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="p-2.5 rounded-xl bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
                        aria-label="Enviar"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </form>
        </div>
    );
}

export default CopilotChat;
