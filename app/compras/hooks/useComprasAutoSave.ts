'use client';

import { useCallback, useRef, useState } from 'react';
import type { Sugestao, AutoSavePayload } from '../types';

const AUTO_SAVE_DEBOUNCE_MS = 800;

export type UseComprasAutoSaveOptions = {
    /**
     * Ref para acessar dados atuais (evita stale closures)
     */
    dadosRef: React.MutableRefObject<Sugestao[]>;
};

export type UseComprasAutoSaveReturn = {
    // Estado
    syncStatus: Record<number, 'saving' | 'saved' | 'error'>;

    // Sanitizers
    sanitizeFornecedor: (value: string | null | undefined) => string | null;
    sanitizeEmbalagem: (value: number | null | undefined) => number | null;
    sanitizeObservacao: (value: string | null | undefined) => string | null;

    // Ações
    scheduleAutoSave: (id: number, payload: AutoSavePayload) => void;
    flushAutoSave: (id: number, options?: { skipStatusUpdate?: boolean }) => Promise<void>;
    flushAllPendingSaves: (options?: { skipStatusUpdate?: boolean }) => Promise<void>;
    retryAutoSave: (id: number) => void;
};

export function useComprasAutoSave({ dadosRef }: UseComprasAutoSaveOptions): UseComprasAutoSaveReturn {
    const [syncStatus, setSyncStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});

    const pendingSavesRef = useRef<Record<number, AutoSavePayload>>({});
    const saveTimersRef = useRef<Record<number, NodeJS.Timeout>>({});
    const isMountedRef = useRef(true);

    // Sanitizers
    const sanitizeFornecedor = useCallback((value: string | null | undefined) => {
        const s = (value ?? '').trim();
        return s.length > 0 ? s : null;
    }, []);

    const sanitizeEmbalagem = useCallback((value: number | null | undefined) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        return value >= 1 ? Math.floor(value) : null;
    }, []);

    const sanitizeObservacao = useCallback((value: string | null | undefined) => {
        const s = (value ?? '').trim();
        return s.length > 0 ? s : null;
    }, []);

    const buildAutoSavePayload = useCallback((id: number, partial: AutoSavePayload): AutoSavePayload | null => {
        const produto = dadosRef.current.find((p) => p.id_produto_tiny === id);
        if (!produto) return null;
        const merged: AutoSavePayload = {};
        if (partial.fornecedor_codigo !== undefined) merged.fornecedor_codigo = partial.fornecedor_codigo;
        else merged.fornecedor_codigo = sanitizeFornecedor(produto.fornecedor_codigo);
        if (partial.embalagem_qtd !== undefined) merged.embalagem_qtd = partial.embalagem_qtd;
        else merged.embalagem_qtd = sanitizeEmbalagem(produto.embalagem_qtd);
        if (partial.observacao_compras !== undefined) merged.observacao_compras = partial.observacao_compras;
        else merged.observacao_compras = sanitizeObservacao(produto.observacao_compras);
        if (partial.lead_time_dias !== undefined) merged.lead_time_dias = partial.lead_time_dias;
        return merged;
    }, [dadosRef, sanitizeEmbalagem, sanitizeFornecedor, sanitizeObservacao]);

    const flushAutoSave = useCallback(async (id: number, options?: { skipStatusUpdate?: boolean }) => {
        if (saveTimersRef.current[id]) {
            clearTimeout(saveTimersRef.current[id]);
            delete saveTimersRef.current[id];
        }
        const payload = pendingSavesRef.current[id];
        if (!payload) {
            if (!options?.skipStatusUpdate && isMountedRef.current) {
                setSyncStatus((prev) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
            }
            return;
        }
        delete pendingSavesRef.current[id];
        try {
            if (!options?.skipStatusUpdate && isMountedRef.current) {
                setSyncStatus((prev) => ({ ...prev, [id]: 'saving' }));
            }
            const res = await fetch('/api/compras/produto', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_produto_tiny: id, ...payload }),
            });
            if (!res.ok) throw new Error('Erro ao salvar');
            if (!options?.skipStatusUpdate && isMountedRef.current) {
                setSyncStatus((prev) => ({ ...prev, [id]: 'saved' }));
                setTimeout(() => {
                    if (!isMountedRef.current) return;
                    setSyncStatus((prev) => {
                        if (prev[id] !== 'saved') return prev;
                        const next = { ...prev };
                        delete next[id];
                        return next;
                    });
                }, 2500);
            }
        } catch (error) {
            console.error('[Compras] auto-save error', error);
            if (!options?.skipStatusUpdate && isMountedRef.current) {
                setSyncStatus((prev) => ({ ...prev, [id]: 'error' }));
            }
            pendingSavesRef.current[id] = { ...payload };
        }
    }, []);

    const scheduleAutoSave = useCallback((id: number, payload: AutoSavePayload) => {
        const fullPayload = buildAutoSavePayload(id, payload);
        if (fullPayload) pendingSavesRef.current[id] = fullPayload;
        if (saveTimersRef.current[id]) clearTimeout(saveTimersRef.current[id]);
        saveTimersRef.current[id] = setTimeout(() => { flushAutoSave(id); }, AUTO_SAVE_DEBOUNCE_MS);
        if (isMountedRef.current) setSyncStatus((prev) => ({ ...prev, [id]: 'saving' }));
    }, [buildAutoSavePayload, flushAutoSave]);

    const flushAllPendingSaves = useCallback(async (options?: { skipStatusUpdate?: boolean }) => {
        const pendingIds = Object.keys(pendingSavesRef.current).map((id) => Number(id)).filter((id) => Number.isFinite(id));
        if (!pendingIds.length) return;
        await Promise.all(pendingIds.map((id) => flushAutoSave(id, options)));
    }, [flushAutoSave]);

    const retryAutoSave = useCallback((id: number) => {
        const produto = dadosRef.current.find((item) => item.id_produto_tiny === id);
        if (!produto) return;
        scheduleAutoSave(id, {
            fornecedor_codigo: sanitizeFornecedor(produto.fornecedor_codigo),
            embalagem_qtd: sanitizeEmbalagem(produto.embalagem_qtd),
            observacao_compras: sanitizeObservacao(produto.observacao_compras),
        });
    }, [dadosRef, sanitizeEmbalagem, sanitizeFornecedor, sanitizeObservacao, scheduleAutoSave]);

    return {
        syncStatus,
        sanitizeFornecedor,
        sanitizeEmbalagem,
        sanitizeObservacao,
        scheduleAutoSave,
        flushAutoSave,
        flushAllPendingSaves,
        retryAutoSave,
    };
}
