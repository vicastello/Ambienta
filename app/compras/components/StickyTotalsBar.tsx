'use client';

import React from 'react';
import { ShoppingCart, Package, DollarSign, Check } from 'lucide-react';
import { AnimatedCounter, AnimatedCurrency } from './AnimatedCounter';

type StickyTotalsBarProps = {
    selectedCount: number;
    totalQuantidade: number;
    totalValor: number;
    onConfirm?: () => void;
    confirmLabel?: string;
    confirmLoading?: boolean;
};

export function StickyTotalsBar({
    selectedCount,
    totalQuantidade,
    totalValor,
    onConfirm,
    confirmLabel = 'Confirmar Pedido',
    confirmLoading = false,
}: StickyTotalsBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-8 left-0 right-0 z-[100] px-4 pointer-events-none flex justify-center animate-slide-in-bottom">
            <div className="inline-flex pointer-events-auto items-center gap-6 px-6 py-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-[var(--color-neutral-200)] dark:border-white/10 shadow-2xl">
                {/* Métricas */}
                <div className="flex items-center gap-6">
                    {/* Produtos selecionados */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 dark:bg-violet-500/20">
                            <ShoppingCart className="w-5 h-5 text-[var(--color-primary)] dark:text-violet-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-[var(--color-neutral-500)] dark:text-slate-400">Selecionados</span>
                            <AnimatedCounter value={selectedCount} className="text-lg font-bold text-[var(--color-neutral-900)] dark:text-white" />
                        </div>
                    </div>

                    {/* Divisor */}
                    <div className="w-px h-10 bg-[var(--color-neutral-200)] dark:bg-white/10" />

                    {/* Quantidade total */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--color-success)]/10 dark:bg-emerald-500/20">
                            <Package className="w-5 h-5 text-[var(--color-success)] dark:text-emerald-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-[var(--color-neutral-500)] dark:text-slate-400">Quantidade</span>
                            <AnimatedCounter value={totalQuantidade} className="text-lg font-bold text-[var(--color-neutral-900)] dark:text-white" />
                        </div>
                    </div>

                    {/* Divisor */}
                    <div className="w-px h-10 bg-[var(--color-neutral-200)] dark:bg-white/10" />

                    {/* Valor total */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--color-warning)]/10 dark:bg-amber-500/20">
                            <DollarSign className="w-5 h-5 text-[var(--color-warning)] dark:text-amber-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-[var(--color-neutral-500)] dark:text-slate-400">Valor Total</span>
                            <AnimatedCurrency value={totalValor} className="text-lg font-bold text-[var(--color-neutral-900)] dark:text-white" />
                        </div>
                    </div>
                </div>

                {/* Botão de ação */}
                {onConfirm && (
                    <button
                        onClick={onConfirm}
                        disabled={confirmLoading}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {confirmLoading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Check className="w-5 h-5" />
                        )}
                        {confirmLabel}
                    </button>
                )}
            </div>
        </div>
    );
}
