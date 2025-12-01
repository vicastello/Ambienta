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

type SortDirection = 'asc' | 'desc' | null;
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

type ProdutoDerivado = Sugestao & { originalIndex: number };

const COMPRAS_RECALC_DEBOUNCE_MS = 350;
const AUTO_SAVE_DEBOUNCE_MS = 800;
const COMPRAS_SELECTION_STORAGE_KEY = 'compras_selection_v1';
const DAYS_PER_MONTH = 30;
const DEFAULT_COBERTURA_DIAS = 15;
const MIN_COBERTURA_DIAS = 15;
const MAX_COBERTURA_DIAS = 180;
const COVERAGE_STEP_DIAS = 5;

export default function ComprasClient() {
  const [periodDays, setPeriodDays] = useState(60);
  const [targetDays, setTargetDays] = useState(DEFAULT_COBERTURA_DIAS);
  const [dados, setDados] = useState<Sugestao[]>([]);
  const [fornecedorFiltro, setFornecedorFiltro] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{ key: SortKey | null; direction: SortDirection }>({
    key: null,
    direction: null,
  });
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

  const dadosFiltrados = useMemo(() => {
    const termo = fornecedorFiltro.trim().toLowerCase();
    if (!termo) return dados;
    return dados.filter((produto) => {
      const codigo = produto.fornecedor_codigo?.toLowerCase() ?? '';
      const nome = produto.fornecedor_nome?.toLowerCase() ?? '';
      return codigo.includes(termo) || nome.includes(termo);
    });
  }, [dados, fornecedorFiltro]);

  const derivados = useMemo<ProdutoDerivado[]>(() => {
    return dadosFiltrados.map((p, index) => {
      const pack = Math.max(p.embalagem_qtd || 1, 1);
      const sugestaoAjustada = p.sugestao_base > 0 ? Math.ceil(p.sugestao_base / pack) * pack : 0;
      const alerta = p.sugestao_base > 0 && p.sugestao_base < pack;
      return {
        ...p,
        embalagem_qtd: pack,
        sugestao_ajustada: sugestaoAjustada,
        alerta_embalagem: alerta,
        originalIndex: index,
      };
    });
  }, [dadosFiltrados]);

  const sortedProdutos = useMemo(() => {
    const { key: activeKey, direction } = sortConfig;
    if (!activeKey || !direction) return derivados;
    const cloned = [...derivados];
    const directionMultiplier = direction === 'asc' ? 1 : -1;

    cloned.sort((a, b) => {
      const valueA = a[activeKey];
      const valueB = b[activeKey];

      const normalizedA = valueA ?? null;
      const normalizedB = valueB ?? null;

      if (normalizedA === null && normalizedB === null) {
        return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
      }
      if (normalizedA === null) return 1;
      if (normalizedB === null) return -1;

      if (typeof normalizedA === 'number' && typeof normalizedB === 'number') {
        if (normalizedA === normalizedB) {
          return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
        }
        return (normalizedA - normalizedB) * directionMultiplier;
      }

      const textA = String(normalizedA).toLowerCase();
      const textB = String(normalizedB).toLowerCase();
      if (textA === textB) {
        return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
      }
      return textA.localeCompare(textB) * directionMultiplier;
    });

    return cloned;
  }, [derivados, sortConfig]);

  const toggleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key !== key) {
        return { key, direction: 'desc' };
      }
      if (prev.direction === 'desc') {
        return { key, direction: 'asc' };
      }
      return { key: null, direction: null };
    });
  };

  const getAriaSort = (key: SortKey): 'none' | 'ascending' | 'descending' => {
    if (sortConfig.key !== key || !sortConfig.direction) return 'none';
    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  const renderSortIcon = (key: SortKey) => {
    const isActive = sortConfig.key === key && Boolean(sortConfig.direction);
    const baseClass = `w-3.5 h-3.5 ${isActive ? 'text-[var(--accent)]' : 'opacity-40'}`;
    if (!isActive) {
      return <ChevronsUpDown className={baseClass} aria-hidden />;
    }
    if (sortConfig.direction === 'desc') {
      return <ChevronDown className={baseClass} aria-hidden />;
    }
    return <ChevronUp className={baseClass} aria-hidden />;
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
    () => derivados.filter((p) => p.sugestao_ajustada > 0).length,
    [derivados]
  );

  const produtosComAlerta = useMemo(
    () => derivados.filter((p) => p.alerta_embalagem).length,
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

  const selectionTotalQuantidade = useMemo(
    () =>
      derivados.reduce((acc, produto) => {
        return selectedIds[produto.id_produto_tiny] ? acc + (produto.sugestao_ajustada || 0) : acc;
      }, 0),
    [derivados, selectedIds]
  );

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
        helper: 'Itens com sugestão acima de zero',
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

      const rows = selecionados.map((p) => [
        p.fornecedor_nome
          ? `${p.fornecedor_nome}${p.fornecedor_codigo ? ` (${p.fornecedor_codigo})` : ''}`
          : p.fornecedor_codigo || '-',
        p.gtin || '-',
        p.nome || '',
        p.sugestao_ajustada.toLocaleString('pt-BR'),
        (p.observacao_compras || '').slice(0, 120),
      ]);

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
    if (!dados.length) return;
    setSelectedIds((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const produto of dados) {
        if (next[produto.id_produto_tiny] == null) {
          next[produto.id_produto_tiny] = produto.sugestao_ajustada > 0;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dados]);

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

          <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-5 grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)] items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Filtro de fornecedor</p>
              <p className="text-xs text-slate-500">Filtra por nome ou código retornado pelo Tiny</p>
            </div>
            <input
              className="app-input"
              placeholder="Ex: Rainha ou 1234"
              value={fornecedorFiltro}
              onChange={(e) => setFornecedorFiltro(e.target.value)}
            />
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
            <button
              type="button"
              className="app-btn-primary min-w-[200px] justify-center self-end"
              onClick={() => {
                setSelectedIds((prev) => {
                  const next = { ...prev };
                  derivados.forEach((produto) => {
                    if (produto.sugestao_ajustada > 0) {
                      next[produto.id_produto_tiny] = true;
                    }
                  });
                  return next;
                });
              }}
            >
              Selecionar itens com pedido
            </button>
          </div>
        </header>
        <div className="overflow-auto scrollbar-hide">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="app-table-header text-[11px] uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">
                  <span className="sr-only">Selecionar</span>
                </th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('nome')}>{renderSortableHeader('Produto', 'nome')}</th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('codigo')}>{renderSortableHeader('SKU', 'codigo')}</th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('fornecedor_codigo')}>
                  {renderSortableHeader('Código fornecedor', 'fornecedor_codigo')}
                </th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('embalagem_qtd')}>
                  {renderSortableHeader('Emb.', 'embalagem_qtd')}
                </th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('disponivel')}>
                  {renderSortableHeader('Estoque disp.', 'disponivel')}
                </th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('consumo_periodo')}>
                  {renderSortableHeader('Consumo período', 'consumo_periodo')}
                </th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('consumo_mensal')}>
                  {renderSortableHeader('Consumo mensal', 'consumo_mensal')}
                </th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('sugestao_base')}>
                  {renderSortableHeader('Sugestão base', 'sugestao_base')}
                </th>
                <th className="px-4 py-3 text-left" aria-sort={getAriaSort('sugestao_ajustada')}>
                  {renderSortableHeader('Pedido (ajust.)', 'sugestao_ajustada')}
                </th>
                <th className="px-4 py-3 text-left">Observações (PDF)</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/30 dark:divide-white/5">
              {sortedProdutos.map((p) => (
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
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.codigo || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 w-48">
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
                        className={`text-[10px] leading-tight truncate ${p.fornecedor_nome ? 'text-slate-500' : 'text-slate-400 italic'}`}
                        title={p.fornecedor_nome || undefined}
                      >
                        {p.fornecedor_nome ? p.fornecedor_nome : 'Nome não cadastrado no Tiny'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    <div className="text-slate-900 dark:text-white font-semibold">{p.disponivel.toLocaleString('pt-BR')}</div>
                    <div className="text-[11px] text-slate-500">Saldo {p.saldo ?? 0} · Reservado {p.reservado ?? 0}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-white">{p.consumo_periodo.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-white">{p.consumo_mensal.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{p.sugestao_base.toFixed(1)}</div>
                    {p.alerta_embalagem && (
                      <div className="text-[11px] text-amber-600">Abaixo do lote ({p.embalagem_qtd})</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{p.sugestao_ajustada.toLocaleString('pt-BR')}</div>
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
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
              ))}
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
