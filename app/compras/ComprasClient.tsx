
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  RefreshCcw,
  FileDown,
  History,
  Trash2,
  Save,
  Search,
  Sparkles,
  Plus,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { formatFornecedorNome } from '@/lib/fornecedorFormatter';
import type { SavedOrder, SavedOrderManualItem, SavedOrderProduct } from '@/src/types/compras';
import {
  Sugestao,
  ProdutoDerivado,
  ManualEntry,
  ManualItem,
  EstoqueSnapshot,
  AutoSavePayload,
  SortKey,
  SortDirection,
  FornecedorOption,
} from './types';
import { FilterNumberTile } from './components/FilterNumberTile';
import { SummaryStats } from './components/SummaryStats';
import { FilterBar } from './components/FilterBar';
import { ProductTable } from './components/ProductTable';
import { StatCard, StatCardProps } from './components/StatCard';
import { OrderHistoryTab } from './components/OrderHistoryTab';
import { AlertsPanel } from './components/AlertsPanel';
import { SupplierGroupView } from './components/SupplierGroupView';
import { StickyTotalsBar } from './components/StickyTotalsBar';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { useToast } from '../components/ui/Toast';
import { AppDatePicker } from './components/AppDatePicker';

const COMPRAS_RECALC_DEBOUNCE_MS = 350;
const AUTO_SAVE_DEBOUNCE_MS = 800;
const COMPRAS_SELECTION_STORAGE_KEY = 'compras_selection_v1';
const COMPRAS_SAVED_ORDERS_KEY = 'compras_saved_orders_v1';
const COMPRAS_DRAFT_KEY = 'compras_draft_v1';
const DEFAULT_PERIOD_DIAS = 60;
const DAYS_PER_MONTH = 30;
const DEFAULT_COBERTURA_DIAS = 15;
const MIN_COBERTURA_DIAS = 15;
const MAX_COBERTURA_DIAS = 180;
const SEM_FORNECEDOR_KEY = '__SEM_FORNECEDOR__';
const MANUAL_ITEM_ID_SEED = -1;
const DEFAULT_LEAD_TIME = 5; // Valor padrão caso não venha da API

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
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<string[]>([]);
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<string[]>([]);
  const [manualEntry, setManualEntry] = useState<ManualEntry>(() => createManualEntry());

  // Inicialização Lazy com LocalStorage para Rascunho
  const [manualItems, setManualItems] = useState<ManualItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(COMPRAS_DRAFT_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return Array.isArray(parsed.manualItems) ? parsed.manualItems : [];
        } catch { }
      }
    }
    return [];
  });

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [selectionFilter, setSelectionFilter] = useState<'all' | 'selected' | 'unselected'>('all');

  const [pedidoOverrides, setPedidoOverrides] = useState<Record<number, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(COMPRAS_DRAFT_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.pedidoOverrides || {};
        } catch { }
      }
    }
    return {};
  });

  const [pedidoInputDrafts, setPedidoInputDrafts] = useState<Record<number, string>>({});
  const [estoqueLive, setEstoqueLive] = useState<Record<number, EstoqueSnapshot>>({});
  const [estoqueLoading, setEstoqueLoading] = useState<Record<number, boolean>>({});
  const [sortConfig, setSortConfig] = useState<Array<{ key: SortKey; direction: SortDirection }>>([{ key: 'codigo', direction: 'asc' }]);

  const [currentOrderName, setCurrentOrderName] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(COMPRAS_DRAFT_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.currentOrderName) return parsed.currentOrderName;
        } catch { }
      }
    }
    return buildDefaultOrderName();
  });

  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'suppliers'>('current');
  const [savedOrders, setSavedOrders] = useState<SavedOrder[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savedOrdersSyncing, setSavedOrdersSyncing] = useState(false);
  const [savedOrdersSyncError, setSavedOrdersSyncError] = useState<string | null>(null);
  const [alertFilterId, setAlertFilterId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dadosRef = useRef<Sugestao[]>([]);
  const pendingSavesRef = useRef<Record<number, AutoSavePayload>>({});
  const saveTimersRef = useRef<Record<number, NodeJS.Timeout>>({});
  const selectionLoadedRef = useRef(false);
  const savedOrdersLoadedRef = useRef(false);
  const isMountedRef = useRef(true);
  const manualItemIdRef = useRef(MANUAL_ITEM_ID_SEED);
  const { toast } = useToast();

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

  // Carregar dados apenas uma vez no mount inicial (recálculo manual via botão "Novo Pedido")
  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Função para ação explícita de "Novo Pedido"
  const handleNewOrder = async () => {
    const hasDraftData = Object.keys(pedidoOverrides).length > 0 || manualItems.length > 0;

    if (hasDraftData) {
      const confirmed = window.confirm(
        'Você tem um pedido em andamento (Rascunho). Deseja descartá-lo e iniciar um novo pedido zerado?\n\nIsso limpará todas as quantidades digitadas manualmente.'
      );
      if (!confirmed) return;
    }

    // Resetar Rascunho
    setPedidoOverrides({});
    setManualItems([]);
    setCurrentOrderName(buildDefaultOrderName());
    setSelectionFilter('all');
    setSelectedIds({});

    // Limpar Storage (local + servidor)
    localStorage.removeItem(COMPRAS_DRAFT_KEY);
    fetch('/api/compras/draft', { method: 'DELETE' }).catch(() => { });

    // Recarregar sugestões frescas
    await load();

    toast({
      type: 'success',
      title: 'Novo Pedido Iniciado',
      message: 'As sugestões foram recalculadas com dados frescos.',
      duration: 3000
    });
  };

  useEffect(() => {
    dadosRef.current = dados;
  }, [dados]);

  // Carregar rascunho do servidor no mount (prioridade sobre localStorage)
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;

    const loadServerDraft = async () => {
      try {
        const res = await fetch('/api/compras/draft', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (json.draft) {
          const serverDraft = json.draft;
          // Verificar se tem qualquer dado no rascunho
          const hasData =
            Object.keys(serverDraft.pedidoOverrides || {}).length > 0 ||
            (serverDraft.manualItems || []).length > 0 ||
            Object.keys(serverDraft.selectedIds || {}).length > 0 ||
            serverDraft.currentOrderName;

          if (hasData) {
            // Restaurar todos os estados do rascunho
            if (serverDraft.pedidoOverrides) setPedidoOverrides(serverDraft.pedidoOverrides);
            if (serverDraft.manualItems) setManualItems(serverDraft.manualItems);
            if (serverDraft.currentOrderName) setCurrentOrderName(serverDraft.currentOrderName);
            if (serverDraft.selectedIds) setSelectedIds(serverDraft.selectedIds);
            if (serverDraft.periodDays) setPeriodDays(serverDraft.periodDays);
            if (serverDraft.targetDays) setTargetDays(serverDraft.targetDays);
            console.log('[Compras] Rascunho carregado do servidor');
          }
        }
      } catch (err) {
        console.warn('[Compras] Falha ao carregar rascunho do servidor:', err);
      }
    };
    void loadServerDraft();
  }, []);


  // Auto-Save do Rascunho no Servidor (debounced - sem localStorage para evitar QuotaExceeded)
  const draftSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Debounce para salvar no servidor (evitar requisições excessivas)
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/compras/draft', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pedidoOverrides,
            manualItems,
            currentOrderName,
            selectedIds,
            periodDays,
            targetDays,
          }),
        });
      } catch (err) {
        console.warn('[Compras] Falha ao salvar rascunho no servidor:', err);
      }
    }, 2000); // 2 segundos de debounce para servidor

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [manualItems, pedidoOverrides, currentOrderName, selectedIds, periodDays, targetDays]);



  // Estado para pedidos pendentes (histórico considerado como estoque)
  const [selectedPendingOrderIds, setSelectedPendingOrderIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('compras_pending_orders_v1');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // Persistir seleção de pedidos pendentes
  useEffect(() => {
    localStorage.setItem('compras_pending_orders_v1', JSON.stringify(selectedPendingOrderIds));
  }, [selectedPendingOrderIds]);

  // Mapa de estoque pendente (soma das quantidades dos pedidos selecionados)
  const estoquePendenteMap = useMemo(() => {
    const map = new Map<number, number>();
    const selectedOrders = savedOrders.filter(o => selectedPendingOrderIds.includes(o.id));

    for (const order of selectedOrders) {
      for (const prod of order.produtos) {
        // Garantir que ID seja número (caso venha string do JSON)
        const id = Number(prod.id_produto_tiny);
        if (!id) continue;

        const current = map.get(id) || 0;
        map.set(id, current + Number(prod.quantidade || 0));
      }
    }
    return map;
  }, [savedOrders, selectedPendingOrderIds]);

  const togglePendingOrder = useCallback((id: string) => {
    setSelectedPendingOrderIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }, []);

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

    // Auto-select items with positive suggestion if no previous selection exists
    const suggestionsToSelect = dados
      .filter(d => d.sugestao_ajustada > 0)
      .map(d => d.id_produto_tiny);

    if (suggestionsToSelect.length > 0) {
      setSelectedIds(suggestionsToSelect.reduce((acc, id) => ({ ...acc, [id]: true }), {}));
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

  // Opções estáticas para Classe ABC
  const categoriaOptions = useMemo(() => [
    { value: 'A', label: 'Curva A' },
    { value: 'B', label: 'Curva B' },
    { value: 'C', label: 'Curva C' },
  ], []);

  const fornecedorDisplayFormatter = useCallback((values: (string | number)[], options: Array<{ value: string | number; label: string }>) => {
    if (!values.length) return 'Todos os fornecedores';
    if (values.length === 1) {
      const option = options.find((opt) => opt.value === values[0]);
      return option?.label ?? '1 selecionado';
    }
    return `${values.length} selecionados`;
  }, []);

  const categoriaDisplayFormatter = useCallback((values: (string | number)[], options: Array<{ value: string | number; label: string }>) => {
    if (!values.length) return 'Todas as classes';
    if (values.length === 1) return options.find(o => o.value === values[0])?.label ?? String(values[0]);
    return `${values.length} classes`;
  }, []);

  // Cálculo Global da Curva ABC (independente de filtros)
  const dadosEnriched = useMemo(() => {
    if (!dados.length) return [];

    // 1. Calcular valor mensal para todos
    const withValue = dados.map(item => ({
      ...item,
      valorMensal: item.consumo_mensal * (item.preco_custo || 0)
    }));

    // 2. Ordenar e calcular acumulado global
    const totalValor = withValue.reduce((acc, item) => acc + item.valorMensal, 0);
    if (totalValor === 0) {
      return withValue.map(item => ({ ...item, curvaABC: 'C' as const }));
    }

    const sorted = [...withValue].sort((a, b) => b.valorMensal - a.valorMensal);
    const abcMap = new Map<number, 'A' | 'B' | 'C'>();
    let acumulado = 0;

    for (const item of sorted) {
      acumulado += item.valorMensal;
      const percentual = acumulado / totalValor;
      if (percentual <= 0.8) abcMap.set(item.id_produto_tiny, 'A');
      else if (percentual <= 0.95) abcMap.set(item.id_produto_tiny, 'B');
      else abcMap.set(item.id_produto_tiny, 'C');
    }

    // Retorna na ordem original dos dados
    return withValue.map(item => ({
      ...item,
      curvaABC: abcMap.get(item.id_produto_tiny) ?? 'C'
    }));
  }, [dados]);

  const dadosFiltrados = useMemo(() => {
    const termos = produtoFiltro.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const fornecedorSet = new Set(fornecedoresSelecionados);
    const categoriaSet = new Set(categoriasSelecionadas); // Agora filtra por Classe ABC

    return dadosEnriched.filter((produto) => {
      // Busca Multi-termo (AND logic)
      if (termos.length > 0) {
        // Concatena todos os campos pesquisáveis em uma única string para facilitar a busca "cross-field"
        // Ex: código "123" e nome "Produto" -> "123 Produto" acharia "Produto 123"
        const searchableText = [
          produto.nome,
          produto.codigo,
          produto.gtin
        ].filter(Boolean).join(' ').toLowerCase();

        const matchesAllTerms = termos.every(term => searchableText.includes(term));
        if (!matchesAllTerms) return false;
      }

      if (fornecedorSet.size > 0) {
        const fornecedorKey = buildFornecedorKey(produto.fornecedor_nome);
        if (!fornecedorSet.has(fornecedorKey)) return false;
      }

      // Filtro de Classe ABC
      if (categoriaSet.size > 0) {
        if (!categoriaSet.has(produto.curvaABC)) return false;
      }

      return true;
    });
  }, [dadosEnriched, produtoFiltro, fornecedoresSelecionados, categoriasSelecionadas]);

  const derivados = useMemo<ProdutoDerivado[]>(() => {
    if (!dadosFiltrados.length) return [];

    return dadosFiltrados.map((p, index) => {
      // 1. Calcular sugestão baseada no targetDays
      const consumoDiario = p.consumo_mensal / 30;

      // Estoque pendente (dos pedidos salvos selecionados)
      const estoquePendente = estoquePendenteMap.get(Number(p.id_produto_tiny)) || 0;
      // Usar Nullish Coalescing (??) para que 0 seja considerado um valor válido de Lead Time
      // Se p.lead_time_dias for null/undefined, usamos o default.
      const isDefaultLeadTime = p.lead_time_dias === null || p.lead_time_dias === undefined;
      const leadTimeDias = p.lead_time_dias ?? DEFAULT_LEAD_TIME;
      const pontoMinimo = consumoDiario * leadTimeDias;

      const estoqueAtual = (p.saldo || 0) - (p.reservado || 0); // Disponível físico
      // OU p.disponivel (que já desconta reservado, checar consistência)
      // Vamos manter a lógica original de exibição/cálculo:

      // Cobertura atual em dias (baseia-se no estoque físico)
      const coberturaAtualDias = consumoDiario > 0 ? estoqueAtual / consumoDiario : 9999;
      // Cobertura Inteligente: Soma o Lead Time (dias de entrega) aos dias de cobertura desejados
      // Isso garante estoque suficiente até o próximo pedido CHEGAR.
      const targetEstoque = consumoDiario * (targetDays + leadTimeDias);
      const quantidadeNecessaria = Math.max(0, targetEstoque - estoqueAtual - estoquePendente);

      // Quantidade a comprar baseada na embalagem
      // Se não tem embalagem (ou é 0), assume unitário (1)
      const pack = p.embalagem_qtd || 1;
      const qtdSugestao = Math.ceil(quantidadeNecessaria / pack) * pack;

      // Calcular valor total da sugestão
      // const valorSugestao = qtdSugestao * (p.preco_custo || 0);

      // Quantidade Final (sugestão do sistema)
      const quantidadeFinal = qtdSugestao;

      const precisaRepor = coberturaAtualDias < targetDays;

      // Labels e status
      const necessarioLabel = Math.ceil(quantidadeNecessaria).toLocaleString('pt-BR');
      const alerta = p.alerta_embalagem;

      let statusCobertura = precisaRepor
        ? `Cobertura insuficiente — faltam ${necessarioLabel} unid. para ${targetDays} dias.`
        : 'Abaixo do lote, mas ainda dentro da cobertura — não comprar agora.';

      if (estoquePendente > 0) {
        statusCobertura += ` (${estoquePendente} unid. a receber)`;
      }

      const overrideValue = pedidoOverrides[p.id_produto_tiny];
      const quantidadeFinalAjustada = Number.isFinite(overrideValue)
        ? Math.max(0, Number(overrideValue))
        : quantidadeFinal;

      const diasAteRuptura = consumoDiario > 0 ? Math.floor(estoqueAtual / consumoDiario) : null;

      return {
        ...p,
        lead_time_dias: leadTimeDias,
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
        total_valor_calculado: quantidadeFinalAjustada * (p.preco_custo || 0),
        originalIndex: index,
        diasAteRuptura,
        // valorMensal já vem do enriched
        // curvaABC já vem do enriched
        // curvaABC já vem do enriched
        isDefaultLeadTime,
        estoquePendente,
      };
    });
  }, [dadosFiltrados, pedidoOverrides, targetDays, estoquePendenteMap]);

  const sortedProdutos = useMemo(() => {
    if (!sortConfig.length) return derivados;
    const cloned = [...derivados];

    const compareValues = (valueA: ProdutoDerivado[SortKey], valueB: ProdutoDerivado[SortKey], direction: SortDirection) => {
      const normalizedA = valueA ?? null;
      const normalizedB = valueB ?? null;

      if (normalizedA === null && normalizedB === null) return 0;
      if (normalizedA === null) return 1;
      if (normalizedB === null) return -1;

      const multiplier = direction === 'asc' ? 1 : -1;

      if (typeof normalizedA === 'number' && typeof normalizedB === 'number') {
        if (normalizedA === normalizedB) return 0;
        return (normalizedA - normalizedB) * multiplier;
      }

      const textA = String(normalizedA).toLowerCase();
      const textB = String(normalizedB).toLowerCase();
      if (textA === textB) return 0;
      return textA.localeCompare(textB) * multiplier;
    };

    cloned.sort((a, b) => {
      for (const { key, direction } of sortConfig) {
        const result = compareValues(a[key], b[key], direction);
        if (result !== 0) return result;
      }
      return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
    });

    return cloned;
  }, [derivados, sortConfig]);

  const filteredSortedProdutos = useMemo(() => {
    // 1. Filtragem por Seleção (checkbox)
    let base = sortedProdutos;
    if (selectionFilter !== 'all') {
      const predicate = selectionFilter === 'selected'
        ? (produto: ProdutoDerivado) => Boolean(selectedIds[produto.id_produto_tiny])
        : (produto: ProdutoDerivado) => !selectedIds[produto.id_produto_tiny];
      base = base.filter(predicate);
    }

    // 2. Filtragem por Alerta (Dashboard Alerts)
    if (alertFilterId) {
      base = base.filter((p) => {
        if (alertFilterId === 'a-critical') {
          return p.curvaABC === 'A' && p.diasAteRuptura !== null && p.diasAteRuptura <= 7;
        }
        if (alertFilterId === 'ruptura-iminente') {
          return p.diasAteRuptura !== null && p.diasAteRuptura <= 3 && p.curvaABC !== 'A';
        }
        if (alertFilterId === 'alerta-embalagem') {
          return p.alerta_embalagem;
        }
        return true;
      });
    }

    return base;
  }, [selectionFilter, selectedIds, sortedProdutos, alertFilterId]);

  const manualItemsFiltered = useMemo(() => {
    if (selectionFilter === 'all') return manualItems;
    return manualItems.filter((item) =>
      selectionFilter === 'selected' ? Boolean(selectedIds[item.id]) : !selectedIds[item.id]
    );
  }, [manualItems, selectedIds, selectionFilter]);

  // Handlers para itens manuais - Adicionar
  const handleAddManualItem = useCallback((item: Omit<ManualItem, 'id'>) => {
    const newId = Date.now(); // ID único baseado em timestamp
    const newItem: ManualItem = { ...item, id: newId };
    setManualItems((prev) => [...prev, newItem]);
    // Selecionar automaticamente o novo item
    setSelectedIds((prev) => ({ ...prev, [newId]: true }));
  }, []);

  // Handlers para itens manuais - Editar
  const handleEditManualItem = useCallback((id: number, updates: Partial<ManualItem>) => {
    setManualItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  // Handlers para itens manuais - Deletar
  const handleDeleteManualItem = useCallback((id: number) => {
    setManualItems((prev) => prev.filter((item) => item.id !== id));
    // Remover da seleção também
    setSelectedIds((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, []);

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

  const fetchEstoqueLive = useCallback(async (id_produto_tiny: number) => {
    setEstoqueLoading((prev) => ({ ...prev, [id_produto_tiny]: true }));
    try {
      // source=live garante que buscaremos o dado fresco no Tiny (prioridade máxima), ignorando cache recente
      const res = await fetch(`/api/tiny/produtos/${id_produto_tiny}/estoque?source=live`, {
        cache: 'no-store',
      });

      if (res.status === 429) {
        throw new Error('Muitas requisições (429). O Tiny limitou o acesso temporariamente.');
      }

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? 'Falha ao atualizar estoque');
      }
      const data = json.data ?? {};
      setEstoqueLive((prev) => ({
        ...prev,
        [id_produto_tiny]: {
          saldo: Number(data.saldo ?? 0),
          reservado: Number(data.reservado ?? 0),
          disponivel: Number(data.disponivel ?? 0),
          updatedAt: data.updatedAt ?? null,
          source: json.source ?? null,
        },
      }));
    } catch (error: any) {
      console.error('[Compras] Falha ao buscar estoque live', error);
      const isRateLimit = error?.message?.includes('429');
      toast({
        type: 'error',
        title: isRateLimit ? 'Muitas Requisições' : 'Erro ao Atualizar',
        message: isRateLimit
          ? 'Muitas tentativas seguidas. Aguarde alguns instantes.'
          : (error?.message ?? 'Não foi possível atualizar o estoque.'),
        duration: 5000,
      });
    } finally {
      setEstoqueLoading((prev) => ({ ...prev, [id_produto_tiny]: false }));
    }
  }, [toast]);

  const totalCompra = useMemo(
    () => derivados.reduce((acc, cur) => acc + (cur.sugestao_ajustada || 0), 0),
    [derivados]
  );

  const totalValorCompra = useMemo(
    () => derivados.reduce((acc, cur) => acc + (cur.total_valor_calculado || 0), 0),
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
    () => derivados.filter((p) => p.sugestao_ajustada > 0),
    [derivados]
  );

  const selectionCount = useMemo(() => {
    let count = 0;
    for (const produto of derivados) {
      if (selectedIds[produto.id_produto_tiny]) count++;
    }
    for (const item of manualItems) {
      if (selectedIds[item.id]) count++;
    }
    return count;
  }, [derivados, manualItems, selectedIds]);

  const selectionTotalQuantidade = useMemo(() => {
    let total = 0;
    for (const produto of derivados) {
      if (selectedIds[produto.id_produto_tiny]) {
        total += produto.sugestao_ajustada;
      }
    }
    for (const item of manualItems) {
      if (selectedIds[item.id]) {
        total += item.quantidade;
      }
    }
    return total;
  }, [derivados, manualItems, selectedIds]);

  const selectionTotalValor = useMemo(() => {
    let total = 0;
    for (const produto of derivados) {
      if (selectedIds[produto.id_produto_tiny]) {
        total += produto.total_valor_calculado || 0;
      }
    }
    return total;
  }, [derivados, selectedIds]);


  const highlightCards = useMemo(
    () => {
      const countRepor = derivados.filter((p) => p.precisaRepor).length;
      return [
        {
          id: 'repor',
          label: 'Precisa Repor',
          value: countRepor.toString(),
          helper: 'Produtos abaixo do ponto de reposição',
          tone: 'warning',
        },
        {
          id: 'sugerido',
          label: 'Sugeridos',
          value: produtosComPedido.length.toString(),
          helper: 'Produtos com sugestão > 0',
          tone: 'primary',
        },
        {
          id: 'financeiro',
          label: 'Investimento',
          value: totalValorCompra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }),
          helper: 'Valor estimado do pedido',
          tone: 'success',
        },
        {
          id: 'cobertura',
          label: 'Cobertura',
          value: `${targetDays}d`,
          helper: 'Meta de cobertura de dias',
          tone: 'neutral',
        },
      ] as StatCardProps[];
    },
    [derivados, produtosComPedido.length, targetDays, totalValorCompra]
  );

  const isValidManualEntry = useMemo(() => {
    const nomeValid = manualEntry.nome.trim().length >= 3;
    const qtd = Number(manualEntry.quantidade.replace(',', '.'));
    const qtdValid = Number.isFinite(qtd) && qtd > 0;
    return nomeValid && qtdValid;
  }, [manualEntry]);

  const historyDateFormatter = useMemo(
    () => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    []
  );

  const ultimaAtualizacao = useMemo(() => {
    if (!lastUpdatedAt) return '—';
    return historyDateFormatter.format(new Date(lastUpdatedAt));
  }, [lastUpdatedAt, historyDateFormatter]);

  const manualQuantidadeNumber = useMemo(() => {
    const parsed = Number(manualEntry.quantidade.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [manualEntry.quantidade]);

  const updateManualEntry = useCallback((key: keyof ManualEntry, value: string) => {
    setManualEntry((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleIncludeManualEntry = useCallback(() => {
    const trimmedNome = manualEntry.nome.trim();
    const trimmedFornecedor = manualEntry.fornecedor_codigo.trim();
    if (trimmedNome.length < 3) return;
    if (manualQuantidadeNumber <= 0) {
      toast({ type: 'error', message: 'Informe uma quantidade maior que zero para incluir o item manual.' });
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
    setSelectedIds((prev) => ({ ...prev, [newItem.id]: true }));
    setManualEntry(createManualEntry());
  }, [manualEntry, manualQuantidadeNumber]);

  const handleRemoveManualItem = useCallback((id: number) => {
    setManualItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleResetManualEntry = useCallback(() => {
    setManualEntry(createManualEntry());
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
          throw new Error('Não foi possível renomear o pedido.');
        }
        const payload = await response.json().catch(() => null);
        if (!payload?.order) throw new Error('Resposta inválida da API ao renomear o pedido.');
        const updatedOrder = normalizeSavedOrderRecord(payload.order as SavedOrder);
        setSavedOrders((prev) => prev.map((pedido) => (pedido.id === id ? updatedOrder : pedido)));
        toast({ type: 'success', message: 'Pedido renomeado com sucesso.' });
      } catch (error) {
        toast({ type: 'error', message: `Falha ao renomear o pedido: ${getErrorMessage(error) ?? 'erro inesperado'}` });
        setSavedOrders((prev) =>
          prev.map((pedido) => (pedido.id === id ? { ...pedido, name: fallbackName } : pedido))
        );
      }
    },
    []
  );

  const handleDeleteSavedOrder = useCallback(async (id: string) => {
    if (!window.confirm('Deseja remover este pedido salvo?')) return;
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
      if (!response.ok) throw new Error('Não foi possível excluir.');
      toast({ type: 'success', message: 'Pedido removido com sucesso.' });
    } catch (error) {
      toast({ type: 'error', message: `Falha ao remover o pedido: ${getErrorMessage(error) ?? 'erro inesperado'}` });
      if (removedOrder) {
        setSavedOrders((prev) => {
          const next = [...prev];
          const insertIndex = removedIndex < 0 ? 0 : Math.min(removedIndex, next.length);
          next.splice(insertIndex, 0, removedOrder as SavedOrder);
          return next;
        });
      }
    }
  }, []
  );

  const handleRenameSavedOrder = useCallback((id: string, value: string) => {
    setSavedOrders((prev) => prev.map((pedido) => (pedido.id === id ? { ...pedido, name: value } : pedido)));
  }, []);

  const handleRenameSavedOrderBlur = useCallback((id: string) => {
    const pedidoAtual = savedOrders.find((pedido) => pedido.id === id);
    if (!pedidoAtual) return;
    const fallbackName = pedidoAtual.name;
    const sanitized = pedidoAtual.name.trim() || buildDefaultOrderName(pedidoAtual.createdAt);
    if (sanitized !== pedidoAtual.name) {
      setSavedOrders((prev) => prev.map((pedido) => (pedido.id === id ? { ...pedido, name: sanitized } : pedido)));
    }
    void syncSavedOrderName(id, sanitized, fallbackName);
  }, [savedOrders, syncSavedOrderName]
  );

  const handleLoadSavedOrder = useCallback((pedido: SavedOrder) => {
    setActiveTab('current');
    const sanitizedName = pedido.name.trim() || buildDefaultOrderName(pedido.createdAt);
    setCurrentOrderName(sanitizedName);
    setPeriodDays(pedido.periodDays);
    setTargetDays(pedido.targetDays);
    const recreatedManualItems: ManualItem[] = pedido.manualItems.map((item) => {
      const nextId = manualItemIdRef.current--;
      return { ...item, id: nextId };
    });
    setManualItems(recreatedManualItems);
    setManualEntry(createManualEntry());
    setPedidoOverrides(() => {
      const next: Record<number, number> = {};
      pedido.produtos.forEach((produto) => { next[produto.id_produto_tiny] = produto.quantidade; });
      return next;
    });
    setSelectedIds(() => {
      const next: Record<number, boolean> = {};
      derivados.forEach((produto) => { next[produto.id_produto_tiny] = false; });
      pedido.produtos.forEach((produto) => { next[produto.id_produto_tiny] = true; });
      recreatedManualItems.forEach((item) => { next[item.id] = true; });
      return next;
    });
    setSelectionFilter('selected');
    setPedidoInputDrafts({});
  }, [derivados, setPeriodDays, setTargetDays]
  );

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
    return merged;
  }, [sanitizeEmbalagem, sanitizeFornecedor, sanitizeObservacao]
  );

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
  }, []
  );

  const scheduleAutoSave = useCallback((id: number, payload: AutoSavePayload) => {
    const fullPayload = buildAutoSavePayload(id, payload);
    if (fullPayload) pendingSavesRef.current[id] = fullPayload;
    if (saveTimersRef.current[id]) clearTimeout(saveTimersRef.current[id]);
    saveTimersRef.current[id] = setTimeout(() => { flushAutoSave(id); }, AUTO_SAVE_DEBOUNCE_MS);
    if (isMountedRef.current) setSyncStatus((prev) => ({ ...prev, [id]: 'saving' }));
  }, [buildAutoSavePayload, flushAutoSave]
  );

  const flushAllPendingSaves = useCallback(async (options?: { skipStatusUpdate?: boolean }) => {
    const pendingIds = Object.keys(pendingSavesRef.current).map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (!pendingIds.length) return;
    await Promise.all(pendingIds.map((id) => flushAutoSave(id, options)));
  }, [flushAutoSave]
  );

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

  const handleUpdateObservacao = useCallback((id: number, value: string) => {
    setDados((prev) => prev.map((x) => x.id_produto_tiny === id ? { ...x, observacao_compras: value } : x));
    scheduleAutoSave(id, { observacao_compras: sanitizeObservacao(value) });
  }, [scheduleAutoSave, sanitizeObservacao]);

  const handleUpdateFornecedor = useCallback((id: number, value: string) => {
    setDados((prev) => prev.map((x) => x.id_produto_tiny === id ? { ...x, fornecedor_codigo: value } : x));
    scheduleAutoSave(id, { fornecedor_codigo: sanitizeFornecedor(value) });
  }, [scheduleAutoSave, sanitizeFornecedor]);

  const handleUpdateEmbalagem = useCallback((id: number, value: number) => {
    setDados((prev) => prev.map((x) => x.id_produto_tiny === id ? { ...x, embalagem_qtd: value } : x));
    scheduleAutoSave(id, { embalagem_qtd: sanitizeEmbalagem(value) });
  }, [scheduleAutoSave, sanitizeEmbalagem]);

  const handleUpdateLeadTime = useCallback((id: number, value: number) => {
    const sanitized = Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
    setDados((prev) => prev.map((x) => x.id_produto_tiny === id ? { ...x, lead_time_dias: sanitized } : x));
    scheduleAutoSave(id, { lead_time_dias: sanitized });
  }, [scheduleAutoSave]);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const retryAutoSave = useCallback((id: number) => {
    const produto = dados.find((item) => item.id_produto_tiny === id);
    if (!produto) return;
    scheduleAutoSave(id, {
      fornecedor_codigo: sanitizeFornecedor(produto.fornecedor_codigo),
      embalagem_qtd: sanitizeEmbalagem(produto.embalagem_qtd),
      observacao_compras: sanitizeObservacao(produto.observacao_compras),
    });
  }, [dados, sanitizeEmbalagem, sanitizeFornecedor, sanitizeObservacao, scheduleAutoSave]
  );

  const buildSelectionSnapshot = useCallback(() => {
    const produtosSelecionados = derivados.filter((p) => selectedIds[p.id_produto_tiny]);
    const manuaisSelecionados = manualItems.filter((m) => selectedIds[m.id]);
    const validationErrors: string[] = [];
    const produtosSnapshot = produtosSelecionados.map((p) => {
      const code = (p.fornecedor_codigo ?? '').trim();
      if (!code && p.sugestao_ajustada > 0) validationErrors.push(`Produto "${p.nome}" (cód ${p.codigo || '?'}) sem código fornecedor`);
      return {
        id_produto_tiny: p.id_produto_tiny,
        nome: p.nome || '',
        codigo: p.codigo,
        gtin: p.gtin,
        fornecedor_codigo: code,
        quantidade: p.sugestao_ajustada,
        observacao: p.observacao_compras || '',
        embalagem_qtd: p.embalagem_qtd,
        preco_custo: p.preco_custo
      };
    });
    const manualSnapshot = manuaisSelecionados.map((m) => ({
      id: m.id, // negative ID
      nome: m.nome,
      fornecedor_codigo: m.fornecedor_codigo,
      quantidade: m.quantidade,
      observacao: m.observacao,
    }));
    return { produtosSnapshot, manualSnapshot, validationErrors };
  }, [derivados, manualItems, selectedIds]);

  const handleSaveCurrentOrder = useCallback(async () => {
    if (savingOrder) return;
    const { produtosSnapshot, manualSnapshot, validationErrors } = buildSelectionSnapshot();
    if (!produtosSnapshot.length && !manualSnapshot.length) {
      toast({ type: 'warning', message: 'Selecione pelo menos um item para salvar o pedido.' });
      return;
    }
    if (validationErrors.length) {
      toast({ type: 'error', title: 'Não é possível salvar', message: `Revise os campos pendentes: ${validationErrors[0]}...` });
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
        throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível salvar o pedido.');
      }
      const payload = await response.json().catch(() => null);
      if (!payload?.order) throw new Error('Resposta inválida da API ao salvar o pedido.');
      const savedOrder = normalizeSavedOrderRecord(payload.order as SavedOrder);
      setSavedOrders((prev) => [savedOrder, ...prev.filter((pedido) => pedido.id !== savedOrder.id)]);
      setActiveTab('history');
      toast({ type: 'success', title: 'Sucesso', message: 'Pedido salvo na nuvem.' });
    } catch (error) {
      toast({ type: 'error', message: `Não foi possível salvar o pedido na nuvem: ${getErrorMessage(error) ?? 'erro inesperado'}` });
    } finally {
      setSavingOrder(false);
    }
  }, [buildSelectionSnapshot, currentOrderName, flushAllPendingSaves, periodDays, savingOrder, targetDays, toast]);

  const gerarPdf = async () => {
    if (exportando) return;
    const { produtosSnapshot, manualSnapshot, validationErrors } = buildSelectionSnapshot();
    if (produtosSnapshot.length === 0 && manualSnapshot.length === 0) {
      toast({ type: 'warning', message: 'Selecione pelo menos um item para exportar.' });
      return;
    }
    if (validationErrors.length) {
      toast({ type: 'error', title: 'Impossível exportar', message: `Revise os campos pendentes: ${validationErrors[0]}...` });
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
      } catch { } // prossegue sem logo

      doc.setFontSize(16);
      doc.text('Pedido de Compras', 36, 18);
      doc.setFontSize(9);
      doc.setTextColor(90);
      doc.text(`Data do pedido: ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`, 36, 24);
      doc.text(`Qtd de itens: ${produtosSnapshot.length + manualSnapshot.length}`, 36, 29);
      doc.setTextColor(0);
      doc.setFontSize(11);
      doc.text(`Pedido: ${orderTitle}`, 36, 35);

      const rows = produtosSnapshot.map((p) => [
        p.fornecedor_codigo || '-',
        p.gtin || '-',
        p.nome || '',
        p.quantidade.toLocaleString('pt-BR'),
        (p.observacao || '').slice(0, 120),
      ]);
      manualSnapshot.forEach((item) => {
        rows.push([
          item.fornecedor_codigo.trim() || '-',
          '-',
          item.nome || 'Produto manual',
          item.quantidade.toLocaleString('pt-BR'),
          item.observacao.slice(0, 120) || '',
        ]);
      });
      autoTable(doc, {
        head: [['Código', 'EAN', 'Produto', 'Qtd Pedido', 'Observações']],
        body: rows,
        startY: 42,
        styles: { fontSize: 9, cellPadding: 4, fillColor: [249, 250, 251], textColor: [38, 38, 38], lineColor: [236, 239, 241], lineWidth: 0.2 },
        headStyles: { fillColor: [32, 51, 84], textColor: 255, lineWidth: 0 },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        theme: 'plain',
      });
      doc.save(`${toSafeFileName(orderTitle)}.pdf`);
      toast({ type: 'success', message: 'PDF gerado com sucesso!', duration: 5000 });
    } catch (error) {
      toast({ type: 'error', message: `Erro ao gerar PDF: ${getErrorMessage(error) ?? 'erro inesperado'}` });
    } finally {
      setExportando(false);
    }
  };

  useEffect(() => {
    abortRef.current = null;
    const saveTimers = saveTimersRef.current;
    const pendingSaves = pendingSavesRef.current;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
      Object.values(saveTimers).forEach(clearTimeout);
      const pendingIds = Object.keys(pendingSaves).map(Number).filter(Number.isFinite);
      pendingIds.forEach((id) => { void flushAutoSave(id, { skipStatusUpdate: true }); });
    };
  }, [flushAutoSave]);

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] space-y-3">
      {/* Header compacto */}
      <section className="rounded-[28px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Título e status */}
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Central de Compras</h1>
            {/* Badge de Estado do Pedido */}
            {(Object.keys(pedidoOverrides).length > 0 || manualItems.length > 0 || Object.keys(selectedIds).length > 0) ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Rascunho em andamento
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Novo Pedido
              </span>
            )}
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {ultimaAtualizacao}
              </span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span>{derivados.length} produtos</span>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2">
            <button onClick={handleNewOrder} className="app-btn-primary" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Novo Pedido
            </button>
            <button onClick={handleSaveCurrentOrder} className="app-btn-primary" disabled={savingOrder}>
              {savingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
            <button onClick={gerarPdf} className="app-btn-primary" disabled={exportando}>
              {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              PDF
            </button>
          </div>
        </div>

        {/* Stats inline */}
        <div className="flex flex-wrap items-center gap-6 mt-3 pt-3 border-t border-white/30 dark:border-white/5">
          {highlightCards.map((card) => (
            <div key={card.id} className="flex items-center gap-2">
              <span className={`text-lg font-bold ${card.tone === 'success' ? 'text-[var(--color-success)] dark:text-[var(--color-success-light)]' :
                card.tone === 'warning' ? 'text-[var(--color-warning)] dark:text-[var(--color-warning-light)]' :
                  card.tone === 'primary' ? 'text-[var(--color-primary)] dark:text-[var(--color-primary-light)]' :
                    'text-[var(--color-neutral-700)] dark:text-[var(--color-neutral-200)]'
                }`}>{card.value}</span>
              <span className="text-xs text-[var(--color-neutral-500)]">{card.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Tabs principais */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setActiveTab('current')}
          className={`app-tab px-5 py-2.5 ${activeTab === 'current' ? 'active' : ''} flex items-center gap-2`}
        >
          Pedido
          {(Object.keys(pedidoOverrides).length > 0 || manualItems.length > 0 || Object.keys(selectedIds).length > 0) && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Rascunho em andamento (alterações não salvas)" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`app-tab px-5 py-2.5 ${activeTab === 'history' ? 'active' : ''}`}
        >
          <History className="w-4 h-4" />
          Histórico {savedOrders.length > 0 && `(${savedOrders.length})`}
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`app-tab px-5 py-2.5 ${activeTab === 'suppliers' ? 'active' : ''}`}
        >
          Por Fornecedor {selectionCount > 0 && `(${selectionCount})`}
        </button>
      </div>

      {/* Conteúdo da aba ativa */}
      {activeTab === 'current' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Toolbar de Controle Unificada */}
            <div className="flex flex-col gap-3 shrink-0 mb-3">
              <div className="relative z-[60] flex flex-wrap items-end gap-4 p-4 rounded-[24px] bg-white/40 dark:bg-white/5 border border-white/20 dark:border-white/5 shadow-sm backdrop-blur-md">

                {/* 1. Identificação */}
                <div className="w-full sm:w-[220px] shrink-0">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 ml-1 block">Pedido</label>
                  <input
                    className="app-input w-full h-10 text-sm font-medium"
                    value={currentOrderName}
                    onChange={(event) => setCurrentOrderName(event.target.value)}
                    placeholder="Nome do pedido..."
                  />
                </div>

                <div className="hidden sm:block w-px h-10 bg-white/30 dark:bg-white/10 self-end mb-0.5" />

                {/* 2. Parâmetros (Agrupados) */}
                <div className="flex items-end gap-3">
                  <div className="w-[88px]">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 ml-1 block text-center">Dias Venda</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={15}
                        max={180}
                        className="app-input w-full h-10 text-sm text-center font-semibold"
                        value={periodDays}
                        onChange={(e) => handlePeriodInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="w-[100px]">
                    <div className="flex items-center justify-between mb-1.5 ml-1 mr-1">
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">Cobertura</label>
                      <span className="text-[9px] text-[var(--color-primary)] font-medium">
                        {new Date(new Date().setDate(new Date().getDate() + targetDays)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        min={15}
                        max={180}
                        className="app-input w-full h-10 text-sm text-center font-semibold pr-10"
                        value={targetDays}
                        onChange={(e) => handleCoverageInput(e.target.value)}
                      />
                      <div className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center pointer-events-auto z-[60]">
                        <AppDatePicker
                          align="right"
                          date={new Date(new Date().setDate(new Date().getDate() + targetDays))}
                          onSelect={(date) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const target = new Date(date);
                            target.setHours(0, 0, 0, 0);
                            const diffTime = target.getTime() - today.getTime();
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            if (diffDays >= 1) {
                              const clamped = Math.max(diffDays, 1);
                              setTargetDays(clamped);
                            }
                          }}
                          minDate={new Date()}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden lg:block w-px h-10 bg-white/30 dark:bg-white/10 self-end mb-0.5" />

                {/* 3. Filtros de Pesquisa (Expandem para ocupar espaço restante) */}
                <div className="flex-1 flex items-end gap-3 min-w-[300px]">
                  {/* Busca */}
                  <div className="flex-1 relative">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 ml-1 block">Busca</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        id="search-input"
                        type="text"
                        className="w-full pl-10 pr-4 py-2 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                        value={produtoFiltro}
                        onChange={(e) => setProdutoFiltro(e.target.value)}
                        placeholder="Buscar produto (nome, SKU, GTIN)..."
                      />
                    </div>
                  </div>

                  {/* Categoria (Classe ABC) */}
                  <div className="w-[200px]">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 ml-1 block">Classe ABC</label>
                    <div className="h-10">
                      <MultiSelectDropdown
                        label="Classe ABC"
                        options={categoriaOptions}
                        selected={categoriasSelecionadas}
                        onChange={(values) => setCategoriasSelecionadas(values.map(String))}
                        onClear={() => setCategoriasSelecionadas([])}
                        displayFormatter={categoriaDisplayFormatter}
                        showLabel={false}
                      />
                    </div>
                  </div>

                  {/* Fornecedor */}
                  <div className="w-[280px]">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 ml-1 block">Fornecedor</label>
                    <div className="h-10">
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
              </div>

              {/* Linha Secundária: Alertas, Totais e View Mode */}
              <div className="flex flex-wrap items-start justify-between gap-4 px-2">
                <div className="flex-1 min-w-[300px]">
                  <AlertsPanel
                    produtos={derivados}
                    activeFilterId={alertFilterId}
                    onSelectFilter={setAlertFilterId}
                  />
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {/* Card de Totais Compacto */}
                  <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-white/60 dark:bg-white/5 border border-white/20">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Qtd</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white leading-none">{totalCompra.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-300 dark:bg-white/10" />
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-semibold uppercase">Total</span>
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 leading-none">{totalValorCompra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                  </div>

                  {/* Botões View Mode */}
                  <div className="flex p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-lg border border-white/10">
                    <button
                      onClick={() => setSelectionFilter('all')}
                      className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${selectionFilter === 'all'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setSelectionFilter('selected')}
                      className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${selectionFilter === 'selected'
                        ? 'bg-white dark:bg-slate-600 text-violet-600 dark:text-violet-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                      Sel.
                    </button>
                    <button
                      onClick={() => setSelectionFilter('unselected')}
                      className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${selectionFilter === 'unselected'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                      Não Sel.
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/50 dark:border-white/10 relative flex-1 min-h-0">
              <div className="h-full absolute inset-0 overflow-auto">
                <ProductTable
                  products={filteredSortedProdutos}
                  manualItems={manualItemsFiltered}
                  selectedIds={selectedIds}
                  onToggleSelection={toggleSelection}
                  estoqueLive={estoqueLive}
                  estoqueLoading={estoqueLoading}
                  onRefreshEstoque={fetchEstoqueLive}
                  pedidoOverrides={pedidoOverrides}
                  pedidoInputDrafts={pedidoInputDrafts}
                  onPedidoChange={handlePedidoInputChange}
                  onPedidoBlur={handlePedidoInputBlur}
                  onUpdateObservacao={handleUpdateObservacao}
                  onUpdateFornecedor={handleUpdateFornecedor}
                  onUpdateEmbalagem={handleUpdateEmbalagem}
                  onUpdateLeadTime={handleUpdateLeadTime}
                  syncStatus={syncStatus}
                  onRetrySave={retryAutoSave}
                  sortConfig={sortConfig}
                  onToggleSort={toggleSort}
                  formatFornecedorNome={formatFornecedorNome}
                  sanitizeFornecedor={sanitizeFornecedor}
                  sanitizeEmbalagem={sanitizeEmbalagem}
                  sanitizeObservacao={sanitizeObservacao}
                  onAddManualItem={handleAddManualItem}
                  onEditManualItem={handleEditManualItem}
                  onDeleteManualItem={handleDeleteManualItem}
                />
              </div>
            </div>
            {/* Toolbar inferior fixa - Sempre visível no final */}
            <div className="flex items-center justify-between gap-4 p-3 mt-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl shrink-0">
              {/* Input inline para item manual (minimalista) - ESQUERDA */}
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <input
                  type="text"
                  value={manualEntry.nome}
                  onChange={(e) => setManualEntry(prev => ({ ...prev, nome: e.target.value }))}
                  className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/20 placeholder:text-amber-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  placeholder="Produto não cadastrado..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualEntry.nome.trim() && manualEntry.quantidade) {
                      handleAddManualItem({
                        nome: manualEntry.nome.trim(),
                        fornecedor_codigo: manualEntry.fornecedor_codigo.trim(),
                        quantidade: parseInt(manualEntry.quantidade, 10),
                        observacao: '',
                      });
                      setManualEntry(createManualEntry());
                    }
                  }}
                />
                <input
                  type="text"
                  value={manualEntry.fornecedor_codigo}
                  onChange={(e) => setManualEntry(prev => ({ ...prev, fornecedor_codigo: e.target.value }))}
                  className="w-16 px-2 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/20 placeholder:text-amber-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  placeholder="Cód."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualEntry.nome.trim() && manualEntry.quantidade) {
                      handleAddManualItem({
                        nome: manualEntry.nome.trim(),
                        fornecedor_codigo: manualEntry.fornecedor_codigo.trim(),
                        quantidade: parseInt(manualEntry.quantidade, 10),
                        observacao: '',
                      });
                      setManualEntry(createManualEntry());
                    }
                  }}
                />
                <input
                  type="number"
                  value={manualEntry.quantidade}
                  onChange={(e) => setManualEntry(prev => ({ ...prev, quantidade: e.target.value }))}
                  className="w-14 px-2 py-1.5 text-xs text-right rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/20 placeholder:text-amber-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  placeholder="Qtd"
                  min="1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualEntry.nome.trim() && manualEntry.quantidade) {
                      handleAddManualItem({
                        nome: manualEntry.nome.trim(),
                        fornecedor_codigo: manualEntry.fornecedor_codigo.trim(),
                        quantidade: parseInt(manualEntry.quantidade, 10),
                        observacao: '',
                      });
                      setManualEntry(createManualEntry());
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!manualEntry.nome.trim() || !manualEntry.quantidade || parseInt(manualEntry.quantidade, 10) <= 0) return;
                    handleAddManualItem({
                      nome: manualEntry.nome.trim(),
                      fornecedor_codigo: manualEntry.fornecedor_codigo.trim(),
                      quantidade: parseInt(manualEntry.quantidade, 10),
                      observacao: '',
                    });
                    setManualEntry(createManualEntry());
                  }}
                  disabled={!manualEntry.nome.trim() || !manualEntry.quantidade || parseInt(manualEntry.quantidade, 10) <= 0}
                  className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white transition-colors shadow-sm"
                  title="Adicionar item manual"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Info de seleção e Ações - DIREITA */}
              <div className="flex items-center gap-4">
                <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-medium">
                  {selectionCount} sel. · {selectionTotalQuantidade.toLocaleString('pt-BR')} un.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium transition-colors"
                    onClick={() => setSelectedIds({})}
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-xs font-medium transition-colors"
                    onClick={() => {
                      const suggestionsToSelect = filteredSortedProdutos
                        .filter(d => d.sugestao_ajustada > 0)
                        .map(d => d.id_produto_tiny);
                      if (suggestionsToSelect.length > 0) {
                        setSelectedIds(suggestionsToSelect.reduce((acc, id) => ({ ...acc, [id]: true }), {}));
                      }
                    }}
                  >
                    Sel. c/ ped.
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 h-full overflow-auto">
            <OrderHistoryTab
              savedOrders={savedOrders}
              syncing={savedOrdersSyncing}
              syncError={savedOrdersSyncError}
              onRefresh={fetchSavedOrdersFromApi}
              onLoad={handleLoadSavedOrder}
              onDelete={handleDeleteSavedOrder}
              onRename={handleRenameSavedOrder}
              onRenameBlur={handleRenameSavedOrderBlur}
              selectedPendingOrderIds={selectedPendingOrderIds}
              onTogglePendingOrder={togglePendingOrder}
            />
          </div>
        </div>
      )}

      {activeTab === 'suppliers' && (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 h-full overflow-auto">
            <SupplierGroupView
              produtos={derivados}
              manualItems={manualItemsFiltered}
              selectedIds={selectedIds}
              formatFornecedorNome={formatFornecedorNome}
            />
          </div>
        </div>
      )}

      {activeTab === 'current' && (
        <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40">
          <div className="rounded-[28px] border border-white/20 bg-white/60 dark:bg-slate-900/40 dark:border-white/6 backdrop-blur-sm shadow-md p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              {selectionCount} item{selectionCount === 1 ? '' : 's'} selecionado{selectionCount === 1 ? '' : 's'} · {selectionTotalQuantidade.toLocaleString('pt-BR')} unid.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={handleSaveCurrentOrder} className="app-btn-primary w-full justify-center gap-2" disabled={savingOrder}>
                {savingOrder ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Pedido ({Object.keys(pedidoOverrides).length})
                  </>
                )}
              </button>
              <button type="button" onClick={gerarPdf} className="app-btn-primary w-full justify-center gap-2" disabled={exportando}>
                {exportando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    Exportar PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra fixa de totais */}
      <StickyTotalsBar
        selectedCount={selectionCount}
        totalQuantidade={selectionTotalQuantidade}
        totalValor={selectionTotalValor}
      />
    </div>
  );
}

