'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  RefreshCcw,
  FileDown,
  CheckCircle2,
  AlertCircle,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Save,
  History,
  Trash2,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { formatFornecedorNome } from '@/lib/fornecedorFormatter';
import type { SavedOrder, SavedOrderManualItem, SavedOrderProduct } from '@/src/types/compras';

type Sugestao = {
  id_produto_tiny: number;
  codigo: string | null;
  nome: string | null;
  gtin: string | null;
  imagem_url: string | null;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  embalagem_qtd: number;
  saldo: number;
  reservado: number;
  disponivel: number;
  consumo_periodo: number;
  consumo_mensal: number;
  sugestao_base: number;
  sugestao_ajustada: number;
  alerta_embalagem: boolean;
  observacao_compras: string | null;
  originalIndex?: number;
};

type SortDirection = 'asc' | 'desc';
type SortKey =
  | 'nome'
  | 'codigo'
  | 'fornecedor_codigo'
  | 'embalagem_qtd'
  | 'disponivel'
  | 'consumo_periodo'
  | 'consumo_mensal'
  | 'sugestao_base'
  | 'sugestao_ajustada';

type AutoSavePayload = {
  fornecedor_codigo?: string | null;
  embalagem_qtd?: number | null;
  observacao_compras?: string | null;
};

type ProdutoDerivado = Sugestao & {
  originalIndex: number;
  consumoDiario: number;
  pontoMinimo: number;
  coberturaAtualDias: number | null;
  precisaRepor: boolean;
  quantidadeNecessaria: number;
  statusCobertura: string;
  sugestao_calculada: number;
};

type FornecedorOption = {
  value: string;
  label: string;
};

type ManualEntry = {
  nome: string;
  fornecedor_codigo: string;
  quantidade: string;
  observacao: string;
};

type ManualItem = {
  id: number;
  nome: string;
  fornecedor_codigo: string;
  quantidade: number;
  observacao: string;
};

const COMPRAS_RECALC_DEBOUNCE_MS = 350;
const AUTO_SAVE_DEBOUNCE_MS = 800;
const COMPRAS_SELECTION_STORAGE_KEY = 'compras_selection_v1';
const COMPRAS_SAVED_ORDERS_KEY = 'compras_saved_orders_v1';
const DEFAULT_PERIOD_DIAS = 60;
const DAYS_PER_MONTH = 30;
const DEFAULT_COBERTURA_DIAS = 15;
const MIN_COBERTURA_DIAS = 15;
const MAX_COBERTURA_DIAS = 180;
const COVERAGE_STEP_DIAS = 5;
const SEM_FORNECEDOR_KEY = '__SEM_FORNECEDOR__';
const MANUAL_ITEM_ID_SEED = -1;

const buildDefaultOrderName = (dateInput?: string | Date) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `Pedido ${day}-${month}-${year}`;
};

