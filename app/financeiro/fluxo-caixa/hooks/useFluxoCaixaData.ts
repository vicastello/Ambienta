'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { staleWhileRevalidate, clearCacheKey } from '@/lib/staleCache';

type ReceivablesSummary = {
    recebido: number;
    pendente: number;
    atrasado: number;
    total: number;
    sparklines?: {
        total: number[];
        recebido: number[];
        pendente: number[];
        atrasado: number[];
        saidas: number[];
    };
};

type ReceivablesMeta = {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary: ReceivablesSummary;
};

type Order = {
    id: number;
    tiny_id: number | null;
    numero_pedido: string | null;
    numero_pedido_ecommerce?: string | null;
    data_pedido: string;
    cliente: string | null;
    valor: number;
    canal: string | null;
    status_pagamento: 'pago' | 'pendente' | 'atrasado';
    vencimento_estimado: string | null;
    payment_received: boolean | null;
    payment_received_at: string | null;
};

type ReceivablesData = {
    orders: any[];  // Use any[] for compatibility with existing components
    chartOrders: any[]; // Unpaginated orders for chart
    expenses: any[]; // Manual entries (expenses)
    meta: ReceivablesMeta | null;
};

type UseFluxoCaixaDataReturn = {
    data: ReceivablesData;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    isFromCache: boolean;
};

const CACHE_KEY_PREFIX = 'fluxocaixa:receivables:';
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Custom hook for fetching Fluxo de Caixa receivables data with stale-while-revalidate caching
 */
export function useFluxoCaixaData(searchParams: URLSearchParams): UseFluxoCaixaDataReturn {
    const [data, setData] = useState<ReceivablesData>({ orders: [], chartOrders: [], expenses: [], meta: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFromCache, setIsFromCache] = useState(false);
    const requestIdRef = useRef(0);

    const cacheKey = `${CACHE_KEY_PREFIX}${searchParams.toString() || 'default'}`;

    const fetchData = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);

        try {
            const { data: result, fromCache } = await staleWhileRevalidate<ReceivablesData>({
                key: cacheKey,
                ttlMs: CACHE_TTL_MS,
                fetcher: async () => {
                    const res = await fetch(`/api/financeiro/fluxo-caixa/pedidos?${searchParams.toString()}`);
                    const jsonData = await res.json();
                    if (jsonData.error) throw new Error(jsonData.error);
                    return jsonData;
                },
                onUpdate: (fresh) => {
                    // Update data when fresh data arrives (background revalidation)
                    if (requestIdRef.current === requestId) {
                        setData(fresh);
                        setIsFromCache(false);
                    }
                },
            });

            if (requestIdRef.current === requestId) {
                setData(result);
                setIsFromCache(fromCache);
            }
        } catch (err) {
            if (requestIdRef.current === requestId) {
                setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
            }
        } finally {
            if (requestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [cacheKey, searchParams]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const refetch = useCallback(async () => {
        // Clear cache and refetch
        clearCacheKey(cacheKey);
        await fetchData();
    }, [cacheKey, fetchData]);

    return {
        data,
        loading,
        error,
        refetch,
        isFromCache,
    };
}
