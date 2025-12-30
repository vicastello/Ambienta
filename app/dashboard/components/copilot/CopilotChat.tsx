'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Sparkles, Loader2, ChevronDown, History, Trash2, Plus, Database, TrendingUp, AlertTriangle, Lightbulb, Package, DollarSign, BarChart3 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { ActionCard, ActionType } from './ActionCard';
import { CopilotChart } from './CopilotChart';
import '@/app/liquid-glass-2.css';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

interface Conversation {
    id: string;
    title: string;
    messageCount: number;
    updatedAt: string;
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
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [useSupabase, setUseSupabase] = useState(true);
    const [dataSource, setDataSource] = useState<'dashboard' | 'supabase' | null>(null);
    const pathname = usePathname();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [isThinking, setIsThinking] = useState(false);

    // Dynamic suggestions based on current route
    const getSuggestedPrompts = () => {
        if (pathname?.includes('/financeiro')) {
            return [
                { id: 'fluxo', label: 'Fluxo de Caixa', prompt: 'Como está meu fluxo de caixa projetado para os próximos 30 dias?', icon: DollarSign },
                { id: 'despesas', label: 'Análise de Despesas', prompt: 'Quais foram as maiores categorias de despesa este mês?', icon: BarChart3 },
                { id: 'conciliacao', label: 'Conciliar', prompt: 'Existem pagamentos pendentes de conciliação?', icon: AlertTriangle },
            ];
        }
        if (pathname?.includes('/produtos') || pathname?.includes('/estoque')) {
            return [
                { id: 'curva-abc', label: 'Curva ABC', prompt: 'Quais são meus produtos Curva A atualmente?', icon: TrendingUp },
                { id: 'sem-giro', label: 'Sem Giro', prompt: 'Quais produtos estão sem vendas há mais de 30 dias?', icon: AlertTriangle },
                { id: 'reposicao', label: 'Reposição', prompt: 'Quais produtos precisam de reposição urgente?', icon: Package },
            ];
        }
        if (pathname?.includes('/compras')) {
            return [
                { id: 'sugestao-compra', label: 'Sugestão de Compra', prompt: 'Gere uma sugestão de compra baseada nas vendas recentes.', icon: Lightbulb },
                { id: 'pendentes', label: 'Pedidos Pendentes', prompt: 'Quais pedidos de compra estão atrasados?', icon: AlertTriangle },
            ];
        }
        // Default Dashboard
        return [
            { id: 'resumo', label: 'Resumo do Dia', prompt: 'Faça um resumo executivo do dia de hoje.', icon: Sparkles },
            { id: 'vendas', label: 'Vendas', prompt: 'Qual o desempenho de vendas comparado à semana anterior?', icon: TrendingUp },
            { id: 'alerta', label: 'Alertas', prompt: 'Existe algum alerta crítico que preciso saber?', icon: AlertTriangle },
        ];
    };

    const suggestedPrompts = getSuggestedPrompts();

    // Load conversations from Supabase on mount
    useEffect(() => {
        if (useSupabase) {
            loadConversations();
        }
    }, [useSupabase]);

    const loadConversations = async () => {
        try {
            const res = await fetch('/api/ai/conversations?limit=15');
            if (res.ok) {
                const { data } = await res.json();
                setConversations(data || []);
            } else {
                console.log('[CopilotChat] Conversations API not ready, handling history locally');
                setUseSupabase(false);
            }
        } catch (err) {
            console.log('[CopilotChat] Connectivity error, handling history locally');
            setUseSupabase(false);
        }
    };

    const loadConversation = async (conv: Conversation) => {
        try {
            if (!useSupabase) return;

            const res = await fetch(`/api/ai/conversations?id=${conv.id}`);
            if (res.ok) {
                const { data } = await res.json();
                setCurrentConversationId(data.id);
                setMessages(data.messages?.map((m: { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    timestamp: m.createdAt,
                })) || []);
                setShowHistory(false);
                setError(null);
            }
        } catch (err) {
            setError('Erro ao carregar conversa');
        }
    };

    const startNewConversation = async () => {
        setMessages([]);
        setCurrentConversationId(null);
        setShowHistory(false);
        setError(null);
        setDataSource(null);
    };

