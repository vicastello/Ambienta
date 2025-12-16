'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const COMPRAS_SELECTION_STORAGE_KEY = 'compras_selection_v1';

export type UseComprasSelectionOptions = {
    /**
     * IDs de produtos válidos (para limpar seleção de produtos removidos)
     */
    validProductIds: number[];
};

export type UseComprasSelectionReturn = {
    // Estados
    selectedIds: Record<number, boolean>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
    pedidoOverrides: Record<number, number>;
    setPedidoOverrides: React.Dispatch<React.SetStateAction<Record<number, number>>>;
    pedidoInputDrafts: Record<number, string>;
    setPedidoInputDrafts: React.Dispatch<React.SetStateAction<Record<number, string>>>;

    // Métricas
    selectionCount: number;
    selectedTotalQuantidade: number;
    selectedTotalValor: number;

    // Ações
    toggleSelection: (id: number) => void;
    clearSelection: () => void;
    selectAll: (ids: number[]) => void;

    // Handlers de input
    handlePedidoInputChange: (id: number, value: string, sugestaoAutomatica?: number) => void;
    handlePedidoInputBlur: (id: number) => void;
};

export function useComprasSelection({
    validProductIds,
}: UseComprasSelectionOptions): UseComprasSelectionReturn {
    const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
    const [pedidoOverrides, setPedidoOverrides] = useState<Record<number, number>>({});
    const [pedidoInputDrafts, setPedidoInputDrafts] = useState<Record<number, string>>({});

    const selectionLoadedRef = useRef(false);

    // Carregar seleção do localStorage na montagem
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem(COMPRAS_SELECTION_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Record<string, boolean>;
                if (typeof parsed === 'object' && parsed !== null) {
                    const next: Record<number, boolean> = {};
                    for (const [key, val] of Object.entries(parsed)) {
                        const id = Number(key);
                        if (Number.isFinite(id) && val === true) {
                            next[id] = true;
                        }
                    }
                    setSelectedIds(next);
                }
            }
        } catch {
            // ignora erros de leitura
        } finally {
            selectionLoadedRef.current = true;
        }
    }, []);

    // Persistir seleção no localStorage
    useEffect(() => {
        if (typeof window === 'undefined' || !selectionLoadedRef.current) return;
        try {
            localStorage.setItem(COMPRAS_SELECTION_STORAGE_KEY, JSON.stringify(selectedIds));
        } catch {
            // ignora erros de escrita
        }
    }, [selectedIds]);

    // Limpar IDs de produtos que não existem mais
    useEffect(() => {
        if (!validProductIds.length) return;
        const validSet = new Set(validProductIds);

        setSelectedIds((prev) => {
            const next: Record<number, boolean> = {};
            let changed = false;
            for (const [key, val] of Object.entries(prev)) {
                const id = Number(key);
                if (validSet.has(id)) {
                    next[id] = val;
                } else {
                    changed = true;
                }
            }
            return changed ? next : prev;
        });

        setPedidoOverrides((prev) => {
            const next: Record<number, number> = {};
            let changed = false;
            for (const [key, val] of Object.entries(prev)) {
                const id = Number(key);
                if (validSet.has(id)) {
                    next[id] = val;
                } else {
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [validProductIds]);

    const toggleSelection = useCallback((id: number) => {
        setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedIds({});
    }, []);

    const selectAll = useCallback((ids: number[]) => {
        setSelectedIds((prev) => {
            const next = { ...prev };
            ids.forEach((id) => { next[id] = true; });
            return next;
        });
    }, []);

    const handlePedidoInputChange = useCallback((id: number, value: string, sugestaoAutomatica?: number) => {
        setPedidoInputDrafts((prev) => ({ ...prev, [id]: value }));
        const normalized = value?.replace(',', '.').trim();
        if (!normalized) {
            setPedidoOverrides((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            return;
        }
        const parsed = Number(normalized);
        if (!Number.isFinite(parsed)) return;
        const coerced = Math.max(0, Math.round(parsed));
        if (typeof sugestaoAutomatica === 'number' && coerced === sugestaoAutomatica) {
            setPedidoOverrides((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            return;
        }
        setPedidoOverrides((prev) => ({ ...prev, [id]: coerced }));
    }, []);

    const handlePedidoInputBlur = useCallback((id: number) => {
        setPedidoInputDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    // Métricas de seleção
    const selectionCount = useMemo(() =>
        Object.values(selectedIds).filter(Boolean).length,
        [selectedIds]
    );

    // Valores zerados aqui - serão calculados no componente com dados reais
    const selectedTotalQuantidade = 0;
    const selectedTotalValor = 0;

    return {
        selectedIds,
        setSelectedIds,
        pedidoOverrides,
        setPedidoOverrides,
        pedidoInputDrafts,
        setPedidoInputDrafts,
        selectionCount,
        selectedTotalQuantidade,
        selectedTotalValor,
        toggleSelection,
        clearSelection,
        selectAll,
        handlePedidoInputChange,
        handlePedidoInputBlur,
    };
}