const generateOrderId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `pedido-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const toSafeFileName = (value: string) => {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    || 'sugestao-compras';
};

const createManualEntry = (): ManualEntry => ({
  nome: '',
  fornecedor_codigo: '',
  quantidade: '',
  observacao: '',
});

const buildFornecedorKey = (nome?: string | null) => {
  const normalizedNome = (nome ?? '').trim().toLowerCase();
  if (normalizedNome) return normalizedNome;
  return SEM_FORNECEDOR_KEY;
};

type SavedOrderLike = Partial<SavedOrder> | null | undefined;

const normalizeSavedOrderRecord = (pedido?: SavedOrderLike): SavedOrder => {
  const createdAt = pedido?.createdAt ?? new Date().toISOString();
  const safeName = pedido?.name?.trim() || buildDefaultOrderName(createdAt);
  const safeProdutos = Array.isArray(pedido?.produtos)
    ? (pedido?.produtos as SavedOrderProduct[])
    : [];
  const safeManualItems = Array.isArray(pedido?.manualItems)
    ? (pedido?.manualItems as SavedOrderManualItem[])
    : [];

  return {
    id: pedido?.id ?? generateOrderId(),
    name: safeName,
    createdAt,
    updatedAt: pedido?.updatedAt ?? createdAt,
    periodDays: Number.isFinite(pedido?.periodDays) ? Number(pedido?.periodDays) : DEFAULT_PERIOD_DIAS,
    targetDays: Number.isFinite(pedido?.targetDays) ? Number(pedido?.targetDays) : DEFAULT_COBERTURA_DIAS,
    produtos: safeProdutos,
    manualItems: safeManualItems,
  };
};

export default function ComprasClient() {
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DIAS);
  const [targetDays, setTargetDays] = useState(DEFAULT_COBERTURA_DIAS);
  const [dados, setDados] = useState<Sugestao[]>([]);
  const [produtoFiltro, setProdutoFiltro] = useState('');
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<string[]>([]);
  const [manualEntry, setManualEntry] = useState<ManualEntry>(() => createManualEntry());
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [selectionFilter, setSelectionFilter] = useState<'all' | 'selected' | 'unselected'>('all');
  const [pedidoOverrides, setPedidoOverrides] = useState<Record<number, number>>({});
  const [pedidoInputDrafts, setPedidoInputDrafts] = useState<Record<number, string>>({});
  const [sortConfig, setSortConfig] = useState<Array<{ key: SortKey; direction: SortDirection }>>([]);
  const [currentOrderName, setCurrentOrderName] = useState(() => buildDefaultOrderName());
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [savedOrders, setSavedOrders] = useState<SavedOrder[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savedOrdersSyncing, setSavedOrdersSyncing] = useState(false);
  const [savedOrdersSyncError, setSavedOrdersSyncError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingSavesRef = useRef<Record<number, AutoSavePayload>>({});
  const saveTimersRef = useRef<Record<number, NodeJS.Timeout>>({});
  const selectionLoadedRef = useRef(false);
  const savedOrdersLoadedRef = useRef(false);
  const isMountedRef = useRef(true);
  const manualItemIdRef = useRef(MANUAL_ITEM_ID_SEED);

  const fetchSavedOrdersFromApi = useCallback(async () => {
    setSavedOrdersSyncing(true);
    setSavedOrdersSyncError(null);
    try {
      const response = await fetch('/api/compras/pedidos', { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = typeof body?.error === 'string' ? body.error : 'Resposta inválida da API.';
        throw new Error(message);
      }
      const payload = await response.json();
      const normalized = Array.isArray(payload?.orders)
        ? (payload.orders as SavedOrder[]).map((pedido) => normalizeSavedOrderRecord(pedido))
        : [];
      if (isMountedRef.current) {
        setSavedOrders(normalized);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setSavedOrdersSyncError(getErrorMessage(error) ?? 'Não foi possível sincronizar os pedidos salvos.');
      }
    } finally {
      if (isMountedRef.current) {
        setSavedOrdersSyncing(false);
      }
    }
  }, []);

  const handlePeriodInput = (value: string) => {
    const parsed = Number(value);
    const fallback = Number.isFinite(parsed) ? Math.floor(parsed) : 60;
    setPeriodDays(Math.min(Math.max(fallback, 15), 180));
  };

  const handleCoverageInput = (value: string) => {
    const parsed = Number(value);
    const fallback = Number.isFinite(parsed) ? parsed : DEFAULT_COBERTURA_DIAS;
    const clamped = Math.min(Math.max(fallback, MIN_COBERTURA_DIAS), MAX_COBERTURA_DIAS);
    setTargetDays(clamped);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(
        `/api/compras/sugestoes?periodDays=${periodDays}&targetMonths=${Number((targetDays / DAYS_PER_MONTH).toFixed(2))}`,
        { cache: 'no-store', signal: controller.signal }
      );
      if (!res.ok) throw new Error('Erro ao carregar sugestões');
      const json = await res.json();
      const produtosNormalizados: Sugestao[] = (json.produtos || []).map((item: Sugestao) => ({
        ...item,
        embalagem_qtd: Math.max(Number(item.embalagem_qtd) || 1, 1),
        observacao_compras: item.observacao_compras ?? null,
      }));
      setDados(produtosNormalizados);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error: unknown) {
      if ((error as DOMException)?.name === 'AbortError') {
        return;
      }
      setErro(getErrorMessage(error) ?? 'Erro inesperado');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoading(false);
    }
  }, [periodDays, targetDays]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, COMPRAS_RECALC_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(COMPRAS_SAVED_ORDERS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SavedOrder[];
        if (Array.isArray(parsed)) {
          const normalized = parsed.map((pedido) => normalizeSavedOrderRecord(pedido));
          setSavedOrders(normalized);
        }
      }
    } catch {
      // ignora erros de leitura
    } finally {
      savedOrdersLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    void fetchSavedOrdersFromApi();
  }, [fetchSavedOrdersFromApi]);

  useEffect(() => {
    if (typeof window === 'undefined' || !savedOrdersLoadedRef.current) return;
    try {
      localStorage.setItem(COMPRAS_SAVED_ORDERS_KEY, JSON.stringify(savedOrders));
    } catch {
      // ignora erros de escrita
    }
  }, [savedOrders]);

  useEffect(() => {
    if (!dados.length) {
      setPedidoOverrides({});
      setPedidoInputDrafts({});
      setManualEntry(createManualEntry());
      return;
    }
    const validIds = new Set(dados.map((item) => item.id_produto_tiny));
    setPedidoOverrides((prev) => {
      const next: Record<number, number> = {};
      let changed = false;
      for (const [key, value] of Object.entries(prev)) {
        const id = Number(key);
        if (validIds.has(id)) {
          next[id] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setPedidoInputDrafts((prev) => {
      const next: Record<number, string> = {};
      let changed = false;
      for (const [key, value] of Object.entries(prev)) {
        const id = Number(key);
        if (validIds.has(id)) {
          next[id] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dados]);

  const fornecedorOptions = useMemo<FornecedorOption[]>(() => {
    const map = new Map<string, FornecedorOption>();
    dados.forEach((produto) => {
      const key = buildFornecedorKey(produto.fornecedor_nome);
      if (key === SEM_FORNECEDOR_KEY || map.has(key)) {
        return;
      }
      const nome = formatFornecedorNome(produto.fornecedor_nome);
      map.set(key, {
        value: key,
        label: nome || 'Fornecedor sem nome',
      });
    });
    const sorted = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    sorted.unshift({ value: SEM_FORNECEDOR_KEY, label: 'Sem fornecedor' });
    return sorted;
  }, [dados]);

  const fornecedorDisplayFormatter = useCallback((values: (string | number)[], options: Array<{ value: string | number; label: string }>) => {
    if (!values.length) return 'Todos os fornecedores';
    if (values.length === 1) {
      const option = options.find((opt) => opt.value === values[0]);
      return option?.label ?? '1 selecionado';
    }
    return `${values.length} selecionados`;
  }, []);

  const dadosFiltrados = useMemo(() => {
    const termoProduto = produtoFiltro.trim().toLowerCase();
    const fornecedorSet = new Set(fornecedoresSelecionados);
    return dados.filter((produto) => {
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
  }, [dados, produtoFiltro, fornecedoresSelecionados]);

  const derivados = useMemo<ProdutoDerivado[]>(() => {
    return dadosFiltrados.map((p, index) => {
      const pack = Math.max(p.embalagem_qtd || 1, 1);
      const consumoMensal = Math.max(p.consumo_mensal || 0, 0);
      const consumoDiario = consumoMensal / DAYS_PER_MONTH;
      const pontoMinimo = consumoDiario * targetDays;
      const estoqueAtual = Math.max(p.disponivel ?? 0, 0);
      const precisaRepor = pontoMinimo > 0 ? estoqueAtual < pontoMinimo : false;
      const quantidadeNecessaria = precisaRepor ? Math.max(pontoMinimo - estoqueAtual, 0) : 0;
      const quantidadeFinal = precisaRepor && quantidadeNecessaria > 0 ? Math.ceil(quantidadeNecessaria / pack) * pack : 0;
      const alerta = precisaRepor && quantidadeNecessaria > 0 && quantidadeNecessaria < pack;
      const coberturaAtualDias = consumoDiario > 0 ? estoqueAtual / consumoDiario : null;
      const necessarioLabel = Math.ceil(Math.max(quantidadeNecessaria, 0)).toLocaleString('pt-BR');
      const statusCobertura = precisaRepor
        ? `Cobertura insuficiente — faltam ${necessarioLabel} unid. para ${targetDays} dias.`
        : 'Abaixo do lote, mas ainda dentro da cobertura — não comprar agora.';
      const overrideValue = pedidoOverrides[p.id_produto_tiny];
      const quantidadeFinalAjustada = Number.isFinite(overrideValue)
        ? Math.max(0, Number(overrideValue))
        : quantidadeFinal;

      return {
        ...p,
        embalagem_qtd: pack,
        consumoDiario,
        pontoMinimo,
        coberturaAtualDias,
        precisaRepor,
        quantidadeNecessaria,
        sugestao_calculada: quantidadeFinal,
        sugestao_ajustada: quantidadeFinalAjustada,
        alerta_embalagem: alerta,
        statusCobertura,
        originalIndex: index,
      };
    });
  }, [dadosFiltrados, pedidoOverrides, targetDays]);

  const sortedProdutos = useMemo(() => {
    if (!sortConfig.length) return derivados;
    const cloned = [...derivados];

    const compareValues = (valueA: ProdutoDerivado[SortKey], valueB: ProdutoDerivado[SortKey], direction: SortDirection) => {
      const normalizedA = valueA ?? null;
      const normalizedB = valueB ?? null;

      if (normalizedA === null && normalizedB === null) {
        return 0;
      }
      if (normalizedA === null) return 1;
      if (normalizedB === null) return -1;

      const multiplier = direction === 'asc' ? 1 : -1;

      if (typeof normalizedA === 'number' && typeof normalizedB === 'number') {
        if (normalizedA === normalizedB) {
          return 0;
        }
        return (normalizedA - normalizedB) * multiplier;
      }

      const textA = String(normalizedA).toLowerCase();
      const textB = String(normalizedB).toLowerCase();
      if (textA === textB) {
        return 0;
      }
      return textA.localeCompare(textB) * multiplier;
    };

    cloned.sort((a, b) => {
      for (const { key, direction } of sortConfig) {
        const result = compareValues(a[key], b[key], direction);
        if (result !== 0) {
          return result;
        }
      }
      return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
    });

    return cloned;
  }, [derivados, sortConfig]);

  const filteredSortedProdutos = useMemo(() => {
    if (selectionFilter === 'all') return sortedProdutos;
    const predicate = selectionFilter === 'selected'
      ? (produto: ProdutoDerivado) => Boolean(selectedIds[produto.id_produto_tiny])
      : (produto: ProdutoDerivado) => !selectedIds[produto.id_produto_tiny];
    return sortedProdutos.filter(predicate);
  }, [selectionFilter, selectedIds, sortedProdutos]);

  const manualItemsFiltered = useMemo(() => {
    if (selectionFilter === 'all') return manualItems;
    return manualItems.filter((item) =>
      selectionFilter === 'selected' ? Boolean(selectedIds[item.id]) : !selectedIds[item.id]
    );
  }, [manualItems, selectedIds, selectionFilter]);

  const toggleSort = (key: SortKey) => {
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
  };

  const getAriaSort = (key: SortKey): 'none' | 'ascending' | 'descending' => {
    const entry = sortConfig.find((item) => item.key === key);
    if (!entry) return 'none';
    return entry.direction === 'asc' ? 'ascending' : 'descending';
  };

  const renderSortIcon = (key: SortKey) => {
    const entryIndex = sortConfig.findIndex((item) => item.key === key);
    const isActive = entryIndex !== -1;
    const baseClass = `w-3.5 h-3.5 ${isActive ? 'text-[var(--accent)]' : 'opacity-40'}`;
    if (!isActive) {
      return <ChevronsUpDown className={baseClass} aria-hidden />;
    }
    const direction = sortConfig[entryIndex].direction;
    const IconComponent = direction === 'desc' ? ChevronDown : ChevronUp;
    return (
      <span className="inline-flex items-center gap-1">
        <IconComponent className={baseClass} aria-hidden />
        {sortConfig.length > 1 && (
          <span className="text-[10px] font-semibold text-[var(--accent)]">{entryIndex + 1}</span>
        )}
      </span>
    );
  };

  const renderSortableHeader = (label: string, key: SortKey) => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => toggleSort(key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleSort(key);
        }
      }}
      className="flex items-center gap-1 text-inherit uppercase tracking-[0.1em] font-semibold cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      aria-label={`Ordenar coluna ${label}`}
    >
      <span>{label}</span>
      {renderSortIcon(key)}
    </div>
  );

  const totalCompra = useMemo(
    () => derivados.reduce((acc, cur) => acc + (cur.sugestao_ajustada || 0), 0),
    [derivados]
  );

  const consumoPeriodoTotal = useMemo(
    () => derivados.reduce((acc, cur) => acc + (cur.consumo_periodo || 0), 0),
    [derivados]
  );

  const consumoMensalEquivalente = useMemo(() => {
    if (periodDays <= 0) return 0;
    return (consumoPeriodoTotal / periodDays) * 30;
  }, [consumoPeriodoTotal, periodDays]);

  const produtosComPedido = useMemo(
    () => derivados.filter((p) => p.precisaRepor && p.sugestao_ajustada > 0).length,
    [derivados]
  );

  const produtosComAlerta = useMemo(
    () => derivados.filter((p) => p.precisaRepor && p.alerta_embalagem).length,
    [derivados]
  );

  const produtosSemFornecedor = useMemo(
    () => derivados.filter((p) => !p.fornecedor_codigo).length,
    [derivados]
  );

  const coberturaDias = targetDays;
  const coberturaMeses = useMemo(() => Number((targetDays / DAYS_PER_MONTH).toFixed(2)), [targetDays]);
  const coberturaMesesLabel = useMemo(
    () =>
      coberturaMeses.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [coberturaMeses]
  );

  const selectionCount = useMemo(
    () => Object.values(selectedIds).filter(Boolean).length,
    [selectedIds]
  );

  const manualQuantidadeNumber = useMemo(() => {
    const normalized = manualEntry.quantidade?.replace(',', '.').trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
  }, [manualEntry.quantidade]);

  const selectionTotalQuantidade = useMemo(() => {
    const produtosTotal = derivados.reduce((acc, produto) => {
      return selectedIds[produto.id_produto_tiny] ? acc + (produto.sugestao_ajustada || 0) : acc;
    }, 0);
    const manualTotal = manualItems.reduce((acc, item) => {
      return selectedIds[item.id] ? acc + (item.quantidade || 0) : acc;
    }, 0);
    return produtosTotal + manualTotal;
  }, [derivados, manualItems, selectedIds]);

  const formatProdutoLabel = useCallback((produto: { nome?: string | null; codigo?: string | null; id_produto_tiny?: number }) => {
    const nome = produto.nome?.trim();
    if (nome) return nome;
    const codigo = produto.codigo?.trim();
    if (codigo) return codigo;
    if (produto.id_produto_tiny != null) {
      return `Produto ID ${produto.id_produto_tiny}`;
    }
    return 'Produto sem identificação';
  }, []);

  const buildSelectionSnapshot = useCallback(() => {
    const produtosSnapshot: SavedOrderProduct[] = [];
    const manualSnapshot: SavedOrderManualItem[] = [];
    const validationErrors: string[] = [];

    derivados.forEach((produto) => {
      if (!selectedIds[produto.id_produto_tiny]) return;
      const finalQuantidadeRaw =
        pedidoOverrides[produto.id_produto_tiny] ?? produto.sugestao_ajustada ?? 0;
      const finalQuantidade = Number.isFinite(finalQuantidadeRaw)
        ? Math.max(0, Math.round(finalQuantidadeRaw))
        : 0;
      const fornecedorCodigo = produto.fornecedor_codigo?.trim() ?? '';
      const missing: string[] = [];
      if (!fornecedorCodigo) missing.push('código do fornecedor');
      if (!(Number.isFinite(finalQuantidade) && finalQuantidade > 0)) missing.push('quantidade');
      if (missing.length) {
        validationErrors.push(`${formatProdutoLabel(produto)} (${missing.join(' e ')})`);
      }
      produtosSnapshot.push({
        id_produto_tiny: produto.id_produto_tiny,
        nome: produto.nome,
        codigo: produto.codigo,
        fornecedor_nome: produto.fornecedor_nome,
        fornecedor_codigo: fornecedorCodigo || null,
        gtin: produto.gtin,
        quantidade: finalQuantidade,
        observacao: produto.observacao_compras ?? null,
      });
    });

    manualItems.forEach((item, index) => {
      if (!selectedIds[item.id]) return;
      const fornecedorCodigo = item.fornecedor_codigo.trim();
      const missing: string[] = [];
      if (!fornecedorCodigo) missing.push('código do fornecedor');
      if (!(Number.isFinite(item.quantidade) && item.quantidade > 0)) missing.push('quantidade');
      if (missing.length) {
        const label = item.nome || `Item manual ${index + 1}`;
        validationErrors.push(`${label} (${missing.join(' e ')})`);
      }
      manualSnapshot.push({
        id: item.id,
        nome: item.nome,
        fornecedor_codigo: fornecedorCodigo,
        quantidade: item.quantidade,
        observacao: item.observacao || '',
      });
    });

    return { produtosSnapshot, manualSnapshot, validationErrors };
  }, [derivados, manualItems, pedidoOverrides, selectedIds, formatProdutoLabel]);

  const ultimaAtualizacao = useMemo(() => {
    if (!lastUpdatedAt) return 'Nunca calculado';
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return formatter.format(new Date(lastUpdatedAt));
  }, [lastUpdatedAt]);

  const historyDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  const highlightCards = useMemo(
    () => [
      {
        id: 'produtos',
        label: 'Produtos com pedido',
        value: `${produtosComPedido}/${derivados.length || 0}`,
        helper: 'Itens abaixo da cobertura desejada',
        tone: 'success' as const,
      },
      {
        id: 'consumo',
        label: 'Consumo no período',
        value: `${consumoPeriodoTotal.toLocaleString('pt-BR')} unid.`,
        helper: `Últimos ${periodDays} dias (${consumoMensalEquivalente.toLocaleString('pt-BR', {
          maximumFractionDigits: 0,
        })} / mês)`,
        tone: 'neutral' as const,
      },
      {
        id: 'alertas',
        label: 'Ajustes pendentes',
        value: `${produtosComAlerta} alerta${produtosComAlerta === 1 ? '' : 's'}`,
        helper: `${produtosSemFornecedor} sem fornecedor`,
        tone: produtosComAlerta > 0 || produtosSemFornecedor > 0 ? ('warning' as const) : ('success' as const),
      },
    ],
    [
      consumoMensalEquivalente,
      consumoPeriodoTotal,
      derivados.length,
      periodDays,
      produtosComAlerta,
      produtosComPedido,
      produtosSemFornecedor,
    ]
  );

  const sideFacts = useMemo(
    () => [
      { label: 'Itens listados', value: derivados.length.toLocaleString('pt-BR') },
      { label: 'Cobertura desejada', value: `${coberturaDias} dias` },
      { label: 'Consumo mensal méd.', value: `${consumoMensalEquivalente.toLocaleString('pt-BR', {
        maximumFractionDigits: 0,
      })} unid.` },
      { label: 'Total sugerido', value: `${totalCompra.toLocaleString('pt-BR')} unid.` },
    ],
    [coberturaDias, consumoMensalEquivalente, derivados.length, totalCompra]
  );

  const guidanceTips = useMemo(
    () => [
      {
        title: 'Alertas de embalagem',
        body:
          produtosComAlerta > 0
            ? `${produtosComAlerta} item${produtosComAlerta === 1 ? '' : 's'} não fecham o lote informado.`
            : 'Todos os itens respeitam o múltiplo configurado.',
      },
      {
        title: 'Cadastro de fornecedores',
        body:
          produtosSemFornecedor > 0
            ? `${produtosSemFornecedor} item${produtosSemFornecedor === 1 ? '' : 's'} ainda estão sem código do fornecedor.`
            : 'Todos os itens possuem referência de fornecedor.',
      },
      {
        title: 'Cobertura planejada',
        body: `Gerando pedidos para ${coberturaDias} dias considerando consumo médio recente.`,
      },
    ],
    [coberturaDias, produtosComAlerta, produtosSemFornecedor]
  );

  const sanitizeFornecedor = useCallback((value: string | null | undefined) => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }, []);

  const sanitizeObservacao = useCallback((value: string | null | undefined) => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }, []);

  const sanitizeEmbalagem = useCallback((value: number | null | undefined) => {
    if (!Number.isFinite(value)) return null;
    return Math.max(1, Math.floor(Number(value)));
  }, []);

  const updateManualEntry = useCallback((field: keyof ManualEntry, value: string) => {
    setManualEntry((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleIncludeManualEntry = useCallback(() => {
    const trimmedNome = manualEntry.nome.trim();
    const trimmedFornecedor = manualEntry.fornecedor_codigo.trim();
    if (!trimmedNome || !trimmedFornecedor) {
      alert('Preencha nome do produto e código do fornecedor para incluir o item manual.');
      return;
    }
    if (manualQuantidadeNumber <= 0) {
      alert('Informe uma quantidade maior que zero para incluir o item manual.');
      return;
    }
    const newItem: ManualItem = {
      id: manualItemIdRef.current--,
      nome: trimmedNome,
      fornecedor_codigo: trimmedFornecedor,
      quantidade: manualQuantidadeNumber,
      observacao: manualEntry.observacao.trim(),
    };
    setManualItems((prev) => [...prev, newItem]);
    setSelectedIds((prev) => ({
      ...prev,
      [newItem.id]: true,
    }));
    setManualEntry(createManualEntry());
  }, [manualEntry, manualQuantidadeNumber]);

  const handleResetManualEntry = useCallback(() => {
    setManualEntry(createManualEntry());
  }, []);

  const handleRemoveManualItem = useCallback((id: number) => {
    setManualItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => {
      if (prev[id] == null) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const syncSavedOrderName = useCallback(
    async (id: string, newName: string, fallbackName: string) => {
      try {
        const response = await fetch(`/api/compras/pedidos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message = typeof body?.error === 'string' ? body.error : 'Não foi possível renomear o pedido.';
          throw new Error(message);
        }
        const payload = await response.json().catch(() => null);
        if (!payload?.order) {
          throw new Error('Resposta inválida da API ao renomear o pedido.');
        }
        const updatedOrder = normalizeSavedOrderRecord(payload.order as SavedOrder);
        setSavedOrders((prev) => prev.map((pedido) => (pedido.id === id ? updatedOrder : pedido)));
      } catch (error) {
        alert(`Falha ao renomear o pedido: ${getErrorMessage(error) ?? 'erro inesperado'}`);
        setSavedOrders((prev) =>
          prev.map((pedido) => (pedido.id === id ? { ...pedido, name: fallbackName } : pedido))
        );
      }
    },
    []
  );

  const handleDeleteSavedOrder = useCallback(
    async (id: string) => {
      if (!window.confirm('Deseja remover este pedido salvo?')) {
        return;
      }
      let removedOrder: SavedOrder | null = null;
      let removedIndex = -1;
      setSavedOrders((prev) => {
        const idx = prev.findIndex((pedido) => pedido.id === id);
        if (idx === -1) return prev;
        removedOrder = prev[idx];
        removedIndex = idx;
        const next = [...prev];
        next.splice(idx, 1);
        return next;
      });
      try {
        const response = await fetch(`/api/compras/pedidos/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message = typeof body?.error === 'string' ? body.error : 'Não foi possível excluir.';
          throw new Error(message);
        }
      } catch (error) {
        alert(`Falha ao remover o pedido: ${getErrorMessage(error) ?? 'erro inesperado'}`);
        if (removedOrder) {
          setSavedOrders((prev) => {
            const next = [...prev];
            const insertIndex = removedIndex < 0 ? 0 : Math.min(removedIndex, next.length);
            next.splice(insertIndex, 0, removedOrder as SavedOrder);
            return next;
          });
        }
      }
    },
    []
  );

  const handleRenameSavedOrder = useCallback((id: string, value: string) => {
    setSavedOrders((prev) =>
      prev.map((pedido) => (pedido.id === id ? { ...pedido, name: value } : pedido))
    );
  }, []);

  const handleRenameSavedOrderBlur = useCallback(
    (id: string) => {
      const pedidoAtual = savedOrders.find((pedido) => pedido.id === id);
      if (!pedidoAtual) return;
      const fallbackName = pedidoAtual.name;
      const sanitized = pedidoAtual.name.trim() || buildDefaultOrderName(pedidoAtual.createdAt);
      if (sanitized !== pedidoAtual.name) {
        setSavedOrders((prev) =>
          prev.map((pedido) => (pedido.id === id ? { ...pedido, name: sanitized } : pedido))
        );
      }
      void syncSavedOrderName(id, sanitized, fallbackName);
    },
    [savedOrders, syncSavedOrderName]
  );

  const handleLoadSavedOrder = useCallback(
    (pedido: SavedOrder) => {
      setActiveTab('current');
      const sanitizedName = pedido.name.trim() || buildDefaultOrderName(pedido.createdAt);
      setCurrentOrderName(sanitizedName);
      setPeriodDays(pedido.periodDays);
      setTargetDays(pedido.targetDays);

      const recreatedManualItems: ManualItem[] = pedido.manualItems.map((item) => {
        const nextId = manualItemIdRef.current--;
        return {
          id: nextId,
          nome: item.nome,
          fornecedor_codigo: item.fornecedor_codigo,
          quantidade: item.quantidade,
          observacao: item.observacao,
        };
      });

      setManualItems(recreatedManualItems);
      setManualEntry(createManualEntry());

      setPedidoOverrides(() => {
        const next: Record<number, number> = {};
        pedido.produtos.forEach((produto) => {
          next[produto.id_produto_tiny] = produto.quantidade;
        });
        return next;
      });

      setSelectedIds(() => {
        const next: Record<number, boolean> = {};
        derivados.forEach((produto) => {
          next[produto.id_produto_tiny] = false;
        });
        pedido.produtos.forEach((produto) => {
          next[produto.id_produto_tiny] = true;
        });
        recreatedManualItems.forEach((item) => {
          next[item.id] = true;
        });
        return next;
      });

      setSelectionFilter('selected');
      setPedidoInputDrafts({});
    },
    [derivados, setPeriodDays, setTargetDays]
  );

  const handlePedidoInputChange = useCallback((id: number, value: string, sugestaoAutomatica?: number) => {
    setPedidoInputDrafts((prev) => ({ ...prev, [id]: value }));
    const normalized = value?.replace(',', '.').trim();
    if (!normalized) {
      setPedidoOverrides((prev) => {
        if (prev[id] == null) return prev;
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
        if (prev[id] == null) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setPedidoOverrides((prev) => {
      if (prev[id] === coerced) return prev;
      return { ...prev, [id]: coerced };
    });
  }, []);

  const handlePedidoInputBlur = useCallback((id: number) => {
    setPedidoInputDrafts((prev) => {
      if (prev[id] == null) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const flushAutoSave = useCallback(
    async (id: number, options?: { skipStatusUpdate?: boolean }) => {
      if (saveTimersRef.current[id]) {
        clearTimeout(saveTimersRef.current[id]);
        delete saveTimersRef.current[id];
      }
      const payload = pendingSavesRef.current[id];
      if (!payload) {
        if (!options?.skipStatusUpdate && isMountedRef.current) {
          setSyncStatus((prev) => {
            if (!prev[id]) return prev;
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
    },
    []
  );

  const scheduleAutoSave = useCallback(
    (id: number, payload: AutoSavePayload) => {
      pendingSavesRef.current[id] = {
        ...pendingSavesRef.current[id],
        ...payload,
      };
      if (saveTimersRef.current[id]) {
        clearTimeout(saveTimersRef.current[id]);
      }
      saveTimersRef.current[id] = setTimeout(() => {
        flushAutoSave(id);
      }, AUTO_SAVE_DEBOUNCE_MS);
      if (isMountedRef.current) {
        setSyncStatus((prev) => ({ ...prev, [id]: 'saving' }));
      }
    },
    [flushAutoSave]
  );

  const flushAllPendingSaves = useCallback(
    async (options?: { skipStatusUpdate?: boolean }) => {
      const pendingIds = Object.keys(pendingSavesRef.current)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
      if (!pendingIds.length) return;
      await Promise.all(pendingIds.map((id) => flushAutoSave(id, options)));
    },
    [flushAutoSave]
  );

  const handleSaveCurrentOrder = useCallback(async () => {
    if (savingOrder) return;
    const { produtosSnapshot, manualSnapshot, validationErrors } = buildSelectionSnapshot();
    if (!produtosSnapshot.length && !manualSnapshot.length) {
      alert('Selecione pelo menos um item para salvar o pedido.');
      return;
    }
    if (validationErrors.length) {
      alert(
        `Não é possível salvar o pedido ainda. Revise os campos pendentes.\n- ${validationErrors.join('\n- ')}`
      );
      return;
    }
    await flushAllPendingSaves();
    const sanitizedName = currentOrderName.trim() || buildDefaultOrderName();
    setSavingOrder(true);
    try {
      const response = await fetch('/api/compras/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sanitizedName,
          periodDays,
          targetDays,
          produtos: produtosSnapshot,
          manualItems: manualSnapshot,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = typeof body?.error === 'string' ? body.error : 'Não foi possível salvar o pedido.';
        throw new Error(message);
      }
      const payload = await response.json().catch(() => null);
      if (!payload?.order) {
        throw new Error('Resposta inválida da API ao salvar o pedido.');
      }
      const savedOrder = normalizeSavedOrderRecord(payload.order as SavedOrder);
      setSavedOrders((prev) => [savedOrder, ...prev.filter((pedido) => pedido.id !== savedOrder.id)]);
      setActiveTab('history');
    } catch (error) {
      alert(`Não foi possível salvar o pedido na nuvem: ${getErrorMessage(error) ?? 'erro inesperado'}`);
    } finally {
      setSavingOrder(false);
    }
  }, [
    buildSelectionSnapshot,
    currentOrderName,
    flushAllPendingSaves,
    periodDays,
    savingOrder,
    targetDays,
  ]);

  const retryAutoSave = useCallback(
    (id: number) => {
      const produto = dados.find((item) => item.id_produto_tiny === id);
      if (!produto) return;
      scheduleAutoSave(id, {
        fornecedor_codigo: sanitizeFornecedor(produto.fornecedor_codigo),
        embalagem_qtd: sanitizeEmbalagem(produto.embalagem_qtd),
        observacao_compras: sanitizeObservacao(produto.observacao_compras),
      });
    },
    [dados, sanitizeEmbalagem, sanitizeFornecedor, sanitizeObservacao, scheduleAutoSave]
  );

  const gerarPdf = async () => {
    if (exportando) return;
    const { produtosSnapshot, manualSnapshot, validationErrors } = buildSelectionSnapshot();
    if (produtosSnapshot.length === 0 && manualSnapshot.length === 0) {
      alert('Selecione pelo menos um item para exportar.');
      return;
    }
    if (validationErrors.length) {
      alert(
        `Não é possível gerar o PDF com itens pendentes. Preencha o código do fornecedor e a quantidade final:\n- ${
          validationErrors.join('\n- ')
        }`
      );
      return;
    }
    setExportando(true);
    try {
      await flushAllPendingSaves();
      const orderTitle = currentOrderName.trim() || buildDefaultOrderName();
      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new JsPDF();
      try {
        const logoResp = await fetch('/brand/logo-vertical.png');
        const blob = await logoResp.blob();
        const reader = new FileReader();
        const dataUrl: string = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        doc.addImage(dataUrl, 'PNG', 14, 12, 18, 24);
      } catch {
        // prossegue sem logo
      }

      doc.setFontSize(16);
      doc.text('Pedido de Compras', 36, 18);
      doc.setFontSize(9);
      doc.setTextColor(90);
      doc.text(`Data do pedido: ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`, 36, 24);
      doc.text(`Qtd de itens: ${produtosSnapshot.length + manualSnapshot.length}`, 36, 29);
      doc.setTextColor(0);
      doc.setFontSize(11);
      doc.text(`Pedido: ${orderTitle}`, 36, 35);

      const rows = produtosSnapshot.map((p) => {
        return [
          p.fornecedor_codigo || '-',
          p.gtin || '-',
          p.nome || '',
          p.quantidade.toLocaleString('pt-BR'),
          (p.observacao || '').slice(0, 120),
        ];
      });

      manualSnapshot.forEach((item) => {
        rows.push([
          item.fornecedor_codigo.trim() || '-',
          '-',
          item.nome || 'Produto manual',
          item.quantidade.toLocaleString('pt-BR'),
          item.observacao.slice(0, 120) || '',
        ]);
      });

      const tableResult = autoTable(doc, {
        head: [['Código', 'EAN', 'Produto', 'Qtd Pedido', 'Observações']],
        body: rows,
        startY: 42,
        styles: { fontSize: 9, cellPadding: 4, fillColor: [249, 250, 251], textColor: [38, 38, 38], lineColor: [236, 239, 241], lineWidth: 0.2 },
        headStyles: { fillColor: [32, 51, 84], textColor: 255, lineWidth: 0 },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        theme: 'plain',
      });

      const tableMeta = (tableResult as unknown as { table?: { startX: number; startY: number; width: number; height: number } })?.table
        ?? (doc as unknown as {
          lastAutoTable?: { finalY?: number; startY?: number; startX?: number; width?: number; height?: number };
        }).lastAutoTable;
      if (tableMeta) {
        const { startX, startY, width, height } = tableMeta;
        const numericArgs = [startX, startY, width, height];
        const hasAllNumbers = numericArgs.every((value) => typeof value === 'number' && Number.isFinite(value));
        if (hasAllNumbers && (width ?? 0) > 0 && (height ?? 0) > 0) {
          try {
            doc.setDrawColor(216, 223, 230);
            doc.setLineWidth(0.4);
            doc.roundedRect(startX as number, startY as number, width as number, height as number, 4, 4, 'S');
          } catch (error) {
            console.warn('[Compras] falha ao desenhar borda arredondada no PDF, ignorando.', error);
          }
        }
      }

      doc.save(`${toSafeFileName(orderTitle)}.pdf`);
    } catch (error) {
      alert(`Erro ao gerar PDF: ${getErrorMessage(error) ?? 'erro inesperado'}`);
    } finally {
      setExportando(false);
    }
  };

  useEffect(() => {
    abortRef.current = null;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
      Object.values(saveTimersRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      const pendingIds = Object.keys(pendingSavesRef.current)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
      pendingIds.forEach((id) => {
        void flushAutoSave(id, { skipStatusUpdate: true });
      });
    };
  }, [flushAutoSave]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(COMPRAS_SELECTION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        const normalized = Object.entries(parsed).reduce<Record<number, boolean>>((acc, [key, value]) => {
          const numericKey = Number(key);
          if (Number.isFinite(numericKey)) {
            acc[numericKey] = Boolean(value);
          }
          return acc;
        }, {});
        setSelectedIds(normalized);
      }
    } catch {
      // ignora erros de leitura
    } finally {
      selectionLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !selectionLoadedRef.current) return;
    try {
      localStorage.setItem(COMPRAS_SELECTION_STORAGE_KEY, JSON.stringify(selectedIds));
    } catch {
      // ignora erros de escrita
    }
  }, [selectedIds]);

  useEffect(() => {
    if (!derivados.length) return;
    setSelectedIds((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const produto of derivados) {
        if (next[produto.id_produto_tiny] == null) {
          next[produto.id_produto_tiny] = produto.precisaRepor && produto.sugestao_ajustada > 0;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [derivados]);

  return (
    <div className="space-y-10 pb-24">
      <section className="rounded-[36px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-6 sm:p-8 space-y-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5 px-4 py-1">
              <span className="text-xs font-semibold tracking-[0.3em] uppercase text-slate-500">Compras</span>
              <span className="text-xs text-slate-500">Workflow em tempo real</span>
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white">Central de compras</h1>
              <p className="text-base text-slate-600 dark:text-slate-300">
                Acompanhe consumo real, ajuste coberturas, organize fornecedores e gere pedidos prontos para PDF com poucos cliques.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-300">
              <div className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
                <span>Última atualização {ultimaAtualizacao}</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                <span>
                  {selectionCount} item{selectionCount === 1 ? '' : 's'} preparados · {selectionTotalQuantidade.toLocaleString('pt-BR')} unid.
                </span>
              </div>
            </div>
          </div>
          <div className="w-full max-w-sm space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                onClick={load}
                className="app-btn-primary min-w-[140px] justify-center"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                Recalcular
              </button>
              <button
                onClick={gerarPdf}
                className="app-btn-primary min-w-[140px] justify-center"
                disabled={exportando}
              >
                {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {exportando ? 'Gerando…' : 'Gerar PDF'}
              </button>
            </div>
            <div className="rounded-[28px] border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {selectionCount} item{selectionCount === 1 ? '' : 's'} prontos para pedido
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-300">Total sugerido: {selectionTotalQuantidade.toLocaleString('pt-BR')} unidades</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlightCards.map((card) => (
            <StatCard key={card.id} {...card} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)] items-start">
        <div className="space-y-6 min-w-0">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="w-full space-y-2 lg:max-w-xl">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Nome do pedido</span>
                <input
                  className="app-input w-full"
                  value={currentOrderName}
                  onChange={(event) => setCurrentOrderName(event.target.value)}
                  placeholder="Pedido 02-02-2025"
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={handleSaveCurrentOrder}
                  className="app-btn-primary min-w-[150px] justify-center gap-2"
                  disabled={savingOrder}
                >
                  {savingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingOrder ? 'Salvando…' : 'Salvar pedido'}
                </button>
                <button
                  type="button"
                  onClick={load}
                  className="app-btn-primary min-w-[150px] justify-center"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Refazer pedido
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Sincronizado com a nuvem da Ambienta. Abra e edite pedidos em qualquer dispositivo pelo Histórico.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <FilterNumberTile
              label="Período analisado"
              value={periodDays}
              min={15}
              max={180}
              helper="Mínimo de 15 dias · máximo 180"
              onChange={handlePeriodInput}
              disabled={loading}
            />
            <FilterNumberTile
              label="Cobertura desejada"
              value={targetDays}
              min={MIN_COBERTURA_DIAS}
              max={MAX_COBERTURA_DIAS}
              step={COVERAGE_STEP_DIAS}
              helper={`≈ ${coberturaMesesLabel} meses`}
              onChange={handleCoverageInput}
              suffix="dias"
              disabled={loading}
            />
            <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Total sugerido</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-white">
                {totalCompra.toLocaleString('pt-BR')} unid.
              </p>
              <p className="text-xs text-slate-500">Considera lote informado e consumo real.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
                <span>Filtro de produto</span>
                <span className="text-[10px] tracking-[0.2em] text-slate-400">Busca inteligente</span>
              </div>
              <p className="text-xs text-slate-500">Busque por nome, SKU ou EAN</p>
              <div className="w-full">
                <input
                  className="app-input w-full"
                  placeholder="Ex: Floreira, 1234, 789..."
                  value={produtoFiltro}
                  onChange={(e) => setProdutoFiltro(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
                <span>Filtro de fornecedor</span>
                <span className="text-[10px] tracking-[0.2em] text-slate-400">Inclui &quot;Sem fornecedor&quot;</span>
              </div>
              <p className="text-xs text-slate-500">Selecione um ou mais parceiros para focar o planejamento.</p>
              <MultiSelectDropdown
                label="Fornecedores"
                options={fornecedorOptions}
                selected={fornecedoresSelecionados}
                onChange={(values) => setFornecedoresSelecionados(values.map(String))}
                onClear={() => setFornecedoresSelecionados([])}
                displayFormatter={fornecedorDisplayFormatter}
                showLabel={false}
              />
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-5 space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Resumo rápido</p>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-200">
              {sideFacts.map((fact) => (
                <li key={fact.label} className="flex items-center justify-between gap-4">
                  <span className="truncate">{fact.label}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{fact.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[32px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-5 space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Boas práticas</p>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-200">
              {guidanceTips.map((tip) => (
                <li key={tip.title}>
                  <p className="font-semibold text-slate-900 dark:text-white">{tip.title}</p>
                  <p>{tip.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {erro && (
        <div
          role="alert"
          className="glass-panel glass-tint rounded-[32px] border border-rose-200/60 dark:border-rose-500/20 px-5 py-4 text-sm text-rose-600 dark:text-rose-300"
        >
          {erro}
        </div>
      )}

      <section className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 overflow-hidden">
        <header className="border-b border-white/40 dark:border-white/10 px-6 py-4 space-y-4">
          <div className="inline-flex rounded-full bg-white/50 dark:bg-white/5 border border-white/60 dark:border-white/10 overflow-hidden">
            {[
              { label: 'Sugestão atual', value: 'current' as const },
              { label: 'Histórico de pedidos', value: 'history' as const },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`px-4 py-1.5 text-xs font-semibold tracking-[0.2em] uppercase transition ${
                  activeTab === tab.value
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
                aria-pressed={activeTab === tab.value}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'current' ? (
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Pedidos sugeridos</p>
                <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">Itens recomendados</h3>
              </div>
              <div className="flex flex-col gap-2 text-sm text-slate-500 dark:text-slate-300 text-right">
                <p>
                  Atualizado {ultimaAtualizacao} · {selectionCount} selecionado{selectionCount === 1 ? '' : 's'}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Filtro</span>
                    <div className="inline-flex rounded-full bg-white/60 dark:bg-white/10 border border-white/60 dark:border-white/5 overflow-hidden">
                      {[
                        { label: 'Selecionados', value: 'selected' as const },
                        { label: 'Sem seleção', value: 'unselected' as const },
                        { label: 'Limpar', value: 'all' as const },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSelectionFilter(option.value)}
                          className={`px-3 py-1 text-xs font-semibold transition ${
                            selectionFilter === option.value
                              ? 'text-white bg-[var(--accent)]'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                          aria-pressed={selectionFilter === option.value}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="app-btn-primary min-w-[200px] justify-center"
                    onClick={() => {
                      setSelectedIds(() => {
                        const next: Record<number, boolean> = {};
                        derivados.forEach((produto) => {
                          next[produto.id_produto_tiny] = produto.precisaRepor && produto.sugestao_ajustada > 0;
                        });
                        manualItems.forEach((item) => {
                          next[item.id] = item.quantidade > 0;
                        });
                        return next;
                      });
                    }}
                  >
                    Selecionar itens com pedido
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <p>Consulte e reabra pedidos salvos para editar quantidades, ajustar nomes e gerar novos PDFs.</p>
              <p className="text-xs text-slate-500">
                {savedOrdersSyncing
                  ? 'Sincronizando pedidos com a nuvem…'
                  : savedOrders.length === 0
                  ? 'Nenhum pedido salvo por enquanto.'
                  : `${savedOrders.length} pedido${savedOrders.length === 1 ? '' : 's'} sincronizado${savedOrders.length === 1 ? '' : 's'} na nuvem.`}
              </p>
              {savedOrdersSyncError && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-rose-600">
                  <span>{savedOrdersSyncError}</span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      void fetchSavedOrdersFromApi();
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
            </div>
          )}
        </header>
        {activeTab === 'current' ? (
          <>
            <div className="overflow-auto scrollbar-hide">
              <table className="w-full text-sm">
            <thead className="app-table-header text-[11px] uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">
                  <span className="sr-only">Selecionar</span>
                </th>
                <th className="px-4 py-3 text-left w-[740px]" aria-sort={getAriaSort('nome')}>
                  {renderSortableHeader('Produto', 'nome')}
                </th>
                <th className="px-4 py-3 text-left w-[110px]" aria-sort={getAriaSort('codigo')}>
                  {renderSortableHeader('SKU', 'codigo')}
                </th>
                <th
                  className="px-4 py-3 text-left"
                  aria-sort={getAriaSort('fornecedor_codigo')}
                  style={{ width: '131px', maxWidth: '131px' }}
                >
                  {renderSortableHeader('Código fornecedor', 'fornecedor_codigo')}
                </th>
                <th className="px-4 py-3 text-left w-[50px]" aria-sort={getAriaSort('embalagem_qtd')}>
                  {renderSortableHeader('Emb.', 'embalagem_qtd')}
                </th>
                <th className="px-4 py-3 text-left w-[90px]" aria-sort={getAriaSort('disponivel')}>
                  {renderSortableHeader('Estoque disp.', 'disponivel')}
                </th>
                <th className="px-4 py-3 text-left w-[90px]" aria-sort={getAriaSort('consumo_periodo')}>
                  {renderSortableHeader('Consumo período', 'consumo_periodo')}
                </th>
                <th className="px-4 py-3 text-left w-[80px]" aria-sort={getAriaSort('consumo_mensal')}>
                  {renderSortableHeader('Consumo mensal', 'consumo_mensal')}
                </th>
                <th className="px-4 py-3 text-left w-[80px]" aria-sort={getAriaSort('sugestao_base')}>
                  {renderSortableHeader('Pedido (sugestão bruta)', 'sugestao_base')}
                </th>
                <th className="px-4 py-3 text-left w-[90px]" aria-sort={getAriaSort('sugestao_ajustada')}>
                  {renderSortableHeader('Pedido final', 'sugestao_ajustada')}
                </th>
                <th className="px-4 py-3 text-left w-[220px]">Observações (PDF)</th>
                <th className="px-4 py-3 text-left w-[140px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/30 dark:divide-white/5">
              {filteredSortedProdutos.map((p) => {
                const fornecedorNomeFormatado = formatFornecedorNome(p.fornecedor_nome);
                const draftValue = pedidoInputDrafts[p.id_produto_tiny];
                const overrideValue = pedidoOverrides[p.id_produto_tiny];
                const fallbackFinal = overrideValue ?? p.sugestao_ajustada;
                const pedidoInputValue = draftValue ?? fallbackFinal.toString();
                return (
                  <tr key={p.id_produto_tiny} className="align-top">
                  <td className="px-4 py-3 align-middle text-center">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={Boolean(selectedIds[p.id_produto_tiny])}
                      className={`app-checkbox ${selectedIds[p.id_produto_tiny] ? 'checked' : ''}`}
                      onClick={() =>
                        setSelectedIds((prev) => ({
                          ...prev,
                          [p.id_produto_tiny]: !prev[p.id_produto_tiny],
                        }))
                      }
                    >
                      <span aria-hidden className="app-checkbox-indicator" />
                      <span className="sr-only">
                        {selectedIds[p.id_produto_tiny] ? 'Desmarcar' : 'Selecionar'} {p.nome || 'produto'}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 w-[740px]">
                    <div className="flex items-center gap-3">
                      <div className="relative w-14 h-14 rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 overflow-hidden flex-shrink-0">
                        {p.imagem_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imagem_url} alt={p.nome ?? 'Produto'} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">Sem imagem</div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{p.nome || 'Sem nome'}</div>
                        <p className="text-[11px] text-slate-500">EAN {p.gtin || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 w-[110px]">{p.codigo || '-'}</td>
                  <td className="px-4 py-3" style={{ width: '131px', maxWidth: '131px' }}>
                    <div className="flex flex-col gap-1 w-full min-w-0">
                      <input
                        className="app-input"
                        value={p.fornecedor_codigo || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDados((prev) =>
                            prev.map((x) =>
                              x.id_produto_tiny === p.id_produto_tiny ? { ...x, fornecedor_codigo: value } : x
                            )
                          );
                          scheduleAutoSave(p.id_produto_tiny, {
                            fornecedor_codigo: sanitizeFornecedor(value),
                          });
                        }}
                        placeholder="Código forn."
                      />
                      <p
                        className={`text-[10px] leading-tight truncate ${fornecedorNomeFormatado ? 'text-slate-500' : 'text-slate-400 italic'}`}
                        title={fornecedorNomeFormatado || undefined}
                      >
                        {fornecedorNomeFormatado || 'Nome não cadastrado no Tiny'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 w-[50px]">
                    <input
                      type="number"
                      min={1}
                      className="app-input w-20"
                      value={p.embalagem_qtd}
                      onChange={(e) => {
                        const numeric = Number(e.target.value);
                        setDados((prev) =>
                          prev.map((x) =>
                            x.id_produto_tiny === p.id_produto_tiny
                              ? { ...x, embalagem_qtd: Math.max(1, Number.isFinite(numeric) ? numeric : 1) }
                              : x
                          )
                        );
                        scheduleAutoSave(p.id_produto_tiny, {
                          embalagem_qtd: sanitizeEmbalagem(numeric),
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 w-[90px]">
                    <div className="text-slate-900 dark:text-white font-semibold">{p.disponivel.toLocaleString('pt-BR')}</div>
                    <div className="text-[11px] text-slate-500">Saldo {p.saldo ?? 0} · Reservado {p.reservado ?? 0}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-white w-[90px]">{p.consumo_periodo.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-white w-[80px]">{p.consumo_mensal.toFixed(1)}</td>
                  <td className="px-4 py-3 w-[80px]">
                    <div className="font-semibold text-slate-900 dark:text-white">{p.sugestao_base.toFixed(1)}</div>
                    {p.alerta_embalagem && p.precisaRepor && (
                      <div className="text-[11px] text-amber-600">Abaixo do lote ({p.embalagem_qtd})</div>
                    )}
                  </td>
                  <td className="px-4 py-3 w-[90px]">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={Math.max(1, p.embalagem_qtd)}
                        className={`app-input w-28 text-right font-semibold ${
                          p.precisaRepor
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400 opacity-80'
                        }`}
                        value={pedidoInputValue}
                        onChange={(event) => handlePedidoInputChange(p.id_produto_tiny, event.target.value, p.sugestao_calculada)}
                        onBlur={() => handlePedidoInputBlur(p.id_produto_tiny)}
                      />
                      {!p.precisaRepor && p.sugestao_base > 0 && (
                        <span
                          className="text-sm text-amber-600"
                          aria-label="Recomendação ignorada"
                          role="img"
                          title={p.statusCobertura}
                        >
                          *
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 w-[220px]">
                    <textarea
                      className="app-input w-56 min-h-[64px]"
                      value={p.observacao_compras ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDados((prev) =>
                          prev.map((x) =>
                            x.id_produto_tiny === p.id_produto_tiny ? { ...x, observacao_compras: value } : x
                          )
                        );
                        scheduleAutoSave(p.id_produto_tiny, {
                          observacao_compras: sanitizeObservacao(value),
                        });
                      }}
                      placeholder="Mensagem para fornecedor"
                    />
                  </td>
                  <td className="px-4 py-3 w-[140px]">
                    {syncStatus[p.id_produto_tiny] === 'saving' && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…
                      </span>
                    )}
                    {syncStatus[p.id_produto_tiny] === 'saved' && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Salvo
                      </span>
                    )}
                    {syncStatus[p.id_produto_tiny] === 'error' && (
                      <button
                        type="button"
                        onClick={() => retryAutoSave(p.id_produto_tiny)}
                        className="inline-flex items-center gap-1 text-xs text-rose-600"
                      >
                        <AlertCircle className="w-3.5 h-3.5" /> Tentar novamente
                      </button>
                    )}
                  </td>
                  </tr>
                );
              })}
                {manualItemsFiltered.map((item) => (
                  <tr key={`manual-item-${item.id}`} className="align-top bg-white/50 dark:bg-white/10">
                    <td className="px-4 py-3 align-middle text-center">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={Boolean(selectedIds[item.id])}
                        className={`app-checkbox ${selectedIds[item.id] ? 'checked' : ''}`}
                        onClick={() =>
                          setSelectedIds((prev) => ({
                            ...prev,
                            [item.id]: !prev[item.id],
                          }))
                        }
                      >
                        <span aria-hidden className="app-checkbox-indicator" />
                        <span className="sr-only">{selectedIds[item.id] ? 'Desmarcar' : 'Selecionar'} item manual</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 w-[740px]">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{item.nome}</div>
                        <p className="text-[11px] text-slate-500">Cadastro manual</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[110px]">—</td>
                    <td className="px-4 py-3" style={{ width: '131px', maxWidth: '131px' }}>
                      <div className="flex flex-col gap-1 w-full">
                        <span className="font-semibold text-slate-900 dark:text-white">{item.fornecedor_codigo}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Manual</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[50px]">—</td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[90px]">—</td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[90px]">—</td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[80px]">—</td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[80px]">—</td>
                    <td className="px-4 py-3 w-[80px]">
                      <div className="font-semibold text-slate-900 dark:text-white text-right">{item.quantidade.toLocaleString('pt-BR')}</div>
                    </td>
                    <td className="px-4 py-3 w-[220px]">
                      <div className="text-sm text-slate-600 dark:text-slate-200 whitespace-pre-wrap break-words">
                        {item.observacao || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 w-[140px]">
                      <button
                        type="button"
                        onClick={() => handleRemoveManualItem(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 dark:border-white/20 bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-200 hover:text-rose-600 hover:border-rose-400 transition"
                        aria-label={`Remover item manual ${item.nome}`}
                      >
                        <span aria-hidden className="text-base leading-none font-semibold">−</span>
                        <span className="sr-only">Remover</span>
                      </button>
                    </td>
                  </tr>
                ))}
              <tr key="manual-entry" className="align-top bg-white/40 dark:bg-white/5">
                  <td className="px-4 py-3 align-middle text-center text-slate-400">—</td>
                  <td className="px-4 py-3 w-[740px]">
                    <input
                      className="app-input w-full"
                      placeholder="Nome do produto"
                      value={manualEntry.nome}
                      onChange={(event) => updateManualEntry('nome', event.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[110px]">—</td>
                  <td className="px-4 py-3" style={{ width: '131px', maxWidth: '131px' }}>
                    <input
                      className="app-input"
                      placeholder="Código fornecedor"
                      value={manualEntry.fornecedor_codigo}
                      onChange={(event) => updateManualEntry('fornecedor_codigo', event.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[50px]">—</td>
                  <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[90px]">—</td>
                  <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[90px]">—</td>
                  <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[80px]">—</td>
                  <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 w-[80px]">—</td>
                  <td className="px-4 py-3 w-[90px]">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        className={`app-input w-28 text-right font-semibold ${
                          'text-slate-600 dark:text-white'
                        }`}
                        value={manualEntry.quantidade}
                        onChange={(event) => updateManualEntry('quantidade', event.target.value)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 w-[220px]">
                    <textarea
                      className="app-input w-56 min-h-[64px]"
                      placeholder="Observações"
                      value={manualEntry.observacao}
                      onChange={(event) => updateManualEntry('observacao', event.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3 w-[140px]">
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={handleIncludeManualEntry}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 dark:border-white/20 bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-200 hover:text-[var(--accent)] hover:border-[var(--accent)] transition"
                        aria-label="Incluir item manual"
                      >
                        <span aria-hidden className="text-base leading-none font-semibold">+</span>
                        <span className="sr-only">Adicionar</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetManualEntry}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 dark:border-white/20 bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-200 hover:text-rose-600 hover:border-rose-400 transition"
                        aria-label="Excluir item manual"
                      >
                        <span aria-hidden className="text-base leading-none font-semibold">−</span>
                        <span className="sr-only">Remover</span>
                      </button>
                    </div>
                  </td>
                </tr>
            </tbody>
          </table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/40 dark:border-white/10 px-6 py-4 text-sm text-slate-500 dark:text-slate-300">
              <div>
                {selectionCount} item{selectionCount === 1 ? '' : 's'} selecionado{selectionCount === 1 ? '' : 's'} · Total sugerido dos selecionados: {selectionTotalQuantidade.toLocaleString('pt-BR')} unid.
              </div>
              <div>
                <button
                  type="button"
                  className="app-btn-primary min-w-[160px] justify-center"
                  onClick={() => setSelectedIds({})}
                >
                  Limpar seleção
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="p-6 space-y-4">
            {savedOrders.length === 0 ? (
              <div className="rounded-[28px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-6 text-center text-sm text-slate-600 dark:text-slate-200 space-y-3">
                <p>Nenhum pedido salvo ainda. Salve sua seleção atual para manter o histórico.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('current')}
                  className="app-btn-primary min-w-[200px] justify-center"
                >
                  Voltar para criar pedido
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {savedOrders.map((pedido) => {
                  const createdLabel = historyDateFormatter.format(new Date(pedido.createdAt));
                  const totalItens = pedido.produtos.length + pedido.manualItems.length;
                  return (
                    <div key={pedido.id} className="rounded-[28px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-5 space-y-4">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="w-full md:max-w-xl space-y-2">
                          <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Nome salvo</label>
                          <input
                            className="app-input w-full"
                            value={pedido.name}
                            onChange={(event) => handleRenameSavedOrder(pedido.id, event.target.value)}
                            onBlur={() => handleRenameSavedOrderBlur(pedido.id)}
                          />
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1 text-left md:text-right">
                          <p>Salvo em {createdLabel}</p>
                          <p>
                            {totalItens} item{totalItens === 1 ? '' : 's'} · {pedido.produtos.length} catálogo · {pedido.manualItems.length}{' '}
                            {pedido.manualItems.length === 1 ? 'manual' : 'manuais'}
                          </p>
                          <p>Período {pedido.periodDays} dias · Cobertura {pedido.targetDays} dias</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="app-btn-primary min-w-[200px] justify-center gap-2"
                          onClick={() => handleLoadSavedOrder(pedido)}
                        >
                          <History className="w-4 h-4" />
                          Editar / gerar PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedOrder(pedido.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/50 dark:border-white/20 bg-white/60 dark:bg-white/10 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-200 hover:text-rose-600 hover:border-rose-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
      {activeTab === 'current' && (
        <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40">
          <div className="rounded-[28px] border border-white/60 bg-white/90 dark:bg-slate-900/90 dark:border-white/10 backdrop-blur-xl shadow-xl p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              {selectionCount} item{selectionCount === 1 ? '' : 's'} selecionado{selectionCount === 1 ? '' : 's'} · {selectionTotalQuantidade.toLocaleString('pt-BR')} unid.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleSaveCurrentOrder}
                className="app-btn-primary w-full justify-center gap-2"
                disabled={savingOrder}
              >
                {savingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingOrder ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={gerarPdf}
                className="app-btn-primary w-full justify-center gap-2"
                disabled={exportando}
              >
                {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {exportando ? 'Gerando…' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type FilterNumberTileProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  helper?: string;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function FilterNumberTile({ label, value, min, max, step, helper, suffix, disabled, onChange }: FilterNumberTileProps) {
  return (
    <label className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-2">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          className="app-input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        {suffix && <span className="text-xs font-semibold text-slate-500">{suffix}</span>}
      </div>
      {helper && <p className="text-xs text-slate-500">{helper}</p>}
    </label>
  );
}

type StatCardProps = {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: 'primary' | 'success' | 'neutral' | 'warning';
};

const STAT_TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  primary: 'text-[#5b21b6] dark:text-[#c4b5fd]',
  success: 'text-emerald-600 dark:text-emerald-400',
  neutral: 'text-slate-900 dark:text-white',
  warning: 'text-amber-600 dark:text-amber-400',
};

function StatCard({ label, value, helper, tone }: StatCardProps) {
  return (
    <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-3">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
      <p className={`text-2xl font-semibold ${STAT_TONE_CLASSES[tone]}`}>{value}</p>
      <p className="text-xs text-slate-500">{helper}</p>
    </div>
  );
}
