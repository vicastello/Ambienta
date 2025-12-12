"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, Box, Check, CheckSquare, ChevronUp, Copy, DollarSign, Download, ExternalLink, ImageOff, Loader2, MoreVertical, Package, Plus, RefreshCcw, Search, Square, Trash2, TrendingDown, X } from "lucide-react";
import { clearCacheByPrefix, staleWhileRevalidate } from "@/lib/staleCache";
import { formatFornecedorNome } from "@/lib/fornecedorFormatter";
import { MicroTrendChart } from "@/app/dashboard/components/charts/MicroTrendChart";
import type { CustomTooltipFormatter } from "@/app/dashboard/components/charts/ChartTooltips";
import type { Embalagem } from "@/src/types/embalagens";

type ProdutoEmbalagem = {
  embalagem_id: string;
  quantidade: number;
  embalagem: Embalagem;
};

type Produto = {
  id: number;
  id_produto_tiny: number;
  codigo: string | null;
  nome: string;
  unidade: string | null;
  preco: number | null;
  preco_promocional: number | null;
  saldo: number | null;
  reservado: number | null;
  disponivel: number | null;
  disponivel_total?: number | null;
  situacao: string;
  tipo: string;
  fornecedor_nome: string | null;
  gtin: string | null;
  imagem_url: string | null;
  embalagens?: ProdutoEmbalagem[];
};

type ProdutosResponse = {
  produtos: Produto[];
  total: number;
};

type ProdutosErrorResponse = {
  message?: string;
  details?: string;
  error?: string;
};

const PRODUTOS_CACHE_TTL_MS = 60_000;
const PRODUTOS_AUTO_REFRESH_MS = 180_000;
const PRODUTOS_PAGE_SIZE = 25;

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  K: { label: "Kit", color: "bg-fuchsia-100 text-fuchsia-700" },
  V: { label: "Variação", color: "bg-blue-100 text-blue-700" },
  S: { label: "Simples", color: "bg-emerald-100 text-emerald-700" },
  P: { label: "Produto", color: "bg-purple-100 text-purple-700" },
};

const SITUACAO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  A: { label: "Ativo", color: "text-emerald-700", bg: "bg-emerald-100" },
  I: { label: "Inativo", color: "text-amber-700", bg: "bg-amber-100" },
  E: { label: "Excluído", color: "text-rose-700", bg: "bg-rose-100" },
};

