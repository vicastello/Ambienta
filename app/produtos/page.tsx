"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Loader2,
  Package,
  RefreshCcw,
  Search,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

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
  limit: number;
  offset: number;
};

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  S: { label: "Simples", color: "bg-blue-100 text-blue-700" },
  K: { label: "Kit", color: "bg-purple-100 text-purple-700" },
  V: { label: "Com Variações", color: "bg-indigo-100 text-indigo-700" },
  F: { label: "Fabricado", color: "bg-amber-100 text-amber-700" },
  M: { label: "Matéria Prima", color: "bg-emerald-100 text-emerald-700" },
};

const SITUACAO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  A: { label: "Ativo", color: "text-emerald-700", bg: "bg-emerald-100/70" },
  I: { label: "Inativo", color: "text-slate-700", bg: "bg-slate-200/60" },
  E: { label: "Excluído", color: "text-rose-700", bg: "bg-rose-100/80" },
};

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [situacao, setSituacao] = useState<string>("A");
  const [page, setPage] = useState(0);
  const limit = 50;

  async function fetchProdutos() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        situacao,
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });

      const res = await fetch(`/api/produtos?${params}`);
      const data: ProdutosResponse = await res.json();

      setProdutos(data.produtos);
      setTotal(data.total);
    } catch (error) {
      console.error("Erro ao buscar produtos:", error);
    } finally {
      setLoading(false);
    }
  }

  async function syncProdutos() {
    if (syncing) return;
    setSyncing(true);

    try {
      const res = await fetch("/api/produtos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: 100,
          enrichEstoque: true,
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert(
          `Sincronização concluída!\n\n${data.totalSincronizados} produtos\n${data.totalNovos} novos\n${data.totalAtualizados} atualizados`
        );
        fetchProdutos();
      } else {
        alert("Erro: " + (data.error || "Erro desconhecido"));
      }
    } catch (error: any) {
      console.error("Erro ao sincronizar:", error);
      alert("Erro: " + error.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchProdutos();
  }, [search, situacao, page]);

  const formatBRL = (value: number | null) => {
    if (value === null) return "—";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatNumber = (value: number | null) => {
    if (value === null) return "—";
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AppLayout title="Produtos">
      <div className="space-y-6">
        <div className="rounded-[32px] border border-white/60 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-7 h-7 text-purple-600" />
                Produtos
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {(total || 0).toLocaleString("pt-BR")} produtos
              </p>
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
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, código ou GTIN..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSearch(searchInput);
                      setPage(0);
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
            </div>

            <select
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value);
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

        <div className="rounded-[32px] border border-white/60 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
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
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                      <p className="text-sm text-slate-500 mt-2">Carregando...</p>
                    </td>
                  </tr>
                ) : !produtos || produtos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <Box className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                      <p className="text-sm text-slate-500">Nenhum produto encontrado</p>
                      <button
                        onClick={syncProdutos}
                        className="mt-4 text-sm text-purple-600 hover:text-purple-700 font-medium"
                      >
                        Sincronizar produtos
                      </button>
                    </td>
                  </tr>
                ) : (
                  produtos.map((produto) => {
                    const tipoConfig = TIPO_CONFIG[produto.tipo] || {
                      label: produto.tipo,
                      color: "bg-slate-100 text-slate-600",
                    };
                    const sitConfig = SITUACAO_CONFIG[produto.situacao] || SITUACAO_CONFIG.A;
                    const disponivel = produto.disponivel ?? 0;
                    const temEstoqueBaixo = disponivel > 0 && disponivel < 5;

                    return (
                      <tr
                        key={produto.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-6 py-4">
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            {produto.imagem_url ? (
                              <img
                                src={produto.imagem_url}
                                alt={produto.nome}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = "";
                                  e.currentTarget.style.display = "none";
                                  e.currentTarget.parentElement!.innerHTML = '<div class="text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>';
                                }}
                              />
                            ) : (
                              <Package className="w-6 h-6 text-slate-400" />
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {produto.codigo || "—"}
                          </div>
                          {produto.gtin && (
                            <div className="text-xs text-slate-500">GTIN: {produto.gtin}</div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {produto.nome}
                          </div>
                          {produto.unidade && (
                            <div className="text-xs text-slate-500">Un: {produto.unidade}</div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tipoConfig.color}`}
                          >
                            {tipoConfig.label}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {formatBRL(produto.preco)}
                          </div>
                          {produto.preco_promocional && produto.preco_promocional < (produto.preco || 0) && (
                            <div className="text-xs text-emerald-600 font-medium">
                              {formatBRL(produto.preco_promocional)}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {formatNumber(produto.saldo)}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="text-sm text-amber-600 font-medium">
                            {formatNumber(produto.reservado)}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div
                            className={`text-sm font-semibold ${
                              disponivel <= 0
                                ? "text-rose-600"
                                : temEstoqueBaixo
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {formatNumber(produto.disponivel)}
                          </div>
                          {disponivel <= 0 && (
                            <div className="text-xs text-rose-500">Sem estoque</div>
                          )}
                          {temEstoqueBaixo && (
                            <div className="text-xs text-amber-500">Estoque baixo</div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${sitConfig.color} ${sitConfig.bg}`}
                          >
                            {sitConfig.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && totalPages > 1 && (
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
        </div>
      </div>
    </AppLayout>
  );
}
