'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle, AlertTriangle, RefreshCw, X } from 'lucide-react';

type SyncStats = {
    synced: number;
    linked: number;
    failed: number;
    skipped: number;
};

type SyncBannerProps = {
    orders: Array<{ marketplaceOrderId: string; marketplace: string; syncType?: 'link' | 'escrow' }>;
    onComplete: () => void;
    autoStart?: boolean;
};

export function SyncBanner({ orders, onComplete, autoStart = true }: SyncBannerProps) {
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [status, setStatus] = useState<'idle' | 'syncing' | 'completed' | 'error'>('idle');
    const [stats, setStats] = useState<SyncStats | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [showErrors, setShowErrors] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const hasStartedRef = useRef(false);

    const startSync = useCallback(async () => {
        if (orders.length === 0 || hasStartedRef.current) return;
        hasStartedRef.current = true;

        setStatus('syncing');
        setProgress({ current: 0, total: orders.length });
        setErrors([]);
        setStats(null);

        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('/api/financeiro/pagamentos/batch-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orders }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6));

                            switch (event.type) {
                                case 'progress':
                                    setProgress({ current: event.current, total: event.total });
                                    break;
                                case 'error':
                                    if (event.orderId && event.message) {
                                        setErrors(prev => [...prev, event.message]);
                                    }
                                    break;
                                case 'complete':
                                    setStatus('completed');
                                    setStats(event.stats);
                                    if (event.errors) {
                                        setErrors(event.errors);
                                    }
                                    // Auto-trigger onComplete after a short delay
                                    setTimeout(() => onComplete(), 1500);
                                    break;
                            }
                        } catch (e) {
                            console.error('Failed to parse SSE event:', e);
                        }
                    }
                }
            }

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.error('Sync error:', error);
                setStatus('error');
                setErrors(prev => [...prev, error.message || 'Erro desconhecido']);
            }
        }
    }, [orders, onComplete]);

    useEffect(() => {
        if (autoStart && orders.length > 0 && status === 'idle' && !hasStartedRef.current) {
            startSync();
        }
    }, [autoStart, orders, status, startSync]);

    // Don't show if dismissed or no orders
    if (dismissed || orders.length === 0) {
        return null;
    }

    const progressPercent = progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;

    return (
        <div className={`mb-4 p-4 rounded-xl transition-all animate-in fade-in slide-in-from-top-2 ${status === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800'
                : status === 'completed' && errors.length === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                    : status === 'completed' && errors.length > 0
                        ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
                        : 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
            }`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    {status === 'syncing' && (
                        <Loader2 size={20} className="animate-spin text-blue-600 dark:text-blue-400" />
                    )}
                    {status === 'completed' && errors.length === 0 && (
                        <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
                    )}
                    {status === 'completed' && errors.length > 0 && (
                        <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                    )}
                    {status === 'error' && (
                        <AlertTriangle size={20} className="text-rose-600 dark:text-rose-400" />
                    )}
                    {status === 'idle' && (
                        <RefreshCw size={20} className="text-blue-600 dark:text-blue-400" />
                    )}

                    <div>
                        <span className="font-medium text-sm">
                            {status === 'idle' && `Sincronizando ${orders.length} pedido(s) faltante(s)...`}
                            {status === 'syncing' && `Sincronizando pedidos... ${progress.current}/${progress.total}`}
                            {status === 'completed' && errors.length === 0 && '✓ Sincronização concluída!'}
                            {status === 'completed' && errors.length > 0 && `Sincronização concluída com ${errors.length} erro(s)`}
                            {status === 'error' && 'Erro na sincronização'}
                        </span>
                    {stats && status === 'completed' && (
                        <span className="text-xs text-muted ml-2">
                            ({stats.synced} atualizados, {stats.linked} vinculados, {stats.skipped} ignorados)
                        </span>
                    )}
                    </div>
                </div>

                {status === 'completed' && (
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-muted hover:text-main p-1"
                        title="Fechar"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Progress Bar */}
            {status === 'syncing' && (
                <div className="mt-2">
                    <div className="w-full h-2 bg-white/50 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Errors (collapsible) */}
            {errors.length > 0 && status === 'completed' && (
                <div className="mt-2">
                    <button
                        onClick={() => setShowErrors(!showErrors)}
                        className="text-xs text-muted hover:text-main"
                    >
                        {showErrors ? '▼' : '▶'} Ver {errors.length} erro(s)
                    </button>
                    {showErrors && (
                        <div className="mt-2 p-2 bg-white/50 dark:bg-white/5 rounded-lg text-xs font-mono max-h-32 overflow-y-auto">
                            {errors.map((error, i) => (
                                <div key={i} className="text-rose-600 dark:text-rose-400 py-0.5">
                                    {error}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