const formatBRL = (value: number | null) => {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

const formatNumber = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

const formatSerieDayLabel = (date: Date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

const formatTooltipCurrency: CustomTooltipFormatter = (value) =>
  typeof value === "number" ? formatBRL(value) : String(value ?? "");

const PRODUTO_SERIE_PRESETS = [
  { value: "30d", label: "30d" },
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
] as const;

type ProdutoSeriePreset = (typeof PRODUTO_SERIE_PRESETS)[number]["value"];

type ProdutoDesempenhoPoint = {
  data: string;
  quantidade: number;
  receita: number;
};

type ProdutoDesempenhoMeta = {
  aggregatedIds: number[];
  aggregatedCodes: string[];
  matchedIds: number[];
  matchedCodes: string[];
  consolidatedChildren: number;
  childSource: "variacoes" | "kit" | null;
  usedCodigoFallback: boolean;
};

type ProdutoDesempenhoResponse = {
  produtoId: number;
  preset: ProdutoSeriePreset;
  startDate: string;
  endDate: string;
  totalQuantidade: number;
  totalReceita: number;
  serie: ProdutoDesempenhoPoint[];
  melhorDia: ProdutoDesempenhoPoint | null;
  meta?: ProdutoDesempenhoMeta;
};

const PRODUTO_DESEMPENHO_CACHE_TTL_MS = 2 * 60_000;
const PRODUTO_SELECIONADO_STORAGE_KEY = "produtos:last-selected-id";

type ProdutoAtualizacaoMeta = {
  attempts429: number;
  updatedAt: number;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return "";
};

const buildProdutosCacheKey = (params: URLSearchParams) => `produtos:${params.toString()}`;

// Hook de debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Função para copiar texto
const copyToClipboard = async (text: string, onSuccess?: () => void) => {
  try {
    await navigator.clipboard.writeText(text);
    onSuccess?.();
  } catch (err) {
    console.error('Erro ao copiar:', err);
  }
};

export default function ProdutosClient() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [situacao, setSituacao] = useState("all");
  const [tipo, setTipo] = useState("all");
  const [fornecedorInput, setFornecedorInput] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [page, setPage] = useState(0);
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const storedValue = window.localStorage.getItem(PRODUTO_SELECIONADO_STORAGE_KEY);
    if (!storedValue) return null;
    const parsed = Number(storedValue);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [produtoHeroPreset, setProdutoHeroPreset] = useState<ProdutoSeriePreset>("30d");
  const [produtoDesempenho, setProdutoDesempenho] = useState<ProdutoDesempenhoResponse | null>(null);
  const [produtoDesempenhoLoading, setProdutoDesempenhoLoading] = useState(false);
  const [produtoDesempenhoError, setProdutoDesempenhoError] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [produtoAtualizandoId, setProdutoAtualizandoId] = useState<number | null>(null);
  const [produtoAtualizacaoErro, setProdutoAtualizacaoErro] = useState<string | null>(null);
  const [produtoAtualizacaoMeta, setProdutoAtualizacaoMeta] = useState<ProdutoAtualizacaoMeta | null>(null);
  const [estoqueLive, setEstoqueLive] = useState<{
    saldo: number | null;
    reservado: number | null;
    disponivel: number | null;
    source?: string | null;
    updatedAt: number;
  } | null>(null);
  const [estoqueLiveLoading, setEstoqueLiveLoading] = useState(false);
  const [estoqueLiveError, setEstoqueLiveError] = useState<string | null>(null);
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([]);
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [imageZoom, setImageZoom] = useState<{ url: string; alt: string } | null>(null);
  const [sortColumn, setSortColumn] = useState<'nome' | 'preco' | 'disponivel' | 'codigo' | 'reservado' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [confirmDialog, setConfirmDialog] = useState<{
    embalagemId: string;
    embalagemNome: string;
    produtoId: number;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  
  // Filtros avançados de preço e estoque
  const [precoMin, setPrecoMin] = useState<string>('');
  const [precoMax, setPrecoMax] = useState<string>('');
  const [estoqueMin, setEstoqueMin] = useState<string>('');
  const [estoqueMax, setEstoqueMax] = useState<string>('');
  
  // Progresso de sincronização
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);

  // Pull-to-refresh state
  const [pullToRefresh, setPullToRefresh] = useState<{
    isPulling: boolean;
    pullDistance: number;
    isRefreshing: boolean;
  }>({ isPulling: false, pullDistance: 0, isRefreshing: false });

  // FAB state
  const [fabOpen, setFabOpen] = useState(false);

  // Infinite scroll mobile state
  const [mobileProducts, setMobileProducts] = useState<Produto[]>([]);
  const [mobileHasMore, setMobileHasMore] = useState(true);
  const mobileLoaderRef = useRef<HTMLDivElement>(null);

  // Hooks de navegação para salvar filtros na URL
  const router = useRouter();
  const searchParams = useSearchParams();

  // Debounce da busca (300ms)
  const debouncedSearchInput = useDebounce(searchInput, 300);

  const produtosRequestId = useRef(0);
  const produtoDesempenhoRequestId = useRef(0);
  const produtoDesempenhoCacheRef = useRef(
    new Map<string, { payload: ProdutoDesempenhoResponse; timestamp: number }>()
  );

  const fetchProdutos = useCallback(async () => {
    const requestId = ++produtosRequestId.current;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      limit: String(PRODUTOS_PAGE_SIZE),
      offset: String(page * PRODUTOS_PAGE_SIZE),
    });
    if (search) params.set("search", search);
    if (situacao !== "all") params.set("situacao", situacao);
    if (tipo !== "all") params.set("tipo", tipo);
    if (fornecedor) params.set("fornecedor", fornecedor);

    const cacheKey = buildProdutosCacheKey(params);

    const applyData = (data: ProdutosResponse) => {
      if (produtosRequestId.current !== requestId) return;
      setProdutos(data.produtos);
      setTotal(data.total);
    };

    try {
      const { data } = await staleWhileRevalidate<ProdutosResponse>({
        key: cacheKey,
        ttlMs: PRODUTOS_CACHE_TTL_MS,
        fetcher: async () => {
          const response = await fetch(`/api/produtos?${params.toString()}`, { cache: "no-store" });
          const json = (await response.json()) as ProdutosResponse | ProdutosErrorResponse;
          if (!response.ok) {
            const errorPayload = json as ProdutosErrorResponse;
            const errorMessage = errorPayload.message || errorPayload.details || errorPayload.error || "Erro ao buscar produtos";
            throw new Error(errorMessage);
          }
          return json as ProdutosResponse;
        },
        onUpdate: applyData,
      });
      applyData(data);
    } catch (fetchError) {
      if (produtosRequestId.current === requestId) {
        setError(getErrorMessage(fetchError) || "Erro ao buscar produtos");
      }
    } finally {
      if (produtosRequestId.current === requestId) {
        setLoading(false);
      }
    }
  }, [page, search, situacao, tipo, fornecedor]);

  useEffect(() => {
    fetchProdutos();
  }, [fetchProdutos]);

  // Inicializar filtros a partir da URL (só na montagem)
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    const urlSituacao = searchParams.get('situacao') || 'all';
    const urlTipo = searchParams.get('tipo') || 'all';
    const urlFornecedor = searchParams.get('fornecedor') || '';
    const urlPage = parseInt(searchParams.get('page') || '0', 10);
    
    setSearchInput(urlSearch);
    setSearch(urlSearch);
    setSituacao(urlSituacao);
    setTipo(urlTipo);
    setFornecedorInput(urlFornecedor);
    setFornecedor(urlFornecedor);
    setPage(urlPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Só roda uma vez na montagem

  // Aplicar debounce na busca automaticamente
  useEffect(() => {
    if (debouncedSearchInput !== search) {
      setSearch(debouncedSearchInput);
      setPage(0);
    }
  }, [debouncedSearchInput, search]);

  // Sincronizar filtros com a URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (situacao !== 'all') params.set('situacao', situacao);
    if (tipo !== 'all') params.set('tipo', tipo);
    if (fornecedor) params.set('fornecedor', fornecedor);
    if (page > 0) params.set('page', String(page));
    
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [search, situacao, tipo, fornecedor, page, router]);

  // Pull-to-refresh handler
  const handlePullToRefresh = useCallback(async () => {
    if (pullToRefresh.isRefreshing) return;
    
    setPullToRefresh((prev) => ({ ...prev, isRefreshing: true }));
    try {
      clearCacheByPrefix("produtos:");
      await fetchProdutos();
    } finally {
      setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
    }
  }, [pullToRefresh.isRefreshing, fetchProdutos]);

  // Touch handlers para pull-to-refresh
  const touchStartY = useRef(0);
  const PULL_THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 0 || pullToRefresh.isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    
    if (diff > 0 && diff < 150) {
      setPullToRefresh((prev) => ({
        ...prev,
        isPulling: true,
        pullDistance: Math.min(diff, 120),
      }));
    }
  }, [pullToRefresh.isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (pullToRefresh.pullDistance >= PULL_THRESHOLD) {
      handlePullToRefresh();
    } else {
      setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
    }
  }, [pullToRefresh.pullDistance, handlePullToRefresh]);

  // Buscar embalagens uma única vez
  useEffect(() => {
    const fetchEmbalagens = async () => {
      try {
        const res = await fetch("/api/embalagens");
        if (!res.ok) throw new Error("Erro ao buscar embalagens");
        const data = await res.json();
        setEmbalagens(data.embalagens || []);
      } catch (err) {
        console.error("Erro ao buscar embalagens:", err);
      }
    };
    fetchEmbalagens();
  }, []);

  // Fechar FAB e modal de zoom com ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setImageZoom(null);
        setFabOpen(false);
      }
    };
    if (imageZoom || fabOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [imageZoom, fabOpen]);

  const fetchProdutosRef = useRef(fetchProdutos);
  useEffect(() => {
    fetchProdutosRef.current = fetchProdutos;
  }, [fetchProdutos]);

  useEffect(() => {
    if (!produtos.length) {
      setProdutoSelecionadoId(null);
      setProdutoAtualizandoId(null);
      setProdutoAtualizacaoErro(null);
      setProdutoAtualizacaoMeta(null);
      return;
    }
    setProdutoSelecionadoId((prev) => {
      if (prev && produtos.some((produto) => produto.id_produto_tiny === prev)) {
        return prev;
      }
      return produtos[0].id_produto_tiny;
    });
  }, [produtos]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (produtoSelecionadoId) {
        window.localStorage.setItem(PRODUTO_SELECIONADO_STORAGE_KEY, String(produtoSelecionadoId));
      } else {
        window.localStorage.removeItem(PRODUTO_SELECIONADO_STORAGE_KEY);
      }
    }
  }, [produtoSelecionadoId]);

  useEffect(() => {
    if (!produtoSelecionadoId) return;

    let cancelled = false;
    const controller = new AbortController();

    setProdutoAtualizacaoErro(null);
    setProdutoAtualizacaoMeta(null);
    setProdutoAtualizandoId(produtoSelecionadoId);

    const run = async () => {
      try {
        const response = await fetch("/api/produtos/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ produtoId: produtoSelecionadoId, enrichEstoque: true }),
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!response.ok) {
          const message =
            (payload?.message as string) ||
            (payload?.error as string) ||
            (payload?.details as string) ||
            "Erro ao atualizar produto";
          throw new Error(message);
        }
        if (cancelled || controller.signal.aborted) return;
        clearCacheByPrefix("produtos:");
        await fetchProdutosRef.current();
        const attempts =
          payload && typeof (payload as { attempts429?: unknown }).attempts429 === 'number'
            ? (payload as { attempts429: number }).attempts429
            : 0;
        setProdutoAtualizacaoMeta({ attempts429: attempts, updatedAt: Date.now() });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setProdutoAtualizacaoErro(getErrorMessage(err) || "Erro ao atualizar produto");
      } finally {
        if (cancelled || controller.signal.aborted) return;
        setProdutoAtualizandoId(null);
      }
    };

    run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [produtoSelecionadoId]);

  useEffect(() => {
    const interval = setInterval(() => {
      clearCacheByPrefix("produtos:");
      fetchProdutos();
    }, PRODUTOS_AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchProdutos]);

  useEffect(() => {
    if (!produtoSelecionadoId) {
      setProdutoDesempenho(null);
      setProdutoDesempenhoError(null);
      setProdutoDesempenhoLoading(false);
      return;
    }

    const cacheKey = `${produtoSelecionadoId}:${produtoHeroPreset}`;
    const cached = produtoDesempenhoCacheRef.current.get(cacheKey);
    const requestId = ++produtoDesempenhoRequestId.current;

    if (cached && Date.now() - cached.timestamp < PRODUTO_DESEMPENHO_CACHE_TTL_MS) {
      setProdutoDesempenho(cached.payload);
      setProdutoDesempenhoError(null);
      setProdutoDesempenhoLoading(false);
      return;
    }

    const controller = new AbortController();
    setProdutoDesempenhoLoading(true);
    setProdutoDesempenhoError(null);

    const fetchDesempenho = async () => {
      try {
        const response = await fetch(
          `/api/produtos/desempenho?produtoId=${produtoSelecionadoId}&preset=${produtoHeroPreset}`,
          { cache: "no-store", signal: controller.signal }
        );
        const json = (await response.json().catch(() => null)) as
          | ProdutoDesempenhoResponse
          | ProdutosErrorResponse
          | null;
        if (!response.ok) {
          const errorMessage =
            (json as ProdutosErrorResponse | null)?.message ||
            (json as ProdutosErrorResponse | null)?.details ||
            (json as ProdutosErrorResponse | null)?.error ||
            "Erro ao carregar desempenho";
          throw new Error(errorMessage);
        }
        if (controller.signal.aborted || produtoDesempenhoRequestId.current !== requestId) return;
        if (!json) {
          throw new Error("Resposta inválida da API");
        }
        const payload = json as ProdutoDesempenhoResponse;
        setProdutoDesempenho(payload);
        produtoDesempenhoCacheRef.current.set(cacheKey, { payload, timestamp: Date.now() });
      } catch (fetchError) {
        if (controller.signal.aborted || produtoDesempenhoRequestId.current !== requestId) return;
        setProdutoDesempenho(null);
        setProdutoDesempenhoError(getErrorMessage(fetchError) || "Erro ao carregar desempenho");
      } finally {
        if (controller.signal.aborted || produtoDesempenhoRequestId.current !== requestId) return;
        setProdutoDesempenhoLoading(false);
      }
    };

    fetchDesempenho();

    return () => {
      controller.abort();
    };
  }, [produtoSelecionadoId, produtoHeroPreset]);

  const totalPages = Math.max(1, Math.ceil(total / PRODUTOS_PAGE_SIZE) || 1);

  const produtoEmFoco = useMemo(() => {
    if (!produtos.length) return null;
    if (produtoSelecionadoId == null) return produtos[0];
    return produtos.find((produto) => produto.id_produto_tiny === produtoSelecionadoId) ?? produtos[0];
  }, [produtos, produtoSelecionadoId]);

  // Produtos filtrados por quick filter
  const produtosFiltrados = useMemo(() => {
    // Primeiro filtra
    let filtered = quickFilter
      ? produtos.filter((produto) => {
          const disponivel = produto.disponivel_total ?? produto.disponivel ?? 0;

          switch (quickFilter) {
            case 'estoque-critico':
              return disponivel <= 0;
            case 'estoque-baixo':
              return disponivel > 0 && disponivel < 5;
            case 'sem-imagem':
              return !produto.imagem_url;
            case 'em-promocao':
              return produto.preco_promocional != null && produto.preco_promocional < (produto.preco || 0);
            case 'sem-embalagem':
              return !produto.embalagens || produto.embalagens.length === 0;
            default:
              return true;
          }
        })
      : produtos;

    // Aplicar filtros de preço
    const precoMinNum = precoMin ? parseFloat(precoMin) : null;
    const precoMaxNum = precoMax ? parseFloat(precoMax) : null;
    if (precoMinNum !== null || precoMaxNum !== null) {
      filtered = filtered.filter((produto) => {
        const preco = produto.preco || 0;
        if (precoMinNum !== null && preco < precoMinNum) return false;
        if (precoMaxNum !== null && preco > precoMaxNum) return false;
        return true;
      });
    }

    // Aplicar filtros de estoque
    const estoqueMinNum = estoqueMin ? parseInt(estoqueMin, 10) : null;
    const estoqueMaxNum = estoqueMax ? parseInt(estoqueMax, 10) : null;
    if (estoqueMinNum !== null || estoqueMaxNum !== null) {
      filtered = filtered.filter((produto) => {
        const disponivel = produto.disponivel_total ?? produto.disponivel ?? 0;
        if (estoqueMinNum !== null && disponivel < estoqueMinNum) return false;
        if (estoqueMaxNum !== null && disponivel > estoqueMaxNum) return false;
        return true;
      });
    }

    // Depois ordena
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;

        switch (sortColumn) {
          case 'nome':
            aVal = a.nome.toLowerCase();
            bVal = b.nome.toLowerCase();
            break;
          case 'codigo':
            aVal = (a.codigo || '').toLowerCase();
            bVal = (b.codigo || '').toLowerCase();
            break;
          case 'preco':
            aVal = a.preco || 0;
            bVal = b.preco || 0;
            break;
          case 'reservado':
            aVal = a.reservado || 0;
            bVal = b.reservado || 0;
            break;
          case 'disponivel':
            aVal = a.disponivel_total ?? a.disponivel ?? 0;
            bVal = b.disponivel_total ?? b.disponivel ?? 0;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [produtos, quickFilter, precoMin, precoMax, estoqueMin, estoqueMax, sortColumn, sortDirection]);

  // Reset mobile products quando mudar filtros
  useEffect(() => {
    setMobileProducts(produtosFiltrados.slice(0, PRODUTOS_PAGE_SIZE));
    setMobileHasMore(produtosFiltrados.length > PRODUTOS_PAGE_SIZE);
  }, [produtosFiltrados]);

  // Infinite scroll mobile com IntersectionObserver
  useEffect(() => {
    const loader = mobileLoaderRef.current;
    if (!loader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && mobileHasMore && !loading) {
          const currentCount = mobileProducts.length;
          const nextBatch = produtosFiltrados.slice(currentCount, currentCount + PRODUTOS_PAGE_SIZE);
          if (nextBatch.length > 0) {
            setMobileProducts((prev) => [...prev, ...nextBatch]);
            setMobileHasMore(currentCount + nextBatch.length < produtosFiltrados.length);
          } else {
            setMobileHasMore(false);
          }
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loader);
    return () => observer.disconnect();
  }, [mobileProducts.length, mobileHasMore, produtosFiltrados, loading]);

  const carregarEstoqueLive = useCallback(
    async (mode: "hybrid" | "live" = "hybrid") => {
      if (!produtoSelecionadoId) return;
      setEstoqueLiveLoading(true);
      setEstoqueLiveError(null);
      try {
        const response = await fetch(
          `/api/tiny/produtos/${produtoSelecionadoId}/estoque?source=${mode}`,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          source?: string;
          data?: { saldo?: number | null; reservado?: number | null; disponivel?: number | null };
          error?: { code?: string; message?: string; details?: string };
        } | null;

        if (!response.ok || !payload?.ok) {
          const message =
            payload?.error?.message || payload?.error?.code || "Falha ao consultar estoque em tempo real";
          throw new Error(message);
        }

        setEstoqueLive({
          saldo: payload.data?.saldo ?? null,
          reservado: payload.data?.reservado ?? null,
          disponivel: payload.data?.disponivel ?? null,
          source: payload.source ?? mode,
          updatedAt: Date.now(),
        });
      } catch (fetchError) {
        setEstoqueLiveError(getErrorMessage(fetchError) || "Falha ao consultar estoque em tempo real");
      } finally {
        setEstoqueLiveLoading(false);
      }
    },
    [produtoSelecionadoId]
  );

  useEffect(() => {
    setEstoqueLive(null);
    setEstoqueLiveError(null);
    if (!produtoSelecionadoId) return;
    carregarEstoqueLive("hybrid");
  }, [carregarEstoqueLive, produtoSelecionadoId]);

  const produtoSparkData = useMemo(() => {
    if (!produtoDesempenho?.serie?.length) return [];
    return produtoDesempenho.serie.map((ponto, idx) => {
      const parsed = new Date(`${ponto.data}T00:00:00`);
      const label = Number.isNaN(parsed.getTime()) ? ponto.data : formatSerieDayLabel(parsed);
      return {
        label,
        horaIndex: idx,
        hoje: ponto.receita,
        ontem: 0,
      };
    });
  }, [produtoDesempenho]);

  const produtoMelhorDia = produtoDesempenho?.melhorDia ?? null;
  const produtoTotalReceita = produtoDesempenho?.totalReceita ?? 0;
  const produtoTotalQuantidade = produtoDesempenho?.totalQuantidade ?? 0;
  const produtoMelhorDiaLabel = useMemo(() => {
    if (!produtoMelhorDia?.data) return null;
    const parsed = new Date(`${produtoMelhorDia.data}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return produtoMelhorDia.data;
    return formatSerieDayLabel(parsed);
  }, [produtoMelhorDia]);
  const consolidacaoMensagem = useMemo(() => {
    const meta = produtoDesempenho?.meta;
    if (!meta) return null;
    if (meta.consolidatedChildren > 0) {
      const label = meta.childSource === "variacoes"
        ? meta.consolidatedChildren === 1
          ? "variação"
          : "variações"
        : meta.childSource === "kit"
          ? meta.consolidatedChildren === 1
            ? "item do kit"
            : "itens do kit"
          : meta.consolidatedChildren === 1
            ? "produto relacionado"
            : "produtos relacionados";
      return `Consolidando ${meta.consolidatedChildren} ${label}`;
    }
    if (meta.usedCodigoFallback) {
      return "Incluindo vendas identificadas apenas por código";
    }
    return null;
  }, [produtoDesempenho?.meta]);
  const tipoProdutoEmFoco = produtoEmFoco
    ? TIPO_CONFIG[produtoEmFoco.tipo] ?? {
        label: produtoEmFoco.tipo,
        color: "bg-slate-100 text-slate-600",
      }
    : null;
  const situacaoProdutoEmFoco = produtoEmFoco
    ? SITUACAO_CONFIG[produtoEmFoco.situacao] ?? {
        label: produtoEmFoco.situacao,
        color: "text-slate-600",
        bg: "bg-slate-100",
      }
    : null;
  const estoqueTotalPaiVariacoes = produtoEmFoco?.disponivel_total ?? produtoEmFoco?.disponivel ?? null;
  const estoqueSkuSnapshot = {
    saldo: produtoEmFoco?.saldo ?? null,
    reservado: produtoEmFoco?.reservado ?? null,
    disponivel: produtoEmFoco?.disponivel ?? null,
    source: "snapshot",
    updatedAt: 0,
  };
  const estoqueSkuExibido = estoqueLive ?? estoqueSkuSnapshot;
  const disponivelSku = estoqueSkuExibido.disponivel ?? 0;
  const estoqueCriticoSku = disponivelSku > 0 && disponivelSku < 5;
  const estoqueCriticoTotal =
    estoqueTotalPaiVariacoes !== null && estoqueTotalPaiVariacoes > 0 && estoqueTotalPaiVariacoes < 5;

  // Métricas calculadas
  const metrics = useMemo(() => {
    const totalAtivos = produtos.filter(p => p.situacao === 'A').length;
    const estoqueCritico = produtos.filter(p => {
      const disponivel = p.disponivel_total ?? p.disponivel ?? 0;
      return disponivel <= 0;
    }).length;
    const estoqueBaixo = produtos.filter(p => {
      const disponivel = p.disponivel_total ?? p.disponivel ?? 0;
      return disponivel > 0 && disponivel < 5;
    }).length;
    const semImagem = produtos.filter(p => !p.imagem_url).length;
    const valorTotal = produtos.reduce((acc, p) => {
      const preco = p.preco ?? 0;
      const estoque = p.saldo ?? 0;
      return acc + (preco * estoque);
    }, 0);

    return {
      totalAtivos,
      estoqueCritico,
      estoqueBaixo,
      semImagem,
      valorTotal,
    };
  }, [produtos]);

  const handleFiltersSubmit = () => {
    setSearch(searchInput.trim());
    const fornecedorFormatado = formatFornecedorNome(fornecedorInput);
    setFornecedorInput(fornecedorFormatado);
    setFornecedor(fornecedorFormatado);
    setPage(0);
    setMobileFiltersOpen(false);
  };

  async function syncProdutos() {
    if (syncing) return;
    setSyncing(true);
    setSyncProgress({ current: 0, total: 100, message: 'Iniciando sincronização...' });

    try {
      setSyncProgress({ current: 10, total: 100, message: 'Conectando ao Tiny ERP...' });
      
      const response = await fetch("/api/produtos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: 100,
          enrichEstoque: true,
        }),
      });

      setSyncProgress({ current: 70, total: 100, message: 'Processando produtos...' });
      const data = await response.json();

      if (data.success) {
        setSyncProgress({ current: 90, total: 100, message: 'Atualizando cache...' });
        clearCacheByPrefix("produtos:");
        
        setSyncProgress({ current: 100, total: 100, message: 'Concluído!' });
        setNotification({
          type: 'success',
          message: `Sincronização concluída!\n\n${data.totalSincronizados} produtos\n${data.totalNovos} novos\n${data.totalAtualizados} atualizados`
        });
        fetchProdutos();
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (syncError) {
      setNotification({
        type: 'error',
        message: "Erro: " + (getErrorMessage(syncError) || "Erro desconhecido")
      });
    } finally {
      setSyncing(false);
      // Limpar progresso após 1.5s
      setTimeout(() => setSyncProgress(null), 1500);
    }
  }

  const handleSort = (column: 'nome' | 'preco' | 'disponivel' | 'codigo' | 'reservado') => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to asc
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Funções de seleção múltipla
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === produtosFiltrados.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(produtosFiltrados.map(p => p.id)));
    }
  }, [selectedIds.size, produtosFiltrados]);

  const toggleSelectOne = useCallback((id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Exportar apenas selecionados
  const exportarSelecionados = useCallback(() => {
    const produtosSelecionados = produtosFiltrados.filter(p => selectedIds.has(p.id));
    if (produtosSelecionados.length === 0) {
      setNotification({ type: 'error', message: 'Nenhum produto selecionado' });
      return;
    }

    try {
      const headers = [
        'ID Tiny', 'Código', 'Nome', 'GTIN', 'Tipo', 'Situação',
        'Preço', 'Preço Promocional', 'Unidade', 'Saldo', 'Reservado', 'Disponível', 'Fornecedor'
      ];

      const rows = produtosSelecionados.map(p => [
        p.id_produto_tiny,
        p.codigo || '',
        `"${p.nome.replace(/"/g, '""')}"`,
        p.gtin || '',
        p.tipo || '',
        p.situacao || '',
        p.preco || '',
        p.preco_promocional || '',
        p.unidade || '',
        p.saldo || '',
        p.reservado || '',
        p.disponivel_total ?? p.disponivel ?? '',
        p.fornecedor_nome ? `"${p.fornecedor_nome.replace(/"/g, '""')}"` : ''
      ]);

      const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `produtos_selecionados_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setNotification({
        type: 'success',
        message: `${produtosSelecionados.length} produtos exportados com sucesso!`
      });
      clearSelection();
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Erro ao exportar: ' + (error instanceof Error ? error.message : 'Erro desconhecido')
      });
    }
  }, [produtosFiltrados, selectedIds, clearSelection]);

  const exportarCSV = () => {
    try {
      // Headers do CSV
      const headers = [
        'ID Tiny',
        'Código',
        'Nome',
        'GTIN',
        'Tipo',
        'Situação',
        'Preço',
        'Preço Promocional',
        'Unidade',
        'Saldo',
        'Reservado',
        'Disponível',
        'Fornecedor'
      ];

      // Mapear produtos filtrados para linhas CSV
      const rows = produtosFiltrados.map(p => [
        p.id_produto_tiny,
        p.codigo || '',
        `"${p.nome.replace(/"/g, '""')}"`, // Escape aspas duplas
        p.gtin || '',
        p.tipo || '',
        p.situacao || '',
        p.preco || '',
        p.preco_promocional || '',
        p.unidade || '',
        p.saldo || '',
        p.reservado || '',
        p.disponivel_total ?? p.disponivel ?? '',
        p.fornecedor_nome ? `"${p.fornecedor_nome.replace(/"/g, '""')}"` : ''
      ]);

      // Combinar headers e rows
      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Criar blob e download
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `produtos_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setNotification({
        type: 'success',
        message: `${produtosFiltrados.length} produtos exportados com sucesso!`
      });
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Erro ao exportar CSV: ' + (error instanceof Error ? error.message : 'Erro desconhecido')
      });
    }
  };

  // Callback para atualizar embalagens de um produto sem reload
  const handleEmbalagemUpdate = useCallback(async (produtoId: number) => {
    try {
      // Buscar dados atualizados do produto
      const res = await fetch(`/api/produtos?limit=1&offset=0&search=${produtoId}`);
      if (!res.ok) throw new Error("Erro ao buscar produto atualizado");

      const data = await res.json();
      const produtoAtualizado = data.produtos?.find((p: Produto) => p.id === produtoId);

      if (produtoAtualizado) {
        setProdutos(prev => prev.map(p => p.id === produtoId ? produtoAtualizado : p));
      }
    } catch (err) {
      console.error("Erro ao atualizar produto:", err);
      // Em caso de erro, refetch toda a lista
      fetchProdutos();
    }
  }, [fetchProdutos]);

  return (
    <div 
      className="space-y-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullToRefresh.isPulling || pullToRefresh.isRefreshing) && (
        <div 
          className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center transition-all duration-200 md:hidden"
          style={{ 
            height: pullToRefresh.isRefreshing ? 60 : pullToRefresh.pullDistance,
            opacity: pullToRefresh.isRefreshing ? 1 : Math.min(pullToRefresh.pullDistance / 80, 1)
          }}
        >
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600 text-white text-sm font-medium shadow-lg ${pullToRefresh.isRefreshing ? 'animate-pulse' : ''}`}>
            <RefreshCcw className={`w-4 h-4 ${pullToRefresh.isRefreshing ? 'animate-spin' : ''}`} />
            <span>{pullToRefresh.isRefreshing ? 'Atualizando...' : pullToRefresh.pullDistance >= 80 ? 'Solte para atualizar' : 'Puxe para atualizar'}</span>
          </div>
        </div>
      )}

      <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/40 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              <Package className="w-4 h-4 text-purple-600" />
              Catálogo
            </div>
            <div className="flex items-center gap-3 mt-4">
              <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Inventário Tiny sincronizado</h1>
              {(quickFilter || precoMin || precoMax || estoqueMin || estoqueMax) && produtosFiltrados.length !== produtos.length && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-500/20 px-3 py-1 text-sm font-semibold text-purple-700 dark:text-purple-400">
                  {produtosFiltrados.length} / {produtos.length}
                </span>
              )}
              {/* Contador de filtros ativos */}
              {(() => {
                const activeFilters = [
                  search && 'busca',
                  situacao !== 'all' && 'situação',
                  tipo !== 'all' && 'tipo',
                  fornecedor && 'fornecedor',
                  precoMin && 'preço min',
                  precoMax && 'preço max',
                  estoqueMin && 'estoque min',
                  estoqueMax && 'estoque max',
                  quickFilter && 'filtro rápido'
                ].filter(Boolean);
                
                if (activeFilters.length === 0) return null;
                
                return (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {activeFilters.length} filtro{activeFilters.length > 1 ? 's' : ''} ativo{activeFilters.length > 1 ? 's' : ''}
                  </span>
                );
              })()}
            </div>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              {(total || 0).toLocaleString("pt-BR")} itens ativos/variantes com filtros e busca seguindo o mesmo visual translúcido do dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={exportarCSV}
              disabled={produtosFiltrados.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-400 disabled:opacity-50 text-white px-5 py-2.5 text-sm font-semibold transition-all"
              title={produtosFiltrados.length > 0 ? `Exportar ${produtosFiltrados.length} produtos para CSV` : 'Nenhum produto para exportar'}
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
            <button
              onClick={syncProdutos}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-400 text-white px-5 py-2.5 text-sm font-semibold"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4" />
                  Sincronizar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Barra de progresso da sincronização */}
        {syncProgress && (
          <div className="rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-purple-700 dark:text-purple-400">{syncProgress.message}</span>
              <span className="text-purple-600 dark:text-purple-300">{syncProgress.current}%</span>
            </div>
            <div className="h-2 bg-purple-100 dark:bg-purple-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${syncProgress.current}%` }}
              />
            </div>
          </div>
        )}

        {/* Cards de Métricas */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <MetricCard
            icon={Package}
            label="Total Ativos"
            value={metrics.totalAtivos.toLocaleString("pt-BR")}
            color="blue"
            loading={loading}
          />
          <MetricCard
            icon={AlertCircle}
            label="Estoque Crítico"
            value={metrics.estoqueCritico.toLocaleString("pt-BR")}
            color="red"
            loading={loading}
          />
          <MetricCard
            icon={TrendingDown}
            label="Estoque Baixo"
            value={metrics.estoqueBaixo.toLocaleString("pt-BR")}
            color="amber"
            loading={loading}
          />
          <MetricCard
            icon={ImageOff}
            label="Sem Imagem"
            value={metrics.semImagem.toLocaleString("pt-BR")}
            color="purple"
            loading={loading}
          />
          <MetricCard
            icon={DollarSign}
            label="Valor Total"
            value={formatBRL(metrics.valorTotal)}
            color="green"
            loading={loading}
          />
        </div>

        {/* Filtros Rápidos com Chips */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'estoque-critico' ? null : 'estoque-critico')}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              quickFilter === 'estoque-critico'
                ? 'bg-red-100 text-red-700 ring-2 ring-red-500 dark:bg-red-500/20 dark:text-red-400'
                : 'bg-white/70 text-slate-600 hover:bg-red-50 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-red-500/10'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            Estoque crítico
            {metrics.estoqueCritico > 0 && (
              <span className="ml-1 rounded-full bg-red-500 text-white px-2 py-0.5 text-xs">
                {metrics.estoqueCritico}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'estoque-baixo' ? null : 'estoque-baixo')}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              quickFilter === 'estoque-baixo'
                ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500 dark:bg-amber-500/20 dark:text-amber-400'
                : 'bg-white/70 text-slate-600 hover:bg-amber-50 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-amber-500/10'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Estoque baixo
            {metrics.estoqueBaixo > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 text-white px-2 py-0.5 text-xs">
                {metrics.estoqueBaixo}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'sem-imagem' ? null : 'sem-imagem')}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              quickFilter === 'sem-imagem'
                ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-500 dark:bg-purple-500/20 dark:text-purple-400'
                : 'bg-white/70 text-slate-600 hover:bg-purple-50 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-purple-500/10'
            }`}
          >
            <ImageOff className="w-4 h-4" />
            Sem imagem
            {metrics.semImagem > 0 && (
              <span className="ml-1 rounded-full bg-purple-500 text-white px-2 py-0.5 text-xs">
                {metrics.semImagem}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'em-promocao' ? null : 'em-promocao')}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              quickFilter === 'em-promocao'
                ? 'bg-green-100 text-green-700 ring-2 ring-green-500 dark:bg-green-500/20 dark:text-green-400'
                : 'bg-white/70 text-slate-600 hover:bg-green-50 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-green-500/10'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Em promoção
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'sem-embalagem' ? null : 'sem-embalagem')}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              quickFilter === 'sem-embalagem'
                ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500 dark:bg-blue-500/20 dark:text-blue-400'
                : 'bg-white/70 text-slate-600 hover:bg-blue-50 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-blue-500/10'
            }`}
          >
            <Box className="w-4 h-4" />
            Sem embalagem
          </button>

          {quickFilter && (
            <button
              type="button"
              onClick={() => setQuickFilter(null)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-all"
            >
              Limpar filtro
            </button>
          )}
        </div>

        {quickFilter && (
          <div className="flex items-center justify-center py-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Mostrando <span className="font-semibold text-purple-600 dark:text-purple-400">{produtosFiltrados.length}</span> de{" "}
              <span className="font-semibold">{produtos.length}</span> produtos
            </p>
          </div>
        )}

        <div className="md:hidden space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, código ou GTIN..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleFiltersSubmit();
                }
              }}
              className="app-input w-full pl-11"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="flex-1 rounded-full border border-white/40 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-200"
            >
              Ajustar filtros
            </button>
            <button
              type="button"
              onClick={handleFiltersSubmit}
              className="flex-1 rounded-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 text-sm font-semibold"
            >
              Aplicar
            </button>
          </div>
        </div>

        <form
          className="hidden md:grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
          onSubmit={(event) => {
            event.preventDefault();
            handleFiltersSubmit();
          }}
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, código ou GTIN..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleFiltersSubmit();
                }
              }}
              className="app-input w-full pl-11"
            />
          </div>
          <select
            value={situacao}
            onChange={(event) => {
              setSituacao(event.target.value);
              setPage(0);
            }}
            className="app-input w-full min-w-[160px]"
          >
            <option value="all">Todas</option>
            <option value="A">Ativo</option>
            <option value="I">Inativo</option>
            <option value="E">Excluído</option>
          </select>
          <select
            value={tipo}
            onChange={(event) => {
              setTipo(event.target.value);
              setPage(0);
            }}
            className="app-input w-full min-w-[160px]"
          >
            <option value="all">Todos os tipos</option>
            <option value="S">Simples</option>
            <option value="V">Variação</option>
            <option value="K">Kit</option>
          </select>
          <div className="relative">
            <input
              type="text"
              placeholder="Filtrar por fornecedor"
              value={fornecedorInput}
              onChange={(event) => setFornecedorInput(formatFornecedorNome(event.target.value))}
              className="app-input w-full pr-10"
            />
            {(fornecedorInput || fornecedor) && (
              <button
                type="button"
                onClick={() => {
                  setFornecedorInput("");
                  setFornecedor("");
                  setPage(0);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                aria-label="Limpar filtro de fornecedor"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        {/* Filtros avançados de preço e estoque */}
        <div className="hidden md:flex flex-wrap gap-3 items-end">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Preço:</span>
            <input
              type="number"
              placeholder="Min"
              value={precoMin}
              onChange={(e) => setPrecoMin(e.target.value)}
              className="app-input w-24 text-sm"
              min={0}
              step={0.01}
            />
            <span className="text-slate-400">–</span>
            <input
              type="number"
              placeholder="Max"
              value={precoMax}
              onChange={(e) => setPrecoMax(e.target.value)}
              className="app-input w-24 text-sm"
              min={0}
              step={0.01}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Estoque:</span>
            <input
              type="number"
              placeholder="Min"
              value={estoqueMin}
              onChange={(e) => setEstoqueMin(e.target.value)}
              className="app-input w-20 text-sm"
              min={0}
            />
            <span className="text-slate-400">–</span>
            <input
              type="number"
              placeholder="Max"
              value={estoqueMax}
              onChange={(e) => setEstoqueMax(e.target.value)}
              className="app-input w-20 text-sm"
              min={0}
            />
          </div>
          {(precoMin || precoMax || estoqueMin || estoqueMax) && (
            <button
              type="button"
              onClick={() => {
                setPrecoMin('');
                setPrecoMax('');
                setEstoqueMin('');
                setEstoqueMax('');
              }}
              className="text-xs text-slate-500 hover:text-purple-600 font-medium"
            >
              Limpar faixas
            </button>
          )}
        </div>

        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Fechar filtros"
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setMobileFiltersOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-white dark:bg-slate-900 border-t border-white/40 dark:border-white/10 p-6 space-y-4 shadow-[0_-20px_60px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Filtros</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">Refine o catálogo</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-300"
                >
                  Fechar
                </button>
              </div>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleFiltersSubmit();
                }}
              >
                <div className="relative">
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Situação</label>
                  <select
                    value={situacao}
                    onChange={(event) => {
                      setSituacao(event.target.value);
                      setPage(0);
                    }}
                    className="app-input w-full"
                  >
                    <option value="all">Todas</option>
                    <option value="A">Ativo</option>
                    <option value="I">Inativo</option>
                    <option value="E">Excluído</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(event) => {
                      setTipo(event.target.value);
                      setPage(0);
                    }}
                    className="app-input w-full"
                  >
                    <option value="all">Todos os tipos</option>
                    <option value="S">Simples</option>
                    <option value="V">Variação</option>
                    <option value="K">Kit</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Fornecedor</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ex.: AMBIENTA"
                      value={fornecedorInput}
                      onChange={(event) => setFornecedorInput(formatFornecedorNome(event.target.value))}
                      className="app-input w-full pr-10"
                    />
                    {(fornecedorInput || fornecedor) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFornecedorInput("");
                          setFornecedor("");
                          setPage(0);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                        aria-label="Limpar filtro de fornecedor"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Preço mínimo</label>
                    <input
                      type="number"
                      placeholder="R$ 0"
                      value={precoMin}
                      onChange={(e) => setPrecoMin(e.target.value)}
                      className="app-input w-full"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Preço máximo</label>
                    <input
                      type="number"
                      placeholder="R$ ∞"
                      value={precoMax}
                      onChange={(e) => setPrecoMax(e.target.value)}
                      className="app-input w-full"
                      min={0}
                      step={0.01}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Estoque mínimo</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={estoqueMin}
                      onChange={(e) => setEstoqueMin(e.target.value)}
                      className="app-input w-full"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Estoque máximo</label>
                    <input
                      type="number"
                      placeholder="∞"
                      value={estoqueMax}
                      onChange={(e) => setEstoqueMax(e.target.value)}
                      className="app-input w-full"
                      min={0}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 text-sm font-semibold"
                >
                  Aplicar filtros
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      {produtoEmFoco && (
        <section className="glass-panel glass-tint rounded-[32px] border-2 border-purple-200 dark:border-purple-500/30 p-6 md:p-8 space-y-6 shadow-lg shadow-purple-500/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/70 dark:bg-white/5 border border-white/60 flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-purple-500 transition-all"
                onClick={() => produtoEmFoco.imagem_url && setImageZoom({ url: produtoEmFoco.imagem_url, alt: produtoEmFoco.nome })}
                title={produtoEmFoco.imagem_url ? "Clique para ampliar" : undefined}
              >
                {produtoEmFoco.imagem_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={produtoEmFoco.imagem_url} alt={produtoEmFoco.nome} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-7 h-7 text-slate-400" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Produto em foco</p>
                  <span className="inline-flex h-2 w-2 rounded-full bg-purple-500 animate-pulse"></span>
                </div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white leading-snug">{produtoEmFoco.nome}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {produtoEmFoco.codigo && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(produtoEmFoco.codigo!, () => {
                        setCopiedField('codigo');
                        setTimeout(() => setCopiedField(null), 2000);
                      })}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all group"
                      title="Copiar código"
                    >
                      <span>Código {produtoEmFoco.codigo}</span>
                      {copiedField === 'codigo' ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  )}
                  {!produtoEmFoco.codigo && <span>Código —</span>}
                  {produtoEmFoco.gtin && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(produtoEmFoco.gtin!, () => {
                        setCopiedField('gtin');
                        setTimeout(() => setCopiedField(null), 2000);
                      })}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all group"
                      title="Copiar GTIN"
                    >
                      <span>GTIN {produtoEmFoco.gtin}</span>
                      {copiedField === 'gtin' ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  )}
                  {!produtoEmFoco.gtin && <span>GTIN —</span>}
                  <button
                    type="button"
                    onClick={() => copyToClipboard(String(produtoEmFoco.id_produto_tiny), () => {
                      setCopiedField('id');
                      setTimeout(() => setCopiedField(null), 2000);
                    })}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all group"
                    title="Copiar ID Tiny"
                  >
                    <span>ID Tiny {produtoEmFoco.id_produto_tiny}</span>
                    {copiedField === 'id' ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                  <a
                    href={`https://erp.tiny.com.br/produto/${produtoEmFoco.id_produto_tiny}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-purple-700 hover:bg-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:hover:bg-purple-500/30 transition-all font-medium"
                    title="Abrir produto no Tiny ERP"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver no Tiny
                  </a>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-left lg:text-right lg:items-end">
              <div className="flex flex-wrap gap-2 justify-start lg:justify-end">
                {situacaoProdutoEmFoco && (
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${situacaoProdutoEmFoco.color} ${situacaoProdutoEmFoco.bg}`}>
                    {situacaoProdutoEmFoco.label}
                  </span>
                )}
                {tipoProdutoEmFoco && (
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tipoProdutoEmFoco.color}`}>
                    {tipoProdutoEmFoco.label}
                  </span>
                )}
              </div>
              {produtoEmFoco.disponivel_total != null && produtoEmFoco.disponivel_total !== produtoEmFoco.disponivel && (
                <p className="text-xs text-slate-400">Estoque total pai + variações (snapshot)</p>
              )}
              {produtoAtualizandoId === produtoEmFoco.id_produto_tiny ? (
                <p className="flex items-center gap-2 text-xs text-slate-500 lg:justify-end">
                  <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                  Atualizando dados diretamente do Tiny...
                </p>
              ) : produtoAtualizacaoMeta && produtoSelecionadoId === produtoEmFoco.id_produto_tiny ? (
                <p className="text-xs text-slate-500">
                  Última atualização sincronizada agora
                  {produtoAtualizacaoMeta.attempts429 ? ` · ${produtoAtualizacaoMeta.attempts429} retentativa(s)` : ""}
                </p>
              ) : null}
              {produtoAtualizacaoErro && produtoSelecionadoId === produtoEmFoco.id_produto_tiny && (
                <p className="text-xs text-rose-500">{produtoAtualizacaoErro}</p>
              )}
              {consolidacaoMensagem && (
                <p className="text-xs text-slate-400">{consolidacaoMensagem}</p>
              )}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Preço base</p>
                <p className="text-xl font-semibold text-slate-900 dark:text-white">{formatBRL(produtoEmFoco.preco)}</p>
              </div>
              <div className="rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Promoção</p>
                <p className="text-xl font-semibold text-emerald-600">
                  {produtoEmFoco.preco_promocional ? formatBRL(produtoEmFoco.preco_promocional) : "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Fornecedor</p>
                <p className="text-base font-semibold text-slate-900 dark:text-white truncate">
                  {produtoEmFoco.fornecedor_nome || "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Unidade</p>
                <p className="text-base font-semibold text-slate-900 dark:text-white">{produtoEmFoco.unidade || "—"}</p>
              </div>
            </div>
            <div className="rounded-[28px] border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Desempenho de vendas</p>
                  <p className="text-xs text-slate-500">Receita e unidades vendidas (Tiny)</p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/0 p-1 text-[11px] font-semibold">
                  {PRODUTO_SERIE_PRESETS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setProdutoHeroPreset(value)}
                      className={`px-2.5 py-1 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white/70 dark:focus-visible:ring-offset-slate-900/60 ${
                        produtoHeroPreset === value
                          ? "bg-purple-600 text-white shadow"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative min-h-[140px]">
                {produtoDesempenhoLoading && (
                  <div className="absolute inset-0 z-10 rounded-2xl bg-white/80 dark:bg-slate-900/60 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                  </div>
                )}
                {produtoSparkData.length ? (
                  <MicroTrendChart data={produtoSparkData} formatter={formatTooltipCurrency} />
                ) : produtoDesempenhoError ? (
                  <p className="text-xs text-rose-500">{produtoDesempenhoError}</p>
                ) : (
                  <p className="text-xs text-slate-500">Sem vendas registradas para o período selecionado.</p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/80 dark:bg-white/5 border border-white/60 dark:border-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Receita período</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">{formatBRL(produtoTotalReceita)}</p>
                </div>
                <div className="rounded-2xl bg-white/80 dark:bg-white/5 border border-white/60 dark:border-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Unidades vendidas</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">{formatNumber(produtoTotalQuantidade)}</p>
                </div>
                <div className="rounded-2xl bg-white/80 dark:bg-white/5 border border-white/60 dark:border-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Melhor dia</p>
                  {produtoMelhorDia ? (
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {produtoMelhorDiaLabel}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatBRL(produtoMelhorDia.receita)} · {formatNumber(produtoMelhorDia.quantidade)} un
                      </p>
                    </div>
                  ) : (
                    <p className="text-base font-semibold text-slate-400">—</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${
                  estoqueTotalPaiVariacoes === null
                    ? "bg-white/70 dark:bg-white/5 text-slate-600"
                    : estoqueTotalPaiVariacoes <= 0
                      ? "bg-rose-100 text-rose-700"
                      : estoqueCriticoTotal
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                }`}
              >
                Estoque total (pai + variações): <strong>{formatNumber(estoqueTotalPaiVariacoes)}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/5 px-3 py-1">
                Fonte: snapshot do Supabase (round-robin)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/5 px-3 py-1">
                  Saldo (SKU): <strong className="text-slate-900 dark:text-white">{formatNumber(estoqueSkuExibido.saldo)}</strong>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/5 px-3 py-1">
                  Reservado (SKU):{" "}
                  <strong className="text-slate-900 dark:text-white">{formatNumber(estoqueSkuExibido.reservado)}</strong>
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${
                    disponivelSku <= 0
                      ? "bg-rose-100 text-rose-700"
                      : estoqueCriticoSku
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  Disponível deste SKU ({estoqueSkuExibido.source || "hybrid"}): <strong>{formatNumber(estoqueSkuExibido.disponivel)}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {estoqueLiveLoading ? (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                    Atualizando estoque em tempo real...
                  </span>
                ) : estoqueLiveError ? (
                  <span className="text-rose-500">Falha ao consultar estoque em tempo real · usando snapshot</span>
                ) : estoqueLive ? (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    Fonte: Tiny {estoqueLive.source || "hybrid"} · atualizado agora
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    Fonte: snapshot do Supabase
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => carregarEstoqueLive("live")}
                  className="inline-flex items-center gap-1 rounded-full border border-white/40 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-1 font-semibold text-slate-700 dark:text-slate-200 text-xs"
                >
                  <RefreshCcw className="w-3 h-3" />
                  Atualizar estoque agora
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 overflow-hidden">
        {loading ? (
          <div className="hidden md:block">
            {/* Skeleton da tabela */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="app-table-header text-[11px] uppercase tracking-[0.3em] text-slate-500 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                  <tr>
                    <th className="px-6 py-4 text-left">Imagem</th>
                    <th className="px-6 py-4 text-left">Código</th>
                    <th className="px-6 py-4 text-left">Produto</th>
                    <th className="px-6 py-4 text-left">Tipo</th>
                    <th className="px-6 py-4 text-right">Preço</th>
                    <th className="px-6 py-4 text-right">Estoque</th>
                    <th className="px-6 py-4 text-right">Reservado</th>
                    <th className="px-6 py-4 text-right">Disponível</th>
                    <th className="px-6 py-4 text-left">Embalagem</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/10 animate-pulse">
                      <td className="px-6 py-4"><div className="w-14 h-14 rounded-2xl bg-slate-200 dark:bg-slate-700" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-700" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-16 rounded-full bg-slate-200 dark:bg-slate-700" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700 ml-auto" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 w-12 rounded bg-slate-200 dark:bg-slate-700 ml-auto" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 w-12 rounded bg-slate-200 dark:bg-slate-700 ml-auto" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 w-12 rounded bg-slate-200 dark:bg-slate-700 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-24 rounded-full bg-slate-200 dark:bg-slate-700" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-16 rounded-full bg-slate-200 dark:bg-slate-700 mx-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : loading ? (
          <div className="md:hidden p-4 space-y-3">
            {/* Skeleton mobile */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="app-card p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-slate-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !produtos.length ? (
          <div className="px-8 py-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-100 to-slate-100 dark:from-purple-500/20 dark:to-slate-500/20 flex items-center justify-center">
              <Package className="w-10 h-10 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Nenhum produto encontrado</h3>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              {search || quickFilter || precoMin || precoMax || estoqueMin || estoqueMax
                ? "Tente ajustar os filtros ou buscar por outro termo"
                : "Sincronize seus produtos do Tiny ERP para começar"}
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              {(search || quickFilter || precoMin || precoMax || estoqueMin || estoqueMax) && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    setQuickFilter(null);
                    setPrecoMin('');
                    setPrecoMax('');
                    setEstoqueMin('');
                    setEstoqueMax('');
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 dark:border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  <X className="w-4 h-4" />
                  Limpar filtros
                </button>
              )}
              <button
                onClick={syncProdutos}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 text-sm font-semibold transition-all"
              >
                <RefreshCcw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando...' : 'Sincronizar produtos'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile - Infinite Scroll */}
            <div className="md:hidden space-y-3 p-4">
              {mobileProducts.map((produto) => (
                <ProdutoCard
                  key={produto.id}
                  produto={produto}
                  selected={produtoSelecionadoId === produto.id_produto_tiny}
                  onSelect={() => setProdutoSelecionadoId(produto.id_produto_tiny)}
                  embalagens={embalagens}
                  onEmbalagemUpdate={handleEmbalagemUpdate}
                  onNotify={(type, message) => setNotification({ type, message })}
                />
              ))}
              
              {/* Infinite scroll loader */}
              <div ref={mobileLoaderRef} className="py-4 flex justify-center">
                {mobileHasMore && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Carregando mais...</span>
                  </div>
                )}
                {!mobileHasMore && mobileProducts.length > 0 && (
                  <p className="text-sm text-slate-400">
                    Mostrando todos os {mobileProducts.length} produtos
                  </p>
                )}
              </div>
            </div>

            {/* Barra de ações em lote */}
            {selectedIds.size > 0 && (
              <div className="hidden md:flex items-center gap-4 px-6 py-3 bg-purple-50 dark:bg-purple-500/10 border-y border-purple-200 dark:border-purple-500/30 sticky top-0 z-20">
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearSelection}
                    className="p-1.5 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition-colors"
                    title="Limpar seleção"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                    {selectedIds.size} produto{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="h-5 w-px bg-purple-300 dark:bg-purple-600" />
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportarSelecionados}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Exportar selecionados
                  </button>
                </div>
              </div>
            )}

            <div className="hidden md:block overflow-x-auto max-h-[600px]">
              <table className="w-full">
                <thead className="app-table-header text-[11px] uppercase tracking-[0.3em] text-slate-500 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-4 text-center w-12">
                      <button
                        onClick={toggleSelectAll}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={selectedIds.size === produtosFiltrados.length ? "Desmarcar todos" : "Selecionar todos"}
                      >
                        {selectedIds.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? (
                          <CheckSquare className="w-5 h-5 text-purple-600" />
                        ) : selectedIds.size > 0 ? (
                          <div className="relative">
                            <Square className="w-5 h-5 text-slate-400" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-2 h-2 bg-purple-600 rounded-sm" />
                            </div>
                          </div>
                        ) : (
                          <Square className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left">Imagem</th>
                    <th className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSort('codigo')}
                        className="inline-flex items-center gap-1.5 hover:text-purple-600 transition-colors"
                      >
                        Código
                        {sortColumn === 'codigo' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <button
                        onClick={() => handleSort('nome')}
                        className="inline-flex items-center gap-1.5 hover:text-purple-600 transition-colors"
                      >
                        Produto
                        {sortColumn === 'nome' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left">Tipo</th>
                    <th className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSort('preco')}
                        className="inline-flex items-center gap-1.5 hover:text-purple-600 transition-colors ml-auto"
                      >
                        Preço
                        {sortColumn === 'preco' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-right">Estoque</th>
                    <th className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSort('reservado')}
                        className="inline-flex items-center gap-1.5 hover:text-purple-600 transition-colors ml-auto"
                      >
                        Reservado
                        {sortColumn === 'reservado' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSort('disponivel')}
                        className="inline-flex items-center gap-1.5 hover:text-purple-600 transition-colors ml-auto"
                      >
                        Disponível total
                        {sortColumn === 'disponivel' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left">Embalagem</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosFiltrados.map((produto) => (
                    <ProdutoTableRow
                      key={produto.id}
                      produto={produto}
                      selected={produtoSelecionadoId === produto.id_produto_tiny}
                      onSelect={() => setProdutoSelecionadoId(produto.id_produto_tiny)}
                      embalagens={embalagens}
                      onEmbalagemUpdate={handleEmbalagemUpdate}
                      onNotify={(type, message) => setNotification({ type, message })}
                      checked={selectedIds.has(produto.id)}
                      onCheckChange={() => toggleSelectOne(produto.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="px-6 pt-4 text-sm text-rose-600">{error}</div>
            )}

            {totalPages > 1 && (
              <div className="border-t border-white/20 dark:border-white/5 px-6 py-4 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  Página {page + 1} de {totalPages} • {total} produtos
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="px-4 py-2 rounded-full border border-white/40 dark:border-white/10 bg-white/80 dark:bg-white/5 text-sm font-medium disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-4 py-2 rounded-full border border-white/40 dark:border-white/10 bg-white/80 dark:bg-white/5 text-sm font-medium disabled:opacity-50"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {notification && (
        <NotificationToast
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title="Desvincular Embalagem"
          message={`Deseja realmente desvincular a embalagem "${confirmDialog.embalagemNome}" deste produto?`}
          onConfirm={async () => {
            const { embalagemId, produtoId } = confirmDialog;
            setConfirmDialog(null);
            try {
              const res = await fetch(
                `/api/produtos/${produtoId}/embalagens?embalagem_id=${embalagemId}`,
                { method: "DELETE" }
              );
              if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Erro ao desvincular embalagem");
              }
              setNotification({ type: 'success', message: 'Embalagem desvinculada com sucesso!' });
              await fetchProdutos();
            } catch (err) {
              setNotification({
                type: 'error',
                message: err instanceof Error ? err.message : "Erro ao desvincular embalagem"
              });
            }
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {imageZoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setImageZoom(null)}
        >
          <div className="relative max-w-6xl max-h-[90vh] w-full">
            <button
              onClick={() => setImageZoom(null)}
              className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Fechar (ESC)"
            >
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageZoom.url}
              alt={imageZoom.alt}
              className="w-full h-auto max-h-[90vh] object-contain rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* FAB (Floating Action Button) - Mobile only */}
      <div className="md:hidden fixed bottom-6 right-6 z-40">
        {/* FAB backdrop when open */}
        {fabOpen && (
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setFabOpen(false)}
          />
        )}
        
        {/* FAB Actions */}
        <div className={`absolute bottom-16 right-0 flex flex-col gap-3 items-end transition-all duration-200 ${fabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          <button
            onClick={() => {
              setFabOpen(false);
              exportarCSV();
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-500 transition-all"
          >
            <span className="text-sm font-medium whitespace-nowrap">Exportar CSV</span>
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setFabOpen(false);
              syncProdutos();
            }}
            disabled={syncing}
            className="flex items-center gap-3 px-4 py-3 rounded-full bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500 disabled:opacity-50 transition-all"
          >
            <span className="text-sm font-medium whitespace-nowrap">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            <RefreshCcw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setFabOpen(false);
              setMobileFiltersOpen(true);
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-full bg-slate-700 text-white shadow-lg shadow-slate-500/30 hover:bg-slate-600 transition-all"
          >
            <span className="text-sm font-medium whitespace-nowrap">Filtros</span>
            <Search className="w-5 h-5" />
          </button>
        </div>

        {/* Main FAB button */}
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className={`relative w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 ${
            fabOpen 
              ? 'bg-slate-700 rotate-45' 
              : 'bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600'
          }`}
          aria-label={fabOpen ? 'Fechar menu' : 'Abrir menu de ações'}
        >
          {fabOpen ? (
            <Plus className="w-6 h-6 text-white" />
          ) : (
            <MoreVertical className="w-6 h-6 text-white" />
          )}
        </button>

        {/* Scroll to top button */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="absolute -left-14 bottom-0 w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          aria-label="Voltar ao topo"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

type MetricCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: "blue" | "green" | "red" | "purple" | "amber";
  loading?: boolean;
};

const MetricCard = memo(function MetricCard({ icon: Icon, label, value, color, loading }: MetricCardProps) {
  const colorClasses = {
    blue: "from-blue-500 to-cyan-500",
    green: "from-green-500 to-emerald-500",
    red: "from-red-500 to-rose-500",
    purple: "from-purple-500 to-pink-500",
    amber: "from-amber-500 to-orange-500",
  };

  const bgClasses = {
    blue: "bg-blue-50 dark:bg-blue-500/10",
    green: "bg-green-50 dark:bg-green-500/10",
    red: "bg-red-50 dark:bg-red-500/10",
    purple: "bg-purple-50 dark:bg-purple-500/10",
    amber: "bg-amber-50 dark:bg-amber-500/10",
  };

  const iconClasses = {
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    red: "text-red-600 dark:text-red-400",
    purple: "text-purple-600 dark:text-purple-400",
    amber: "text-amber-600 dark:text-amber-400",
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 p-6 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-3"></div>
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</span>
        <div className={`p-2.5 rounded-xl ${bgClasses[color]}`}>
          <Icon className={`w-5 h-5 ${iconClasses[color]}`} />
        </div>
      </div>
      <div className={`text-2xl font-bold bg-gradient-to-r ${colorClasses[color]} bg-clip-text text-transparent`}>
        {value}
      </div>
    </div>
  );
});

type NotificationToastProps = {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose: () => void;
};

function NotificationToast({ type, message, onClose }: NotificationToastProps) {
  const styles = {
    success: {
      bg: 'bg-green-50 dark:bg-green-500/10 border-green-500',
      icon: 'text-green-600 dark:text-green-400',
      text: 'text-green-900 dark:text-green-100',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-500/10 border-red-500',
      icon: 'text-red-600 dark:text-red-400',
      text: 'text-red-900 dark:text-red-100',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-500',
      icon: 'text-blue-600 dark:text-blue-400',
      text: 'text-blue-900 dark:text-blue-100',
    },
  };

  const style = styles[type];

  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top duration-300">
      <div className={`flex items-start gap-3 rounded-2xl border-2 ${style.bg} p-4 shadow-2xl max-w-md backdrop-blur-sm`}>
        <AlertCircle className={`w-5 h-5 mt-0.5 ${style.icon}`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${style.text} whitespace-pre-line`}>{message}</p>
        </div>
        <button
          onClick={onClose}
          className={`rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${style.icon}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full border-2 border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {message}
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type ProdutoRowProps = {
  produto: Produto;
  selected?: boolean;
  onSelect?: () => void;
  embalagens: Embalagem[];
  onEmbalagemUpdate: (produtoId: number) => void;
  onNotify?: (type: 'success' | 'error' | 'info', message: string) => void;
  checked?: boolean;
  onCheckChange?: () => void;
};

const ProdutoCard = memo(function ProdutoCard({ produto, selected, onSelect, embalagens, onEmbalagemUpdate, onNotify }: ProdutoRowProps) {
  const tipoConfig = TIPO_CONFIG[produto.tipo] || {
    label: produto.tipo,
    color: "bg-slate-100 text-slate-600",
  };
  const sitConfig = SITUACAO_CONFIG[produto.situacao] || {
    label: produto.situacao,
    color: "text-slate-600",
    bg: "bg-slate-100",
  };
  const disponivelSnapshot = produto.disponivel_total ?? produto.disponivel ?? 0;
  const temEstoqueBaixo = disponivelSnapshot > 0 && disponivelSnapshot < 5;

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={Boolean(selected)}
      onClick={onSelect}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onSelect) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`app-card p-4 flex gap-3 transition cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white/70 dark:focus-visible:ring-offset-slate-900/70 ${
        selected
          ? "ring-2 ring-purple-500 shadow-lg shadow-purple-500/20 border-purple-500 bg-purple-50/80 dark:bg-purple-500/10"
          : ""
      }`}
    >
      <div className="w-16 h-16 rounded-2xl bg-white/70 dark:bg-white/10 flex items-center justify-center overflow-hidden border border-white/60 shrink-0">
        {produto.imagem_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={produto.imagem_url} alt={produto.nome} className="w-full h-full object-cover" />
        ) : (
          <Package className="w-5 h-5 text-slate-400" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{produto.nome}</p>
            <p className="text-[11px] text-slate-500 truncate">{produto.codigo || "Sem código"} · GTIN {produto.gtin || "—"}</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${sitConfig.color} ${sitConfig.bg}`}>
            {sitConfig.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${tipoConfig.color}`}>
            {tipoConfig.label}
          </span>
          <span className="font-semibold text-slate-900 dark:text-white">{formatBRL(produto.preco)}</span>
          {produto.preco_promocional && produto.preco_promocional < (produto.preco || 0) && (
            <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
              Promo {formatBRL(produto.preco_promocional)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl border border-white/60 dark:border-slate-800/70 bg-slate-50/80 dark:bg-slate-800/60 px-2 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">Estoque</p>
            <p className="font-semibold text-slate-900 dark:text-white">{formatNumber(produto.saldo)}</p>
          </div>
          <div className="rounded-xl border border-white/60 dark:border-slate-800/70 bg-slate-50/80 dark:bg-slate-800/60 px-2 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">Reservado</p>
            <p className="font-semibold text-slate-900 dark:text-white">{formatNumber(produto.reservado)}</p>
          </div>
          <div className="rounded-xl border border-white/60 dark:border-slate-800/70 bg-slate-50/80 dark:bg-slate-800/60 px-2 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">Disponível total</p>
            <p
              className={`font-semibold ${
                disponivelSnapshot <= 0
                  ? "text-rose-600"
                  : temEstoqueBaixo
                  ? "text-amber-600"
                  : "text-emerald-600"
              }`}
            >
              {formatNumber(disponivelSnapshot)}
            </p>
            {produto.disponivel_total != null && (
              <p className="text-[10px] text-slate-400">Pai + variações</p>
            )}
          </div>
        </div>
        {/* Embalagens no mobile */}
        {produto.embalagens && produto.embalagens.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {produto.embalagens.map((link) => (
              <span key={link.embalagem_id} className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-700 dark:text-blue-400">
                <Box className="h-2.5 w-2.5" />
                <span className="font-medium">{link.embalagem.nome}</span>
                <span className="opacity-70">({link.quantidade}x)</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});

const EmbalagemSelector = memo(function EmbalagemSelector({
  produto,
  embalagens,
  onEmbalagemUpdate,
  onNotify
}: {
  produto: Produto;
  embalagens: Embalagem[];
  onEmbalagemUpdate: (produtoId: number) => void;
  onNotify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showSelect, setShowSelect] = useState(false);
  const [selectedEmbalagemId, setSelectedEmbalagemId] = useState("");
  const [selectedQuantidade, setSelectedQuantidade] = useState(1);
  const [editingLink, setEditingLink] = useState<{ embalagem_id: string; quantidade: number } | null>(null);

  const formatEmbalagemTooltip = (embalagem: Embalagem, quantidade: number) => {
    return `${embalagem.nome}
Código: ${embalagem.codigo}
Dimensões: ${embalagem.altura} × ${embalagem.largura} × ${embalagem.comprimento} cm
Preço unitário: ${formatBRL(embalagem.preco_unitario)}
Estoque: ${embalagem.estoque_atual} un
Quantidade neste produto: ${quantidade}x

Clique para editar embalagem/quantidade`;
  };

  const handleAddEmbalagem = async () => {
    if (!selectedEmbalagemId) return;
    if (!Number.isFinite(selectedQuantidade) || selectedQuantidade <= 0) {
      onNotify?.('error', "Quantidade deve ser maior que zero");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/produtos/${produto.id}/embalagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embalagem_id: selectedEmbalagemId,
          quantidade: selectedQuantidade,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao vincular embalagem");
      }

      // Atualizar produto sem reload
      await onEmbalagemUpdate(produto.id);
      setShowSelect(false);
      setSelectedEmbalagemId("");
      setSelectedQuantidade(1);
    } catch (err) {
      console.error("Erro ao vincular embalagem:", err);
      onNotify?.('error', err instanceof Error ? err.message : "Erro ao vincular embalagem");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveEmbalagem = async (embalagemId: string) => {
    if (!confirm("Deseja desvincular esta embalagem?")) return;
    setRemoving(embalagemId);
    try {
      const res = await fetch(
        `/api/produtos/${produto.id}/embalagens?embalagem_id=${embalagemId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao desvincular embalagem");
      }

      // Atualizar produto sem reload
      await onEmbalagemUpdate(produto.id);
    } catch (err) {
      console.error("Erro ao desvincular embalagem:", err);
      onNotify?.('error', err instanceof Error ? err.message : "Erro ao desvincular embalagem");
    } finally {
      setRemoving(null);
    }
  };

  const linkedEmbalagens = produto.embalagens || [];
  const availableEmbalagens = embalagens.filter(
    (emb) => !linkedEmbalagens.some((linked) => linked.embalagem_id === emb.id)
  );

  return (
    <div className="flex flex-col gap-1.5">
      {linkedEmbalagens.map((link) => (
        <div key={link.embalagem_id} className="flex flex-col gap-1 text-xs">
          {editingLink?.embalagem_id === link.embalagem_id ? (
            <div className="flex items-center gap-1.5">
              <select
                value={editingLink.embalagem_id}
                onChange={(e) =>
                  setEditingLink((prev) =>
                    prev ? { ...prev, embalagem_id: e.target.value } : prev
                  )
                }
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
              >
                {[link.embalagem, ...availableEmbalagens].map((emb) => (
                  <option key={emb.id} value={emb.id}>
                    {emb.nome} ({emb.codigo})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={editingLink.quantidade}
                onChange={(e) =>
                  setEditingLink((prev) =>
                    prev ? { ...prev, quantidade: Math.max(1, Number(e.target.value) || 1) } : prev
                  )
                }
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="w-16 rounded border border-slate-300 px-1 py-1 text-xs text-right dark:border-slate-600 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!editingLink) return;
                  try {
                    const res = await fetch(`/api/produtos/${produto.id}/embalagens`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        embalagem_id: editingLink.embalagem_id,
                        quantidade: editingLink.quantidade,
                      }),
                    });
                    if (!res.ok) {
                      const errorData = await res.json().catch(() => ({}));
                      throw new Error(errorData.error || "Erro ao salvar");
                    }
                    await onEmbalagemUpdate(produto.id);
                    setEditingLink(null);
                  } catch (err) {
                    console.error("Erro ao salvar embalagem:", err);
                    onNotify?.('error', err instanceof Error ? err.message : "Erro ao salvar embalagem");
                  }
                }}
                className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
              >
                OK
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingLink(null);
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingLink({
                    embalagem_id: link.embalagem_id,
                    quantidade: link.quantidade || 1,
                  });
                }}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/10 dark:text-blue-400"
                title={formatEmbalagemTooltip(link.embalagem, link.quantidade)}
              >
                <Box className="h-3 w-3" />
                <span className="font-medium">{link.embalagem.nome}</span>
                <span className="text-[10px] opacity-70">({link.quantidade}x)</span>
              </button>
              {editingLink?.embalagem_id === link.embalagem_id && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveEmbalagem(link.embalagem_id);
                  }}
                  disabled={removing === link.embalagem_id}
                  className="text-rose-500 hover:text-rose-700 disabled:opacity-50"
                  title="Desvincular"
                >
                  {removing === link.embalagem_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {showSelect ? (
        <div className="flex items-center gap-1.5">
          <select
            value={selectedEmbalagemId}
            onChange={(e) => setSelectedEmbalagemId(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
            disabled={adding}
          >
            <option value="">Selecione...</option>
            {availableEmbalagens.map((emb) => (
              <option key={emb.id} value={emb.id}>
                {emb.nome} ({emb.codigo})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={selectedQuantidade}
            onChange={(e) => setSelectedQuantidade(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded border border-slate-300 px-1 py-1 text-xs text-right dark:border-slate-600 dark:bg-slate-800"
            disabled={adding}
          />
          <button
            type="button"
            onClick={handleAddEmbalagem}
            disabled={!selectedEmbalagemId || adding}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSelect(false);
              setSelectedEmbalagemId("");
            }}
            disabled={adding}
            className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : availableEmbalagens.length > 0 && linkedEmbalagens.length === 0 ? (
        <button
          type="button"
          onClick={() => setShowSelect(true)}
          className="w-fit rounded border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-blue-500 hover:text-blue-600 dark:border-slate-600"
        >
          + Adicionar
        </button>
      ) : null}
    </div>
  );
});

const ProdutoTableRow = memo(function ProdutoTableRow({ produto, selected, onSelect, embalagens, onEmbalagemUpdate, onNotify, checked, onCheckChange }: ProdutoRowProps) {
  const tipoConfig = TIPO_CONFIG[produto.tipo] || {
    label: produto.tipo,
    color: "bg-slate-100 text-slate-600",
  };
  const sitConfig = SITUACAO_CONFIG[produto.situacao] || {
    label: produto.situacao,
    color: "text-slate-600",
    bg: "bg-slate-100",
  };
  const disponivelSnapshot = produto.disponivel_total ?? produto.disponivel ?? 0;
  const temEstoqueBaixo = disponivelSnapshot > 0 && disponivelSnapshot < 5;

  return (
    <tr
      className={`cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white/70 dark:focus-visible:ring-offset-slate-900/70 group ${
        selected
          ? "bg-purple-50/80 dark:bg-purple-500/10 border-l-4 border-l-purple-500 shadow-md shadow-purple-500/10"
          : checked
            ? "bg-purple-50/50 dark:bg-purple-500/5 border-l-4 border-l-purple-300"
            : "hover:bg-gradient-to-r hover:from-slate-50 hover:to-transparent dark:hover:from-slate-800/50 dark:hover:to-transparent border-l-4 border-l-transparent hover:border-l-slate-300 dark:hover:border-l-slate-600 hover:shadow-sm"
      }`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onSelect) {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={Boolean(selected)}
    >
      <td className="px-4 py-4 text-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheckChange?.();
          }}
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {checked ? (
            <CheckSquare className="w-5 h-5 text-purple-600" />
          ) : (
            <Square className="w-5 h-5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
          )}
        </button>
      </td>
      <td className="px-6 py-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-white/60 group-hover:ring-2 group-hover:ring-purple-200 dark:group-hover:ring-purple-500/30 transition-all">
          {produto.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={produto.imagem_url} alt={produto.nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          ) : (
            <Package className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="text-sm font-medium text-slate-900 dark:text-white">{produto.codigo || "—"}</div>
        <div className="text-xs text-slate-500">GTIN {produto.gtin || "—"}</div>
      </td>
      <td className="px-6 py-4 max-w-[320px]">
        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={produto.nome}>
          {produto.nome}
        </div>
        <div className="text-xs text-slate-500">ID Tiny {produto.id_produto_tiny}</div>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tipoConfig.color}`}>
          {tipoConfig.label}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{formatBRL(produto.preco)}</div>
        {produto.preco_promocional && produto.preco_promocional < (produto.preco || 0) && (
          <div className="text-xs text-emerald-600">Promo {formatBRL(produto.preco_promocional)}</div>
        )}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="font-semibold text-slate-900 dark:text-white">{formatNumber(produto.saldo)}</div>
        <div className="text-[11px] text-slate-500">Unidade {produto.unidade || "—"}</div>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="font-semibold text-amber-600">{formatNumber(produto.reservado)}</div>
      </td>
      <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {disponivelSnapshot <= 0 && (
              <span title="Estoque zerado!">
                <AlertCircle className="w-4 h-4 text-rose-500 animate-pulse" />
              </span>
            )}
            <span
              className={`font-semibold ${
                disponivelSnapshot <= 0
                  ? "text-rose-600"
                  : temEstoqueBaixo
                    ? "text-amber-600"
                    : "text-emerald-600"
              }`}
            >
              {formatNumber(disponivelSnapshot)}
            </span>
          </div>
          {produto.disponivel_total != null && (
            <div className="text-[10px] text-slate-400">Pai + variações</div>
          )}
      </td>
      <td className="px-6 py-4">
        <EmbalagemSelector produto={produto} embalagens={embalagens} onEmbalagemUpdate={onEmbalagemUpdate} onNotify={onNotify} />
      </td>
      <td className="px-6 py-4 text-center">
        <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${sitConfig.color} ${sitConfig.bg}`}>
          {sitConfig.label}
        </span>
      </td>
    </tr>
  );
});
