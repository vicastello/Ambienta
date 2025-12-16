'use client';

import React from 'react';
import {
    Loader2,
    Trash2,
    FileDown,
    RotateCcw,
    Calendar,
    Package,
    AlertCircle,
} from 'lucide-react';
import type { SavedOrder } from '@/src/types/compras';

type OrderHistoryTabProps = {
    savedOrders: SavedOrder[];
    syncing: boolean;
    syncError: string | null;
    onRefresh: () => void;
    onLoad: (order: SavedOrder) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, value: string) => void;
    onRenameBlur: (id: string) => void;
    onExportPdf?: (order: SavedOrder) => void;
};

const formatDate = (iso: string) => {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function OrderHistoryTab({
    savedOrders,
    syncing,
    syncError,
    onRefresh,
    onLoad,
    onDelete,
    onRename,
    onRenameBlur,
}: OrderHistoryTabProps) {
    const sortedOrders = [...savedOrders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const totalPedidos = savedOrders.length;
    const totalItens = savedOrders.reduce(
        (acc, o) => acc + o.produtos.length + o.manualItems.length,
        0
    );

    if (syncing && savedOrders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mb-4" />
                <p className="text-slate-600 dark:text-slate-300">Carregando pedidos salvos...</p>
            </div>
        );
    }

    if (syncError && savedOrders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <AlertCircle className="w-8 h-8 text-rose-500 mb-4" />
                <p className="text-slate-600 dark:text-slate-300 mb-4">{syncError}</p>
                <button
                    type="button"
                    onClick={onRefresh}
                    className="app-btn-primary inline-flex items-center gap-2"
                >
                    <RotateCcw className="w-4 h-4" />
                    Tentar novamente
                </button>
            </div>
        );
    }

    if (savedOrders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Nenhum pedido salvo
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                    Quando você salvar um pedido na aba "Novo Pedido", ele aparecerá aqui para consulta e reutilização.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header com stats */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                        <Package className="w-4 h-4" />
                        {totalPedidos} pedido{totalPedidos !== 1 && 's'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {totalItens} ite{totalItens !== 1 ? 'ns' : 'm'} total
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={syncing}
                    className="app-btn-primary inline-flex items-center gap-2"
                >
                    {syncing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <RotateCcw className="w-4 h-4" />
                    )}
                    Atualizar
                </button>
            </div>

            {syncError && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                    {syncError}
                </div>
            )}

            {/* Lista de pedidos */}
            <div className="space-y-3">
                {sortedOrders.map((order) => {
                    const totalItensOrder = order.produtos.length + order.manualItems.length;
                    const totalValor = order.produtos.reduce(
                        (acc, p) => acc + p.quantidade * (p.preco_custo ?? 0),
                        0
                    );

                    return (
                        <div
                            key={order.id}
                            className="rounded-[20px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 transition-all hover:border-[var(--accent)]/30"
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex-1 min-w-0 space-y-2">
                                    {/* Nome editável */}
                                    <input
                                        type="text"
                                        value={order.name}
                                        onChange={(e) => onRename(order.id, e.target.value)}
                                        onBlur={() => onRenameBlur(order.id)}
                                        className="app-input w-full font-semibold text-lg bg-transparent border-transparent hover:border-white/40 focus:border-[var(--accent)]/50 px-0"
                                        placeholder="Nome do pedido"
                                    />

                                    {/* Metadados */}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                        <span className="inline-flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {formatDate(order.createdAt)}
                                        </span>
                                        <span>
                                            {totalItensOrder} ite{totalItensOrder !== 1 ? 'ns' : 'm'}
                                        </span>
                                        <span>
                                            Cobertura: {order.targetDays}d
                                        </span>
                                        <span>
                                            Período: {order.periodDays}d
                                        </span>
                                        {totalValor > 0 && (
                                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(totalValor)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Preview de produtos */}
                                    {order.produtos.length > 0 && (
                                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                                            {order.produtos.slice(0, 3).map((p) => p.nome).join(', ')}
                                            {order.produtos.length > 3 && ` +${order.produtos.length - 3} mais`}
                                        </div>
                                    )}
                                </div>

                                {/* Ações */}
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => onLoad(order)}
                                        className="app-btn-primary text-sm px-4 py-2"
                                    >
                                        Carregar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onDelete(order.id)}
                                        className="app-btn-primary text-sm px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                        title="Excluir pedido"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
