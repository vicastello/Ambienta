'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'compras_column_visibility_v1';

/**
 * Chaves das colunas que podem ser ocultadas/exibidas.
 * Checkbox, Produto e Pedido são sempre visíveis (não estão aqui).
 */
export type ColumnKey =
  | 'sku'
  | 'fornecedor'
  | 'embalagem'
  | 'leadTime'
  | 'estoque'
  | 'ruptura'
  | 'consumoPeriodo'
  | 'consumoMensal'
  | 'sugestao'
  | 'custo'
  | 'total'
  | 'observacao'
  | 'status';

export type ColumnVisibility = Record<ColumnKey, boolean>;

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  sku: 'SKU',
  fornecedor: 'Cód. Fornecedor',
  embalagem: 'Embalagem',
  leadTime: 'Lead Time',
  estoque: 'Estoque',
  ruptura: 'Ruptura',
  consumoPeriodo: 'Cons. Período',
  consumoMensal: 'Cons. Mês',
  sugestao: 'Sugestão',
  custo: 'Custo',
  total: 'Total',
  observacao: 'Observação',
  status: 'Status',
};

export const DEFAULT_VISIBILITY: ColumnVisibility = {
  sku: true,
  fornecedor: true,
  embalagem: true,
  leadTime: true,
  estoque: true,
  ruptura: true,
  consumoPeriodo: false, // Oculto por padrão
  consumoMensal: true,
  sugestao: true,
  custo: false, // Oculto por padrão
  total: true,
  observacao: true,
  status: false, // Oculto por padrão
};

export const ALL_COLUMN_KEYS: ColumnKey[] = [
  'sku',
  'fornecedor',
  'embalagem',
  'leadTime',
  'estoque',
  'ruptura',
  'consumoPeriodo',
  'consumoMensal',
  'sugestao',
  'custo',
  'total',
  'observacao',
  'status',
];

function loadFromStorage(): ColumnVisibility {
  if (typeof window === 'undefined') return { ...DEFAULT_VISIBILITY };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge com default para garantir que novas colunas tenham valor
      return { ...DEFAULT_VISIBILITY, ...parsed };
    }
  } catch {
    // Ignora erros de parse
  }
  return { ...DEFAULT_VISIBILITY };
}

export type UseColumnVisibilityReturn = {
  visibility: ColumnVisibility;
  setColumnVisible: (key: ColumnKey, visible: boolean) => void;
  toggleColumn: (key: ColumnKey) => void;
  showAll: () => void;
  hideAll: () => void;
  restoreDefaults: () => void;
  visibleCount: number;
  totalCount: number;
};

export function useColumnVisibility(): UseColumnVisibilityReturn {
  const [visibility, setVisibility] = useState<ColumnVisibility>(loadFromStorage);

  // Persistir no localStorage quando houver mudanças
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
    } catch {
      // Ignora erros de escrita (quota exceeded, etc)
    }
  }, [visibility]);

  const setColumnVisible = useCallback((key: ColumnKey, visible: boolean) => {
    setVisibility((prev) => ({ ...prev, [key]: visible }));
  }, []);

  const toggleColumn = useCallback((key: ColumnKey) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const showAll = useCallback(() => {
    const allVisible = ALL_COLUMN_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {} as ColumnVisibility
    );
    setVisibility(allVisible);
  }, []);

  const hideAll = useCallback(() => {
    const allHidden = ALL_COLUMN_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: false }),
      {} as ColumnVisibility
    );
    setVisibility(allHidden);
  }, []);

  const restoreDefaults = useCallback(() => {
    setVisibility({ ...DEFAULT_VISIBILITY });
  }, []);

  const visibleCount = ALL_COLUMN_KEYS.filter((key) => visibility[key]).length;
  const totalCount = ALL_COLUMN_KEYS.length;

  return {
    visibility,
    setColumnVisible,
    toggleColumn,
    showAll,
    hideAll,
    restoreDefaults,
    visibleCount,
    totalCount,
  };
}
