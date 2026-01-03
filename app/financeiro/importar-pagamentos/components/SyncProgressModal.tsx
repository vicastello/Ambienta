'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';

type SyncStats = {
    synced: number;
    linked: number;
    failed: number;
    skipped: number;
};

type SyncProgressModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
    orders: Array<{ marketplaceOrderId: string; marketplace: string; syncType?: 'link' | 'escrow' }>;
};

export function SyncProgressModal({ isOpen, onClose, onComplete, orders }: SyncProgressModalProps) {
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [currentOrder, setCurrentOrder] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'syncing' | 'completed' | 'error'>('idle');
    const [errors, setErrors] = useState<string[]>([]);
    const [stats, setStats] = useState<SyncStats | null>(null);
    const [showErrors, setShowErrors] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const startSync = useCallback(async () => {
        if (orders.length === 0) return;

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
                                    setCurrentOrder(event.orderId || null);
                                    break;
                                case 'success':
                                    setProgress({ current: event.current, total: event.total });
                                    break;
                                case 'error':
                                    if (event.orderId) {
                                        setErrors(prev => [...prev, event.message]);
                                    }
                                    break;
                                case 'complete':
                                    setStatus('completed');
                                    setStats(event.stats);
                                    if (event.errors) {
                                        setErrors(event.errors);
                                    }
                                    break;
                            }
                        } catch (e) {
                            console.error('Failed to parse SSE event:', e);
                        }
                    }
                }
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Sync cancelled by user');
            } else {
                console.error('Sync error:', error);
                setStatus('error');
                setErrors(prev => [...prev, error.message || 'Erro desconhecido']);
            }
        }
    }, [orders]);

    useEffect(() => {
        if (isOpen && status === 'idle' && orders.length > 0) {
            startSync();
        }
    }, [isOpen, status, orders, startSync]);

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        onClose();
    };

    const handleDone = () => {
        onComplete();
        onClose();
    };

    if (!isOpen) return null;

    const progressPercent = progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;

    return (
        <div className="modal-overlay" onClick={handleCancel}>
            <div
                className="modal-content glass-panel"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '500px', width: '100%' }}
            >
                {/* Header */}
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                        Sincronizando Pedidos
                    </h2>
                    {status !== 'syncing' && (
                        <button
                            onClick={handleCancel}
                            className="btn-icon"
                            style={{ padding: '0.25rem' }}
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Progress Bar */}
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)'
                    }}>
                        <span>
                            {status === 'syncing' ? `Processando ${progress.current} de ${progress.total}...` :
                                status === 'completed' ? 'Sincronização concluída!' :
                                    status === 'error' ? 'Erro na sincronização' : 'Iniciando...'}
                        </span>
                        <span style={{ fontWeight: 600 }}>{progressPercent}%</span>
                    </div>
                    <div style={{
                        width: '100%',
                        height: '12px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${progressPercent}%`,
                            height: '100%',
                            background: status === 'error'
                                ? 'var(--color-error)'
                                : status === 'completed'
                                    ? 'var(--color-success)'
                                    : 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                            borderRadius: '6px',
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                </div>

                {/* Current Order */}
                {status === 'syncing' && currentOrder && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        marginBottom: '1rem',
                        fontSize: '0.875rem',
                    }}>
                        <Loader2 size={16} className="spin" style={{ color: 'var(--accent-primary)' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>Sincronizando:</span>
                        <code style={{ fontFamily: 'monospace', fontWeight: 500 }}>{currentOrder}</code>
                    </div>
                )}

                {/* Stats */}
                {stats && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '0.75rem',
                        marginBottom: '1rem',
                    }}>
                        <div style={{
                            textAlign: 'center',
                            padding: '0.75rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '8px',
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                                {stats.linked}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vinculados</div>
                        </div>
                        <div style={{
                            textAlign: 'center',
                            padding: '0.75rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '8px',
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                                {stats.synced}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sincronizados</div>
                        </div>
                        <div style={{
                            textAlign: 'center',
                            padding: '0.75rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '8px',
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                {stats.skipped}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ignorados</div>
                        </div>
                        <div style={{
                            textAlign: 'center',
                            padding: '0.75rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '8px',
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: errors.length > 0 ? 'var(--color-error)' : 'var(--text-secondary)' }}>
                                {stats.failed}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Erros</div>
                        </div>
                    </div>
                )}

                {/* Errors (collapsible) */}
                {errors.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                        <button
                            onClick={() => setShowErrors(!showErrors)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--color-error)',
                                fontSize: '0.875rem',
                                padding: '0.5rem 0',
                            }}
                        >
                            <AlertTriangle size={16} />
                            <span>{errors.length} erro(s) - clique para {showErrors ? 'ocultar' : 'ver'}</span>
                        </button>
                        {showErrors && (
                            <div style={{
                                maxHeight: '200px',
                                overflowY: 'auto',
                                background: 'var(--bg-secondary)',
                                borderRadius: '8px',
                                padding: '0.75rem',
                                fontSize: '0.75rem',
                                fontFamily: 'monospace',
                            }}>
                                {errors.map((error, i) => (
                                    <div key={i} style={{
                                        padding: '0.25rem 0',
                                        borderBottom: i < errors.length - 1 ? '1px solid var(--border-color)' : 'none',
                                        color: 'var(--color-error)',
                                    }}>
                                        {error}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Status Icon */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '1rem 0',
                }}>
                    {status === 'syncing' && (
                        <Loader2 size={48} className="spin" style={{ color: 'var(--accent-primary)' }} />
                    )}
                    {status === 'completed' && errors.length === 0 && (
                        <CheckCircle size={48} style={{ color: 'var(--color-success)' }} />
                    )}
                    {status === 'completed' && errors.length > 0 && (
                        <AlertTriangle size={48} style={{ color: 'var(--color-warning)' }} />
                    )}
                    {status === 'error' && (
                        <XCircle size={48} style={{ color: 'var(--color-error)' }} />
                    )}
                </div>

                {/* Actions */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '1rem',
                    marginTop: '1rem',
                }}>
                    {status === 'syncing' ? (
                        <button
                            onClick={handleCancel}
                            className="btn btn-secondary"
                        >
                            Cancelar
                        </button>
                    ) : (
                        <button
                            onClick={handleDone}
                            className="btn btn-primary"
                        >
                            {status === 'completed' ? 'Concluído - Atualizar Preview' : 'Fechar'}
                        </button>
                    )}
                </div>
            </div>

            <style jsx>{`
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 1rem;
                }
                .modal-content {
                    padding: 1.5rem;
                    border-radius: 16px;
                    animation: modalSlideIn 0.2s ease-out;
                }
                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
