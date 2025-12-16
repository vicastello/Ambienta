'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ProdutoDerivado, FornecedorOption, SortKey, SortDirection, ManualItem } from '../types';

const SEM_FORNECEDOR_KEY = '__SEM_FORNECEDOR__';

function buildFornecedorKey(nome?: string | null) {
    if (!nome || !nome.trim()) return SEM_FORNECEDOR_KEY;
    return nome.trim().toLowerCase();
}

export type UseComprasFiltersOptions = {
    /**
     * Produtos derivados para filtrar e ordenar
     */
    derivados: ProdutoDerivado[];
    /**
     * Itens manuais adicionados
     */
    manualItems: ManualItem[];
    /**
     * IDs selecionados para filtro de seleção
     */
    selectedIds: Record<number, boolean>;
};

export type UseComprasFiltersReturn = {
    // Estados de filtro
    produtoFiltro: string;
    setProdutoFiltro: React.Dispatch<React.SetStateAction<string>>;
    fornecedoresSelecionados: string[];
    setFornecedoresSelecionados: React.Dispatch<React.SetStateAction<string[]>>;
    selectionFilter: 'all' | 'selected' | 'unselected';
    setSelectionFilter: React.Dispatch<React.SetStateAction<'all' | 'selected' | 'unselected'>>;
    sortConfig: Array<{ key: SortKey; direction: SortDirection }>;
    setSortConfig: React.Dispatch<React.SetStateAction<Array<{ key: SortKey; direction: SortDirection }>>>;

    // Derivados
    filteredSortedProdutos: ProdutoDerivado[];
    fornecedorOptions: FornecedorOption[];
    manualItemsFiltered: ManualItem[];

    // Ações
    toggleSort: (key: SortKey) => void;
};

export function useComprasFilters({
    derivados,
    manualItems,
    selectedIds,
}: UseComprasFiltersOptions): UseComprasFiltersReturn {
    const [produtoFiltro, setProdutoFiltro] = useState('');
    const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<string[]>([]);
    const [selectionFilter, setSelectionFilter] = useState<'all' | 'selected' | 'unselected'>('all');
    const [sortConfig, setSortConfig] = useState<Array<{ key: SortKey; direction: SortDirection }>>([]);

    // Opções de fornecedor para dropdown
    const fornecedorOptions = useMemo<FornecedorOption[]>(() => {
        const map = new Map<string, { count: number; label: string }>();
        derivados.forEach((produto) => {
            const key = buildFornecedorKey(produto.fornecedor_nome);
            const existing = map.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                map.set(key, {
                    count: 1,
                    label: key === SEM_FORNECEDOR_KEY ? 'Sem fornecedor' : (produto.fornecedor_nome ?? ''),
                });
            }
        });
        const arr: FornecedorOption[] = [];
        map.forEach((value, key) => arr.push({ value: key, label: value.label }));
        arr.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        return arr;
    }, [derivados]);

    // Função de comparação para ordenação
    const compareValues = useCallback((valueA: ProdutoDerivado[SortKey], valueB: ProdutoDerivado[SortKey], direction: SortDirection) => {
        // Valores nulos sempre vão para o final
        if (valueA == null && valueB == null) return 0;
        if (valueA == null) return 1;
        if (valueB == null) return -1;

        let comparison = 0;
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            comparison = valueA.localeCompare(valueB, 'pt-BR', { sensitivity: 'base' });
        } else if (typeof valueA === 'number' && typeof valueB === 'number') {
            comparison = valueA - valueB;
        }
        return direction === 'asc' ? comparison : -comparison;
    }, []);

    // Produtos filtrados e ordenados
    const filteredSortedProdutos = useMemo(() => {
        // Aplicar filtro de produto
        const termoProduto = produtoFiltro.toLowerCase().trim();
        const fornecedorSet = new Set(fornecedoresSelecionados);

        let filtered = derivados.filter((produto) => {
            const camposBusca = [produto.nome, produto.codigo, produto.gtin].filter((campo): campo is string =>
                Boolean(campo && campo.trim())
            );
            const matchesProduto = !termoProduto
                ? true
                : camposBusca.some((campo) => campo.toLowerCase().includes(termoProduto));

            if (!matchesProduto) return false;

            if (!fornecedorSet.size) return true;
            const fornecedorKey = buildFornecedorKey(produto.fornecedor_nome);
            return fornecedorSet.has(fornecedorKey);
        });

        // Aplicar filtro de seleção
        if (selectionFilter === 'selected') {
            filtered = filtered.filter((p) => selectedIds[p.id_produto_tiny]);
        } else if (selectionFilter === 'unselected') {
            filtered = filtered.filter((p) => !selectedIds[p.id_produto_tiny]);
        }

        // Aplicar ordenação multi-coluna
        if (sortConfig.length > 0) {
            filtered = [...filtered].sort((a, b) => {
                for (const { key, direction } of sortConfig) {
                    const result = compareValues(a[key], b[key], direction);
                    if (result !== 0) return result;
                }
                return 0;
            });
        }

        return filtered;
    }, [derivados, produtoFiltro, fornecedoresSelecionados, selectionFilter, selectedIds, sortConfig, compareValues]);

    // Itens manuais filtrados por seleção
    const manualItemsFiltered = useMemo(() => {
        if (selectionFilter === 'all') return manualItems;
        if (selectionFilter === 'selected') return manualItems.filter((m) => selectedIds[m.id]);
        return manualItems.filter((m) => !selectedIds[m.id]);
    }, [manualItems, selectedIds, selectionFilter]);

    const toggleSort = useCallback((key: SortKey) => {
        setSortConfig((prev) => {
            const existingIndex = prev.findIndex((entry) => entry.key === key);
            if (existingIndex === -1) {
                return [...prev, { key, direction: 'desc' }];
            }
            const existing = prev[existingIndex];
            if (existing.direction === 'desc') {
                const updated = [...prev];
                updated[existingIndex] = { key, direction: 'asc' };
                return updated;
            }
            return prev.filter((_, idx) => idx !== existingIndex);
        });
    }, []);

    return {
        produtoFiltro,
        setProdutoFiltro,
        fornecedoresSelecionados,
        setFornecedoresSelecionados,
        selectionFilter,
        setSelectionFilter,
        sortConfig,
        setSortConfig,
        filteredSortedProdutos,
        fornecedorOptions,
        manualItemsFiltered,
        toggleSort,
    };
}
