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
} from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { formatFornecedorNome } from '@/lib/fornecedorFormatter';

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

const COMPRAS_RECALC_DEBOUNCE_MS = 350;
const AUTO_SAVE_DEBOUNCE_MS = 800;
const COMPRAS_SELECTION_STORAGE_KEY = 'compras_selection_v1';
const DAYS_PER_MONTH = 30;
const DEFAULT_COBERTURA_DIAS = 15;
const MIN_COBERTURA_DIAS = 15;
const MAX_COBERTURA_DIAS = 180;
const COVERAGE_STEP_DIAS = 5;
const SEM_FORNECEDOR_KEY = '__SEM_FORNECEDOR__';
const MANUAL_ENTRY_ID = -1;

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

export default function ComprasClient() {
  const [periodDays, setPeriodDays] = useState(60);
  const [targetDays, setTargetDays] = useState(DEFAULT_COBERTURA_DIAS);
  const [dados, setDados] = useState<Sugestao[]>([]);
  const [produtoFiltro, setProdutoFiltro] = useState('');
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<string[]>([]);
  const [manualEntry, setManualEntry] = useState<ManualEntry>(() => createManualEntry());
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
  const abortRef = useRef<AbortController | null>(null);
  const pendingSavesRef = useRef<Record<number, AutoSavePayload>>({});
  const saveTimersRef = useRef<Record<number, NodeJS.Timeout>>({});
  const selectionLoadedRef = useRef(false);

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

  const selectionTotalQuantidade = useMemo(
    () => {
      const produtosTotal = derivados.reduce((acc, produto) => {
        return selectedIds[produto.id_produto_tiny] ? acc + (produto.sugestao_ajustada || 0) : acc;
      }, 0);
      const manualTotal = selectedIds[MANUAL_ENTRY_ID] ? manualQuantidadeNumber : 0;
      return produtosTotal + manualTotal;
    },
    [derivados, manualQuantidadeNumber, selectedIds]
  );

  const isManualSelected = Boolean(selectedIds[MANUAL_ENTRY_ID]);
  const manualRowMatchesFilter =
    selectionFilter === 'all' ||
    (selectionFilter === 'selected' && isManualSelected) ||
    (selectionFilter === 'unselected' && !isManualSelected);

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
    setSelectedIds((prev) => ({
      ...prev,
      [MANUAL_ENTRY_ID]: true,
    }));
  }, []);

  const handleResetManualEntry = useCallback(() => {
    setManualEntry(createManualEntry());
    setSelectedIds((prev) => {
      if (prev[MANUAL_ENTRY_ID] == null) return prev;
      const next = { ...prev };
      delete next[MANUAL_ENTRY_ID];
      return next;
    });
  }, []);

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
    async (id: number) => {
      if (saveTimersRef.current[id]) {
        clearTimeout(saveTimersRef.current[id]);
        delete saveTimersRef.current[id];
      }
      const payload = pendingSavesRef.current[id];
      if (!payload) {
        setSyncStatus((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        return;
      }
      delete pendingSavesRef.current[id];
      try {
        setSyncStatus((prev) => ({ ...prev, [id]: 'saving' }));
        const res = await fetch('/api/compras/produto', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_produto_tiny: id, ...payload }),
        });
        if (!res.ok) throw new Error('Erro ao salvar');
        setSyncStatus((prev) => ({ ...prev, [id]: 'saved' }));
        setTimeout(() => {
          setSyncStatus((prev) => {
            if (prev[id] !== 'saved') return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 2500);
      } catch (error) {
        console.error('[Compras] auto-save error', error);
        setSyncStatus((prev) => ({ ...prev, [id]: 'error' }));
        pendingSavesRef.current[id] = { ...payload };
      }
    },
    [setSyncStatus]
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
      setSyncStatus((prev) => ({ ...prev, [id]: 'saving' }));
    },
    [flushAutoSave]
  );

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
    const selecionados = derivados.filter((item) => selectedIds[item.id_produto_tiny]);
    if (derivados.length === 0) {
      alert('Nenhum item disponível para exportar.');
      return;
    }
    if (selecionados.length === 0) {
      alert('Selecione pelo menos um item para exportar.');
      return;
    }
    const formatProdutoLabel = (produto: ProdutoDerivado) => {
      const nome = produto.nome?.trim();
      if (nome) return nome;
      const codigo = produto.codigo?.trim();
      if (codigo) return codigo;
      return `Produto ID ${produto.id_produto_tiny}`;
    };
    const itensInvalidos: string[] = [];
    selecionados.forEach((produto) => {
      const missing: string[] = [];
      if (!(produto.fornecedor_codigo && produto.fornecedor_codigo.trim())) {
        missing.push('código do fornecedor');
      }
      if (!(Number.isFinite(produto.sugestao_ajustada) && produto.sugestao_ajustada > 0)) {
        missing.push('quantidade');
      }
      if (missing.length) {
        itensInvalidos.push(`${formatProdutoLabel(produto)} (${missing.join(' e ')})`);
      }
    });
    if (selectedIds[MANUAL_ENTRY_ID]) {
      const manualMissing: string[] = [];
      if (!manualEntry.fornecedor_codigo.trim()) {
        manualMissing.push('código do fornecedor');
      }
      if (manualQuantidadeNumber <= 0) {
        manualMissing.push('quantidade');
      }
      if (manualMissing.length) {
        itensInvalidos.push(`Linha manual (${manualMissing.join(' e ')})`);
      }
    }
    if (itensInvalidos.length) {
      alert(
        `Não é possível gerar o PDF com itens pendentes. Preencha o código do fornecedor e a quantidade final:\n- ${
          itensInvalidos.join('\n- ')
        }`
      );
      return;
    }
    setExportando(true);
    try {
      const pendingIds = Object.keys(pendingSavesRef.current)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
      if (pendingIds.length) {
        await Promise.all(pendingIds.map((id) => flushAutoSave(id)));
      }
      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new JsPDF();
      try {
        const logoResp = await fetch('/favicon.png');
        const blob = await logoResp.blob();
        const reader = new FileReader();
        const dataUrl: string = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        doc.addImage(dataUrl, 'PNG', 12, 12, 14, 14);
      } catch {
        // prossegue sem logo
      }

      doc.setFontSize(14);
      doc.text('Sugestão de Compras - Ambienta', 30, 20);
      doc.setFontSize(9);
      doc.text(`Período: últimos ${periodDays} dias · Cobertura: ${coberturaDias} dias`, 30, 26);

      const rows = selecionados.map((p) => {
        const fornecedorFormatado = formatFornecedorNome(p.fornecedor_nome);
        const fornecedorDisplay = fornecedorFormatado
          ? `${fornecedorFormatado}${p.fornecedor_codigo ? ` (${p.fornecedor_codigo})` : ''}`
          : p.fornecedor_codigo || '-';
        return [
          fornecedorDisplay,
        p.gtin || '-',
        p.nome || '',
        p.sugestao_ajustada.toLocaleString('pt-BR'),
        (p.observacao_compras || '').slice(0, 120),
        ];
      });

      if (selectedIds[MANUAL_ENTRY_ID] && manualQuantidadeNumber > 0) {
        const fornecedorManual = (() => {
          const codigo = manualEntry.fornecedor_codigo.trim();
          if (codigo) return codigo;
          const nome = manualEntry.nome.trim();
          if (nome) return nome;
          return '-';
        })();
        const nomeManual = manualEntry.nome.trim() || 'Produto manual';
        rows.push([
          fornecedorManual,
          '-',
          nomeManual,
          manualQuantidadeNumber.toLocaleString('pt-BR'),
          manualEntry.observacao.slice(0, 120) || '',
        ]);
      }

      autoTable(doc, {
        head: [['Fornecedor (Tiny)', 'EAN', 'Produto', 'Qtd Pedido', 'Observações']],
        body: rows,
        startY: 32,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [0, 157, 168] },
        theme: 'grid',
      });

      doc.save('sugestao-compras.pdf');
    } catch (error) {
      alert(`Erro ao gerar PDF: ${getErrorMessage(error) ?? 'erro inesperado'}`);
    } finally {
      setExportando(false);
    }
  };

  useEffect(() => {
    abortRef.current = null;
    const timersMap = saveTimersRef.current;
    return () => {
      abortRef.current?.abort();
      Object.values(timersMap).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
    };
  }, []);

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
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[36px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-6 sm:p-8 space-y-8 min-w-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2 max-w-3xl">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Compras inteligentes</p>
              <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white">Sugestão de compras</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Acompanhe consumo real, ajuste a cobertura e gere pedidos já alinhados com os múltiplos de embalagem
                usados pelos fornecedores.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
          </div>

          <div className="grid gap-4 md:grid-cols-3">
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
            <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Total sugerido</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-white">
                {totalCompra.toLocaleString('pt-BR')} unid.
              </p>
              <p className="text-xs text-slate-500">Ajustado pelo lote informado</p>
              <p className="text-xs text-slate-400">Última atualização {ultimaAtualizacao}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {highlightCards.map((card) => (
              <StatCard key={card.id} {...card} />
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Filtro de produto</p>
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
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Filtro de fornecedor</p>
              <p className="text-xs text-slate-500">Selecione um ou mais fornecedores (inclui “Sem fornecedor”)</p>
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
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-white/40 dark:border-white/10 px-6 py-4">
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
                    if (manualQuantidadeNumber > 0) {
                      next[MANUAL_ENTRY_ID] = true;
                    }
                    return next;
                  });
                }}
              >
                Selecionar itens com pedido
              </button>
            </div>
          </div>
        </header>
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
              {manualRowMatchesFilter && (
                <tr key="manual-entry" className="align-top bg-white/40 dark:bg-white/5">
                  <td className="px-4 py-3 align-middle text-center">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={Boolean(selectedIds[MANUAL_ENTRY_ID])}
                      className={`app-checkbox ${selectedIds[MANUAL_ENTRY_ID] ? 'checked' : ''}`}
                      onClick={() =>
                        setSelectedIds((prev) => ({
                          ...prev,
                          [MANUAL_ENTRY_ID]: !prev[MANUAL_ENTRY_ID],
                        }))
                      }
                    >
                      <span aria-hidden className="app-checkbox-indicator" />
                      <span className="sr-only">Selecionar item manual</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 w-[740px]">
                    <input
                      className="app-input"
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
                          selectedIds[MANUAL_ENTRY_ID]
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400 opacity-80'
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
              )}
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
      </section>
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
