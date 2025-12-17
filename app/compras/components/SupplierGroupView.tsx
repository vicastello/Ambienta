'use client';

import React from 'react';
import { ChevronDown, ChevronRight, Package, DollarSign } from 'lucide-react';
import type { ProdutoDerivado, ManualItem } from '../types';

type SupplierGroup = {
    fornecedor: string;
    produtos: ProdutoDerivado[];
    totalQuantidade: number;
    totalValor: number;
    produtosCount: number;
};

type SupplierGroupViewProps = {
    produtos: ProdutoDerivado[];
    manualItems: ManualItem[];
    selectedIds: Record<number, boolean>;
    formatFornecedorNome: (nome: string | null) => string;
};

export function SupplierGroupView({
    produtos,
    manualItems,
    selectedIds,
    formatFornecedorNome,
}: SupplierGroupViewProps) {
    const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

    const groups = React.useMemo<SupplierGroup[]>(() => {
        const map = new Map<string, ProdutoDerivado[]>();

        // Agrupar produtos selecionados por fornecedor
        produtos.forEach((p) => {
            if (!selectedIds[p.id_produto_tiny]) return;
            const key = p.fornecedor_nome || '__SEM_FORNECEDOR__';
            const existing = map.get(key) || [];
            existing.push(p);
            map.set(key, existing);
        });

        // Converter para array e calcular totais
        const result: SupplierGroup[] = [];
        map.forEach((prods, fornecedor) => {
            const totalQuantidade = prods.reduce((acc, p) => acc + p.sugestao_ajustada, 0);
            const totalValor = prods.reduce((acc, p) => acc + p.total_valor_calculado, 0);
            result.push({
                fornecedor,
                produtos: prods,
                totalQuantidade,
                totalValor,
                produtosCount: prods.length,
            });
        });

        // Ordenar por valor (maior primeiro)
        result.sort((a, b) => b.totalValor - a.totalValor);
        return result;
    }, [produtos, selectedIds]);

    const toggleGroup = (fornecedor: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(fornecedor)) {
                next.delete(fornecedor);
            } else {
                next.add(fornecedor);
            }
            return next;
        });
    };

    const expandAll = () => {
        setExpandedGroups(new Set(groups.map((g) => g.fornecedor)));
    };

    const collapseAll = () => {
        setExpandedGroups(new Set());
    };

    // Calcular totais gerais
    const totalGeral = groups.reduce((acc, g) => acc + g.totalValor, 0);
    const totalProdutos = groups.reduce((acc, g) => acc + g.produtosCount, 0);
    const totalQuantidadeGeral = groups.reduce((acc, g) => acc + g.totalQuantidade, 0);

    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
                <p className="text-slate-500 dark:text-slate-400">Nenhum produto selecionado</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">Selecione produtos na aba "Novo Pedido" para ver o agrupamento</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header com resumo e controles */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">{groups.length}</strong> fornecedor{groups.length > 1 ? 'es' : ''}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">{totalProdutos}</strong> produto{totalProdutos > 1 ? 's' : ''}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                        <strong className="text-emerald-600 dark:text-emerald-400">{totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                    </span>
                </div>
                <div className="flex gap-2">
                    <button onClick={expandAll} className="glass-btn glass-btn-secondary text-xs px-3 py-1.5 h-auto">Expandir todos</button>
                    <button onClick={collapseAll} className="glass-btn glass-btn-secondary text-xs px-3 py-1.5 h-auto">Recolher todos</button>
                </div>
            </div>

            {/* Lista de fornecedores */}
            <div className="space-y-3">
                {groups.map((group) => {
                    const isExpanded = expandedGroups.has(group.fornecedor);
                    const displayName = group.fornecedor === '__SEM_FORNECEDOR__'
                        ? 'Sem fornecedor'
                        : formatFornecedorNome(group.fornecedor);

                    return (
                        <div
                            key={group.fornecedor}
                            className="rounded-2xl glass-panel overflow-hidden"
                        >
                            {/* Header do grupo */}
                            <button
                                onClick={() => toggleGroup(group.fornecedor)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {isExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-slate-400" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-slate-400" />
                                    )}
                                    <span className="font-semibold text-slate-900 dark:text-white">{displayName}</span>
                                    <span className="text-xs text-slate-500 bg-[var(--glass-surface-light)] dark:bg-white/5 px-2 py-0.5 rounded-full ring-1 ring-white/10">
                                        {group.produtosCount} item{group.produtosCount > 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                    <span className="text-slate-500">{group.totalQuantidade.toLocaleString('pt-BR')} unid.</span>
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                        {group.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                </div>
                            </button>

                            {/* Lista de produtos (expandido) */}
                            {isExpanded && (
                                <div className="border-t border-white/10 divide-y divide-white/5">
                                    {group.produtos.map((p) => (
                                        <div key={p.id_produto_tiny} className="flex items-center justify-between px-4 py-2 pl-10">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${p.curvaABC === 'A'
                                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'
                                                    : p.curvaABC === 'B'
                                                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                                                        : 'bg-[var(--glass-surface-light)] text-slate-500 dark:bg-white/5 dark:text-slate-400 ring-1 ring-white/10'
                                                    }`}>{p.curvaABC}</span>
                                                <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{p.nome}</span>
                                                <span className="text-xs text-slate-400">{p.codigo}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm shrink-0">
                                                <span className="text-slate-500">{p.sugestao_ajustada.toLocaleString('pt-BR')} un</span>
                                                <span className="text-slate-600 dark:text-slate-300 w-24 text-right">
                                                    {p.total_valor_calculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