    const deleteConversation = async (id: string) => {
        try {
            if (useSupabase) {
                await fetch(`/api/ai/conversations?id=${id}`, { method: 'DELETE' });
            }
            setConversations(prev => prev.filter(c => c.id !== id));
            if (currentConversationId === id) {
                startNewConversation();
            }
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

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
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setError(null);
        setIsLoading(true);
        setIsThinking(true);

        try {
            // Create conversation if needed (persistence)
            let convId = currentConversationId;
            if (useSupabase) {
                if (!convId) {
                    try {
                        const createRes = await fetch('/api/ai/conversations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'create', contextPage: 'dashboard' }),
                        });
                        if (createRes.ok) {
                            const { data } = await createRes.json();
                            convId = data.id;
                            setCurrentConversationId(convId);
                        } else {
                            setUseSupabase(false);
                        }
                    } catch {
                        setUseSupabase(false);
                    }
                }

                // Save user message to Supabase
                if (convId && useSupabase) { // Check useSupabase again as it might have changed
                    await fetch('/api/ai/conversations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'addMessage',
                            conversationId: convId,
                            role: 'user',
                            content: messageText.trim(),
                        }),
                    }).catch(() => { /* ignore persistence errors */ });
                }
            }

            // Get AI response
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
                timestamp: new Date().toISOString(),
            };

            setIsThinking(false);
            setMessages(prev => [...prev, assistantMessage]);
            setDataSource(data.dataSource || null);

            // Save assistant message to Supabase
            if (convId && useSupabase) {
                await fetch('/api/ai/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'addMessage',
                        conversationId: convId,
                        role: 'assistant',
                        content: data.message,
                        tokensUsed: data.tokensUsed,
                    }),
                }).catch(() => { /* ignore persistence errors */ });

                // Refresh conversations list
                loadConversations();
            }
        } catch (err) {
            setIsThinking(false);
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

    const handleAction = (type: ActionType, payload: any) => {
        console.log('Executing action:', type, payload);
        if (type === 'navigate') {
            window.location.href = payload.path;
        }
    };

    const renderMessageContent = (content: string) => {
        const parts = content.split(/(\[ACTION: \{.*?\}\])/g);

        return parts.map((part, index) => {
            const actionMatch = part.match(/^\[ACTION: (\{.*\})\]$/);

            if (actionMatch) {
                try {
                    const actionData = JSON.parse(actionMatch[1]);

                    if (actionData.type === 'chart') {
                        return (
                            <CopilotChart
                                key={`chart-${index}`}
                                type={actionData.payload.type}
                                data={actionData.payload.data}
                                dataKey={actionData.payload.dataKey}
                                labelKey={actionData.payload.labelKey}
                                title={actionData.title}
                                color={actionData.payload.color}
                            />
                        );
                    }

                    return (
                        <ActionCard
                            key={`action-${index}`}
                            type={actionData.type}
                            title={actionData.title}
                            description={actionData.description}
                            payload={actionData.payload}
                            onExecute={handleAction}
                        />
                    );
                } catch (e) {
                    console.error('Failed to parse action json', e);
                    return null;
                }
            }

            if (!part.trim()) return null;

            return (
                <div
                    key={`text-${index}`}
                    className="text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: formatMessage(part) }}
                />
            );
        });
    };

    const formatMessage = (content: string) => {
        return content
            .split('\n')
            .map((line) => {
                // Handle bold text first
                line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

                // Handle italic text with single asterisks (but not bullet points)
                line = line.replace(/(?<!\*)\*([^*\s][^*]*[^*\s])\*(?!\*)/g, '<em>$1</em>');

                // Headers
                if (line.startsWith('### ')) {
                    return `<h4 class="text-sm font-semibold text-accent-light mt-3 mb-1 animate-fade-scale">${line.slice(4)}</h4>`;
                }
                if (line.startsWith('## ')) {
                    return `<h3 class="font-semibold text-base text-white mt-4 mb-2 animate-fade-scale">${line.slice(3)}</h3>`;
                }
                if (line.startsWith('# ')) {
                    return `<h2 class="font-bold text-lg text-white mt-4 mb-2 animate-fade-scale">${line.slice(2)}</h2>`;
                }

                // Bullet points - more flexible matching
                if (line.match(/^[\-\*]\s*\S/)) {
                    const bulletContent = line.replace(/^[\-\*]\s*/, '');
                    return `<li class="ml-4 mb-1 text-white/80">• ${bulletContent}</li>`;
                }
                // Numbered lists
                if (line.match(/^\d+\.\s/)) {
                    return `<li class="ml-4 mb-1 text-white/80">${line}</li>`;
                }

                // Emoji-based callouts
                if (line.includes('✅')) return `<div class="bg-positive/5 border-l-2 border-positive pl-3 py-1 my-1 text-sm text-white/90 animate-fade-scale">${line}</div>`;
                if (line.includes('⚠️')) return `<div class="bg-warning/5 border-l-2 border-warning pl-3 py-1 my-1 text-sm text-white/90 animate-fade-scale">${line}</div>`;
                if (line.includes('🚨')) return `<div class="bg-negative/5 border-l-2 border-negative pl-3 py-1 my-1 text-sm text-white/90 animate-fade-scale">${line}</div>`;
                if (line.includes('💡')) return `<div class="bg-accent/5 border-l-2 border-accent pl-3 py-1 my-1 text-sm text-white/90 animate-fade-scale">${line}</div>`;

                // Key-value pairs (but not URLs or times with multiple colons)
                if (line.includes(':') && !line.includes('http') && !line.match(/\d+:\d+/)) {
                    const colonIndex = line.indexOf(':');
                    const key = line.slice(0, colonIndex).trim();
                    const value = line.slice(colonIndex + 1).trim();
                    if (key.length < 30 && key.length > 0 && value.length > 0) {
                        return `<div class="flex justify-between py-0.5 border-b border-white/5"><span class="text-muted text-xs uppercase tracking-wide">${key}:</span><span class="font-medium text-white">${value}</span></div>`;
                    }
                }

                return line ? `<p class="mb-1">${line}</p>` : '<div class="h-2"></div>';
            })
            .join('');
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return 'Hoje';
        if (days === 1) return 'Ontem';
        if (days < 7) return `${days}d atrás`;
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent-dark text-white shadow-[0_0_30px_rgba(0,156,166,0.6),0_0_60px_rgba(0,156,166,0.3)] hover:shadow-[0_0_40px_rgba(0,156,166,0.8),0_0_80px_rgba(0,156,166,0.4)] transition-all duration-300 hover:scale-110 animate-pulse-glow group backdrop-blur-xl border border-white/20"
                aria-label="Abrir Copilot"
            >
                <Sparkles size={24} className="group-hover:rotate-12 transition-transform drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                {conversations.length > 0 && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white/30 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"></span>
                )}
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[650px] max-h-[calc(100vh-4rem)] flex flex-col animate-slide-up overflow-hidden ${className}`}
            style={{
                background: 'linear-gradient(165deg, rgba(12, 18, 30, 0.95), rgba(8, 12, 22, 0.98))',
                backdropFilter: 'blur(40px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(40px) saturate(1.2)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '2rem',
                boxShadow: '0 25px 80px -12px rgba(0, 0, 0, 0.6), 0 0 40px -10px rgba(0, 156, 166, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            }}
        >
            {/* Glass Header with gradient border */}
            <div className="relative flex items-center justify-between px-6 py-5 shrink-0 z-10"
                style={{
                    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl text-accent relative"
                        style={{
                            background: 'linear-gradient(135deg, rgba(0, 156, 166, 0.2), rgba(0, 156, 166, 0.08))',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(0, 156, 166, 0.3)',
                            boxShadow: '0 4px 20px -4px rgba(0, 156, 166, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                        }}
                    >
                        <Sparkles size={18} className="drop-shadow-[0_0_6px_rgba(0,156,166,0.5)]" />
                    </div>
                    <div>
                        <h2 className="font-bold text-white text-base leading-tight tracking-tight text-glow">Ambienta AI</h2>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[10px] uppercase tracking-wider text-muted font-medium">Online</span>
                            {dataSource === 'supabase' && (
                                <span className="text-[10px] text-accent-light ml-2 flex items-center gap-1">
                                    <Database size={8} /> Deep
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`p-2.5 rounded-xl transition-all duration-200 text-white/60 hover:text-white ${showHistory ? 'text-white' : ''}`}
                        style={{
                            background: showHistory ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                            backdropFilter: 'blur(8px)',
                            border: showHistory ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid transparent'
                        }}
                        title="Histórico"
                    >
                        <History size={18} />
                    </button>
                    <button
                        onClick={startNewConversation}
                        className="p-2.5 rounded-xl transition-all duration-200 text-white/60 hover:text-white hover:bg-white/10"
                        style={{ backdropFilter: 'blur(8px)' }}
                        title="Novo Chat"
                    >
                        <Plus size={18} />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2.5 rounded-xl transition-all duration-200 text-white/60 hover:text-white hover:bg-white/10"
                        style={{ backdropFilter: 'blur(8px)' }}
                        title="Fechar"
                    >
                        <ChevronDown size={20} />
                    </button>
                </div>
            </div>

            {/* History Overlay with enhanced glass effect */}
            {showHistory && (
                <div className="absolute inset-0 top-[80px] z-20 transition-all duration-300 animate-fade-scale overflow-y-auto"
                    style={{
                        background: 'linear-gradient(180deg, rgba(8, 12, 22, 0.98), rgba(5, 8, 16, 0.99))',
                        backdropFilter: 'blur(30px) saturate(1.1)',
                        WebkitBackdropFilter: 'blur(30px) saturate(1.1)'
                    }}
                >
                    <div className="p-4 space-y-2">
                        <h3 className="text-xs font-bold text-muted uppercase tracking-widest px-2 mb-4">Conversas Recentes</h3>
                        {conversations.length === 0 ? (
                            <p className="text-sm text-center text-muted py-8">Nenhuma conversa encontrada</p>
                        ) : (
                            conversations.map(conv => (
                                <div
                                    key={conv.id}
                                    className="group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-200"
                                    onClick={() => loadConversation(conv)}
                                    style={{
                                        background: conv.id === currentConversationId
                                            ? 'linear-gradient(135deg, rgba(0, 156, 166, 0.1), rgba(0, 156, 166, 0.05))'
                                            : 'transparent',
                                        border: conv.id === currentConversationId
                                            ? '1px solid rgba(0, 156, 166, 0.2)'
                                            : '1px solid transparent',
                                        backdropFilter: 'blur(8px)'
                                    }}
                                >
                                    <div className="p-2 rounded-xl text-muted group-hover:text-accent transition-colors"
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            backdropFilter: 'blur(8px)'
                                        }}
                                    >
                                        <MessageSquare size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white font-medium truncate">{conv.title || 'Nova conversa'}</p>
                                        <p className="text-[10px] text-muted flex items-center gap-2 mt-0.5">
                                            <span>{formatDate(conv.updatedAt)}</span>
                                            <span>•</span>
                                            <span>{conv.messageCount} msgs</span>
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteConversation(conv.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-500/20 text-red-400 transition-all"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Messages Area with glass background */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 scrollbar-hide relative"
                style={{
                    background: 'linear-gradient(180deg, transparent, rgba(0, 156, 166, 0.02))'
                }}
            >
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center pb-12 animate-fade-scale">
                        <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 relative"
                            style={{
                                background: 'linear-gradient(135deg, rgba(0, 156, 166, 0.15), rgba(139, 92, 246, 0.1))',
                                backdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                boxShadow: '0 8px 40px -8px rgba(0, 156, 166, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                            }}
                        >
                            <Sparkles size={36} className="text-accent drop-shadow-[0_0_12px_rgba(0,156,166,0.6)]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                        </div>
                        <h3 className="text-xl font-bold mb-2"
                            style={{
                                background: 'linear-gradient(135deg, #fff, rgba(255,255,255,0.6))',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                textShadow: '0 0 30px rgba(255,255,255,0.1)'
                            }}
                        >
                            Como posso ajudar hoje?
                        </h3>
                        <p className="text-sm text-muted mb-8 max-w-[260px]">
                            Tenho acesso aos seus dados de vendas, estoque e financeiro para análises profundas.
                        </p>

                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            {suggestedPrompts.map((prompt, idx) => {
                                const Icon = prompt.icon;
                                return (
                                    <button
                                        key={prompt.id}
                                        onClick={() => sendMessage(prompt.prompt)}
                                        className="text-left text-sm p-4 rounded-2xl transition-all duration-300 text-white/80 hover:text-white group flex items-center gap-3"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))',
                                            backdropFilter: 'blur(12px)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            boxShadow: '0 4px 20px -4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                            animationDelay: `${idx * 100}ms`
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 156, 166, 0.15), rgba(0, 156, 166, 0.05))';
                                            e.currentTarget.style.borderColor = 'rgba(0, 156, 166, 0.3)';
                                            e.currentTarget.style.boxShadow = '0 8px 30px -4px rgba(0, 156, 166, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                                            e.currentTarget.style.boxShadow = '0 4px 20px -4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                                        }}
                                    >
                                        <span className="p-2.5 rounded-xl text-accent transition-all duration-300 group-hover:scale-110"
                                            style={{
                                                background: 'linear-gradient(135deg, rgba(0, 156, 166, 0.15), rgba(0, 156, 166, 0.08))',
                                                backdropFilter: 'blur(8px)',
                                                border: '1px solid rgba(0, 156, 166, 0.2)',
                                                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                                            }}
                                        >
                                            <Icon size={16} className="drop-shadow-[0_0_4px_rgba(0,156,166,0.5)]" />
                                        </span>
                                        <span className="font-medium">{prompt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    messages.map((message, idx) => (
                        <div
                            key={message.id}
                            className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} animate-slide-up`}
                        >
                            {message.role === 'assistant' ? (
                                <div className="flex gap-4 max-w-[95%]">
                                    <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-500 p-[1px] shadow-lg mt-1">
                                        <div className="w-full h-full rounded-full bg-surface-dark flex items-center justify-center">
                                            <Sparkles size={14} className="text-accent" />
                                        </div>
                                    </div>
                                    <div className="ai-text-block">
                                        {renderMessageContent(message.content)}
                                    </div>
                                </div>
                            ) : (
                                <div className="user-glass-pill px-5 py-3 text-sm shadow-xl max-w-[85%]">
                                    {message.content}
                                </div>
                            )}
                        </div>
                    ))
                )}

                {isThinking && (
                    <div className="flex gap-4 animate-slide-up">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-500 p-[1px] shadow-lg mt-1 animate-pulse">
                            <div className="w-full h-full rounded-full bg-surface-dark flex items-center justify-center">
                                <Sparkles size={14} className="text-accent" />
                            </div>
                        </div>
                        <div className="flex items-center gap-1 h-8">
                            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-[thinkingDots_1s_infinite_0ms]"></span>
                            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-[thinkingDots_1s_infinite_200ms]"></span>
                            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-[thinkingDots_1s_infinite_400ms]"></span>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex justify-center mt-4 animate-slide-up">
                        <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-md rounded-full px-4 py-2 text-xs text-red-300 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                            {error}
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Floating Input Capsule with enhanced glass effect */}
            <div className="p-4 relative z-20"
                style={{
                    background: 'linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.2))'
                }}
            >
                <form
                    onSubmit={handleSubmit}
                    className={`p-1.5 flex items-end gap-2 transition-all duration-300 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
                    style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))',
                        backdropFilter: 'blur(20px) saturate(1.5)',
                        WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '9999px',
                        boxShadow: '0 4px 24px -1px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                    }}
                >
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Pergunte qualquer coisa..."
                        rows={1}
                        className="flex-1 bg-transparent border-none px-4 py-3 text-sm resize-none focus:ring-0 focus:outline-none placeholder:text-white/30 text-white max-h-32"
                        disabled={isLoading}
                        style={{ minHeight: '48px' }}
                    />
                    <div className="flex pb-1.5 pr-1.5">
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="p-2.5 rounded-full transition-all duration-300 flex items-center justify-center"
                            style={{
                                background: input.trim()
                                    ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))'
                                    : 'rgba(255, 255, 255, 0.05)',
                                color: input.trim() ? 'white' : 'rgba(255, 255, 255, 0.2)',
                                boxShadow: input.trim() ? '0 4px 20px -4px rgba(0, 156, 166, 0.5)' : 'none',
                                transform: input.trim() ? 'scale(1) rotate(0deg)' : 'scale(0.9) rotate(12deg)',
                                cursor: input.trim() ? 'pointer' : 'default'
                            }}
                            aria-label="Enviar"
                        >
                            <Send size={18} className={input.trim() ? "translate-x-0.5" : ""} />
                        </button>
                    </div>
                </form>
                <p className="text-[10px] text-center mt-3 font-medium tracking-wide"
                    style={{ color: 'rgba(255, 255, 255, 0.2)' }}
                >
                    Powered by Ambienta Intelligence
                </p>
            </div>
        </div>
    );
}

// Simple Helper Icon
const ArrowRightIcon = ({ size = 16, className = "" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
    </svg>
);

export default CopilotChat;
