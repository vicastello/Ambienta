'use client';

import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'warning' | 'danger' | 'info';
    impact?: {
        oldValue: string;
        newValue: string;
        affectedOrders?: number;
    };
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'warning',
    impact,
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="glass-card rounded-2xl p-6 max-w-md w-full border border-white/20 dark:border-white/10 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className={cn(
                                'p-2 rounded-lg',
                                type === 'warning' && 'bg-yellow-500/10',
                                type === 'danger' && 'bg-red-500/10',
                                type === 'info' && 'bg-blue-500/10'
                            )}
                        >
                            <AlertTriangle
                                className={cn(
                                    'w-5 h-5',
                                    type === 'warning' && 'text-yellow-600 dark:text-yellow-400',
                                    type === 'danger' && 'text-red-600 dark:text-red-400',
                                    type === 'info' && 'text-blue-600 dark:text-blue-400'
                                )}
                            />
                        </div>
                        <h3 className="text-lg font-bold text-main">{title}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-muted" />
                    </button>
                </div>

                <p className="text-sm text-muted mb-4 leading-relaxed">{message}</p>

                {impact && (
                    <div className="mb-4 p-4 bg-slate-500/5 rounded-xl border border-slate-500/10 space-y-2">
                        <h4 className="text-xs font-bold text-main uppercase tracking-wide">
                            Resumo do Impacto
                        </h4>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted">Valor Anterior:</span>
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                    {impact.oldValue}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted">Novo Valor:</span>
                                <span className="font-semibold text-green-600 dark:text-green-400">
                                    {impact.newValue}
                                </span>
                            </div>
                            {impact.affectedOrders !== undefined && (
                                <div className="flex justify-between pt-2 border-t border-white/10">
                                    <span className="text-muted">Pedidos Afetados:</span>
                                    <span className="font-bold text-main">
                                        ~{impact.affectedOrders.toLocaleString('pt-BR')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 px-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={cn(
                            'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-white shadow-lg',
                            type === 'warning' &&
                            'bg-yellow-600 hover:bg-yellow-700 shadow-yellow-500/20',
                            type === 'danger' && 'bg-red-600 hover:bg-red-700 shadow-red-500/20',
                            type === 'info' && 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                        )}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
