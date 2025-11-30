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
  P: { label: "Produto", color: "bg-purple-100 text-purple-700" },
  V: { label: "Variação", color: "bg-blue-100 text-blue-700" },
  S: { label: "Serviço", color: "bg-emerald-100 text-emerald-700" },
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
  }, [page, search, situacao]);

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

  const handleSearchSubmit = () => {
    setSearch(searchInput.trim());
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
      <div className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-7 h-7 text-purple-600" />
              Produtos
            </h1>
            <p className="text-sm text-slate-500 mt-1">{(total || 0).toLocaleString("pt-BR")} produtos</p>
          </div>
          <button
            onClick={syncProdutos}
            disabled={syncing}
            className="flex items-center gap-2 rounded-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-5 py-2.5 text-sm font-medium"
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

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[220px] w-full">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, código ou GTIN..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearchSubmit();
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <select
            value={situacao}
            onChange={(event) => {
              setSituacao(event.target.value);
              setPage(0);
            }}
            className="px-4 py-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="all">Todas</option>
            <option value="A">Ativo</option>
            <option value="I">Inativo</option>
            <option value="E">Excluído</option>
          </select>
        </div>
      </div>

      <div className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 overflow-hidden">
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
                <thead className="border-b border-slate-200 dark:border-slate-700">
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Imagem
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Código
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Produto
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Tipo
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Preço
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Estoque
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Reservado
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Disponível
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                      Status
                    </th>
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
              <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  Página {page + 1} de {totalPages} • {total} produtos
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium disabled:opacity-50"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
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
    <article className="rounded-3xl border border-white/60 dark:border-slate-800/70 bg-white/95 dark:bg-slate-900/80 p-3 flex gap-3">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-white/60 shrink-0">
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
