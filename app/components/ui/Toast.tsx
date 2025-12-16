
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
    id: string;
    type: ToastType;
    title?: string;
    message: string;
    duration?: number;
}

interface ToastContextValue {
    toast: (payload: Omit<ToastMessage, 'id'>) => void;
    dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

const TOAST_ICONS = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
};

const TOAST_STYLES = {
    success: 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10',
    error: 'border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10',
    warning: 'border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10',
    info: 'border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10',
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback(({ type = 'info', title, message, duration = 4000 }: Omit<ToastMessage, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, type, title, message, duration }]);
        if (duration > 0) {
            setTimeout(() => {
                dismiss(id);
            }, duration);
        }
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ toast, dismiss }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none p-4 sm:p-0">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`
              pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-lg backdrop-blur-xl transition-all animate-in slide-in-from-right-12 fade-in duration-300
              ${TOAST_STYLES[t.type]}
              bg-white/80 dark:bg-[#0f172a]/80
            `}
                        role="alert"
                    >
                        <div className="mt-0.5 shrink-0">{TOAST_ICONS[t.type]}</div>
                        <div className="flex-1 min-w-0">
                            {t.title && <h4 className="font-semibold text-sm text-slate-900 dark:text-white font-display mb-0.5">{t.title}</h4>}
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{t.message}</p>
                        </div>
                        <button
                            onClick={() => dismiss(t.id)}
                            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            aria-label="Fechar notificação"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
