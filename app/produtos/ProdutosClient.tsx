"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Box, Loader2, Package, RefreshCcw, Search } from "lucide-react";
import { clearCacheByPrefix, staleWhileRevalidate } from "@/lib/staleCache";

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
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
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

  const produtosRequestId = useRef(0);

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

  useEffect(() => {
    const interval = setInterval(() => {
      clearCacheByPrefix("produtos:");
      fetchProdutos();
    }, PRODUTOS_AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchProdutos]);

  const totalPages = Math.max(1, Math.ceil(total / PRODUTOS_PAGE_SIZE) || 1);

  const handleFiltersSubmit = () => {
    setSearch(searchInput.trim());
    setFornecedor(fornecedorInput.trim());
    setPage(0);
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

        <form
          className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
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
              onChange={(event) => setFornecedorInput(event.target.value)}
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
      </section>

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
                <ProdutoCard key={produto.id} produto={produto} />
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
                    <th className="px-6 py-4 text-right">Disponível</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((produto) => (
                    <ProdutoTableRow key={produto.id} produto={produto} />
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
};

const ProdutoCard = memo(function ProdutoCard({ produto }: ProdutoRowProps) {
  const tipoConfig = TIPO_CONFIG[produto.tipo] || {
    label: produto.tipo,
    color: "bg-slate-100 text-slate-600",
  };
  const sitConfig = SITUACAO_CONFIG[produto.situacao] || {
    label: produto.situacao,
    color: "text-slate-600",
    bg: "bg-slate-100",
  };
  const disponivel = produto.disponivel ?? 0;
  const temEstoqueBaixo = disponivel > 0 && disponivel < 5;

  return (
    <article className="app-card p-4 flex gap-3">
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
            <p className="text-[10px] text-slate-500">Disponível</p>
            <p
              className={`font-semibold ${
                disponivel <= 0
                  ? "text-rose-600"
                  : temEstoqueBaixo
                  ? "text-amber-600"
                  : "text-emerald-600"
              }`}
            >
              {formatNumber(produto.disponivel)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
});

const ProdutoTableRow = memo(function ProdutoTableRow({ produto }: ProdutoRowProps) {
  const tipoConfig = TIPO_CONFIG[produto.tipo] || {
    label: produto.tipo,
    color: "bg-slate-100 text-slate-600",
  };
  const sitConfig = SITUACAO_CONFIG[produto.situacao] || {
    label: produto.situacao,
    color: "text-slate-600",
    bg: "bg-slate-100",
  };
  const disponivel = produto.disponivel ?? 0;
  const temEstoqueBaixo = disponivel > 0 && disponivel < 5;

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
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
            disponivel <= 0
              ? "text-rose-600"
              : temEstoqueBaixo
              ? "text-amber-600"
              : "text-emerald-600"
          }`}
        >
          {formatNumber(produto.disponivel)}
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${sitConfig.color} ${sitConfig.bg}`}>
          {sitConfig.label}
        </span>
      </td>
    </tr>
  );
});
