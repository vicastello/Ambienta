"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Loader2, Package, RefreshCcw, Search } from "lucide-react";
import { clearCacheByPrefix, staleWhileRevalidate } from "@/lib/staleCache";
import { formatFornecedorNome } from "@/lib/fornecedorFormatter";
import { MicroTrendChart } from "@/app/dashboard/components/charts/MicroTrendChart";
import type { CustomTooltipFormatter } from "@/app/dashboard/components/charts/ChartTooltips";

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

    try {
      const response = await fetch("/api/produtos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: 100,
          enrichEstoque: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(
          `Sincronização concluída!\n\n${data.totalSincronizados} produtos\n${data.totalNovos} novos\n${data.totalAtualizados} atualizados`
        );
        clearCacheByPrefix("produtos:");
        fetchProdutos();
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (syncError) {
      alert("Erro: " + (getErrorMessage(syncError) || "Erro desconhecido"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/40 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              <Package className="w-4 h-4 text-purple-600" />
              Catálogo
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">Inventário Tiny sincronizado</h1>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              {(total || 0).toLocaleString("pt-BR")} itens ativos/variantes com filtros e busca seguindo o mesmo visual translúcido do dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
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
                &times;
              </button>
            )}
          </div>
        </form>

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
                        &times;
                      </button>
                    )}
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
        <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/70 dark:bg-white/5 border border-white/60 flex items-center justify-center overflow-hidden">
                {produtoEmFoco.imagem_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={produtoEmFoco.imagem_url} alt={produtoEmFoco.nome} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-7 h-7 text-slate-400" />
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Produto em foco</p>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white leading-snug">{produtoEmFoco.nome}</h2>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>Código {produtoEmFoco.codigo || "—"}</span>
                  <span>GTIN {produtoEmFoco.gtin || "—"}</span>
                  <span>ID Tiny {produtoEmFoco.id_produto_tiny}</span>
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
          <div className="px-6 py-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
            <p className="text-sm text-slate-500 mt-2">Carregando produtos...</p>
          </div>
        ) : !produtos.length ? (
          <div className="px-6 py-12 text-center">
            <Box className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">Nenhum produto encontrado</p>
            <button
              onClick={syncProdutos}
              className="mt-4 text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Sincronizar produtos
            </button>
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3 p-4">
              {produtos.map((produto) => (
                <ProdutoCard
                  key={produto.id}
                  produto={produto}
                  selected={produtoSelecionadoId === produto.id_produto_tiny}
                  onSelect={() => setProdutoSelecionadoId(produto.id_produto_tiny)}
                />
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="app-table-header text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4 text-left">Imagem</th>
                    <th className="px-6 py-4 text-left">Código</th>
                    <th className="px-6 py-4 text-left">Produto</th>
                    <th className="px-6 py-4 text-left">Tipo</th>
                    <th className="px-6 py-4 text-right">Preço</th>
                    <th className="px-6 py-4 text-right">Estoque</th>
                    <th className="px-6 py-4 text-right">Reservado</th>
                    <th className="px-6 py-4 text-right">Disponível total</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((produto) => (
                    <ProdutoTableRow
                      key={produto.id}
                      produto={produto}
                      selected={produtoSelecionadoId === produto.id_produto_tiny}
                      onSelect={() => setProdutoSelecionadoId(produto.id_produto_tiny)}
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
    </div>
  );
}

type ProdutoRowProps = {
  produto: Produto;
  selected?: boolean;
  onSelect?: () => void;
};

const ProdutoCard = memo(function ProdutoCard({ produto, selected, onSelect }: ProdutoRowProps) {
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
      className={`app-card p-4 flex gap-3 transition cursor-pointer focus-visible:ring-2 focus-visible:ring-[#009DA8] focus-visible:ring-offset-2 focus-visible:ring-offset-white/70 dark:focus-visible:ring-offset-slate-900/70 ${
        selected ? "ring-2 ring-[#009DA8] shadow-lg shadow-[#009DA8]/20" : ""
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
      </div>
    </article>
  );
});

const ProdutoTableRow = memo(function ProdutoTableRow({ produto, selected, onSelect }: ProdutoRowProps) {
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
      className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009DA8] focus-visible:ring-offset-2 focus-visible:ring-offset-white/70 dark:focus-visible:ring-offset-slate-900/70 ${
        selected ? "bg-slate-50/80 dark:bg-slate-800/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
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
      <td className="px-6 py-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-white/60">
          {produto.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={produto.imagem_url} alt={produto.nome} className="w-full h-full object-cover" />
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
          <div
            className={`font-semibold ${
              disponivelSnapshot <= 0
                ? "text-rose-600"
                : temEstoqueBaixo
                  ? "text-amber-600"
                  : "text-emerald-600"
            }`}
          >
            {formatNumber(disponivelSnapshot)}
          </div>
          {produto.disponivel_total != null && (
            <div className="text-[10px] text-slate-400">Pai + variações</div>
          )}
      </td>
      <td className="px-6 py-4 text-center">
        <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${sitConfig.color} ${sitConfig.bg}`}>
          {sitConfig.label}
        </span>
      </td>
    </tr>
  );
});
