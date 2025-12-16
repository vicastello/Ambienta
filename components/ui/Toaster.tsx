'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
    return (
        <Sonner
            position="top-right"
            toastOptions={{
                classNames: {
                    toast: 'glass-panel glass-tint border border-white/20 dark:border-white/10',
                    title: 'text-main font-semibold',
                    description: 'text-muted',
                    actionButton: 'bg-accent text-white hover:bg-accent-dark',
                    cancelButton: 'bg-white/60 dark:bg-slate-800/60 text-main',
                    closeButton: 'bg-white/60 dark:bg-slate-800/60 text-main hover:bg-white/80 dark:hover:bg-slate-800/80',
                    success: 'border-emerald-200/60 dark:border-emerald-500/20',
                    error: 'border-rose-200/60 dark:border-rose-500/20',
                    warning: 'border-amber-200/60 dark:border-amber-500/20',
                    info: 'border-blue-200/60 dark:border-blue-500/20',
                },
            }}
            richColors
        />
    );
}
