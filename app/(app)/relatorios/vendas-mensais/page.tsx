"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Package,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Filter,
  RefreshCw,
  Search,
  Layers,
  Box,
  Store,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Types
interface Summary {
  total_pedidos: number;
  total_itens: number;
  quantidade_total: number;
  faturamento_total: number;
  ticket_medio: number;
  pedidos_nao_vinculados: number;
  pedidos_com_problema: number;
  custo_embalagens_total?: number;
}

interface ByChannel {
  canal: string;
  pedidos: number;
  quantidade: number;
  faturamento: number;
  ticket_medio?: number;
  [key: string]: string | number | undefined;
}

interface TopProduct {
  produto_id?: number;
  sku: string;
  nome: string;
  quantidade: number;
  faturamento: number;
  pedidos: number;
  custo_embalagens?: number;
}

type Embalagem = {
  id: string;
  codigo: string;
  nome: string;
  preco_unitario: number;
  altura?: number;
  largura?: number;
  comprimento?: number;
  estoque_atual?: number;
};

type ProdutoEmbalagemLink = {
  id: string;
  produto_id: number;
  embalagem_id: string;
  quantidade: number;
  embalagem?: Embalagem | null;
};

interface SalesItem {
  id: string;
  pedido_id: string | number;
  numero_pedido: string | number;
  data: string;
  canal: string;
  sku: string;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  tipo_produto?: string;
  is_kit?: boolean;
  kit_parent_sku?: string;
  cliente_nome?: string;
  situacao?: number;
}

interface PedidoAgrupado {
  pedido_id: string | number;
  numero_pedido: string | number;
  data: string;
  canal: string;
  cliente_nome: string;
  situacao: number;
  itens: number;
  quantidade_total: number;
  valor_total: number;
  items: SalesItem[];
}


type GroupBy = "pedido" | "sku" | "canal";
type ViewMode = "unitario" | "kit";

const CANAIS = [
  { value: "todos", label: "Todos os canais" },
  { value: "magalu", label: "Magalu" },
  { value: "shopee", label: "Shopee" },
  { value: "mercado", label: "Mercado Livre" },
  { value: "loja", label: "Loja Própria" },
];

const SITUACOES = [
  { value: "0", label: "Aberta (0)" },
  { value: "1", label: "Faturada (1)" },
  { value: "2", label: "Cancelada (2)" },
  { value: "3", label: "Aprovada (3)" },
  { value: "4", label: "Preparando envio (4)" },
  { value: "5", label: "Enviada (5)" },
  { value: "6", label: "Entregue (6)" },
  { value: "7", label: "Pronto para envio (7)" },
  { value: "8", label: "Dados incompletos (8)" },
  { value: "9", label: "Não entregue (9)" },
];

const COLORS = ["#009DA8", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat("pt-BR").format(value);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR");
};

const EmbalagemInlineSelector = function EmbalagemInlineSelector({
  produtoId,
  links,
  linksLoaded,
  loading,
  embalagensCatalog,
  ensureCatalog,
  fetchLinks,
  onAfterChange,
}: {
  produtoId: number;
  links: ProdutoEmbalagemLink[];
  linksLoaded: boolean;
  loading: boolean;
  embalagensCatalog: Embalagem[];
  ensureCatalog: () => Promise<void>;
  fetchLinks: (produtoId: number) => Promise<ProdutoEmbalagemLink[]>;
  onAfterChange: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [showSelect, setShowSelect] = useState(false);
  const [selectedEmbalagemId, setSelectedEmbalagemId] = useState("");
  const [selectedQuantidade, setSelectedQuantidade] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEmbalagemId, setModalEmbalagemId] = useState("");
  const [modalQuantidade, setModalQuantidade] = useState(1);

  useEffect(() => {
    if (embalagensCatalog.length > 0) return;
    void ensureCatalog();
  }, [embalagensCatalog.length, ensureCatalog]);

  const formatEmbalagemTooltip = (embalagem: Embalagem, quantidade: number) => {
    const codigo = embalagem.codigo ? embalagem.codigo : "—";
    const altura = embalagem.altura ?? 0;
    const largura = embalagem.largura ?? 0;
    const comprimento = embalagem.comprimento ?? 0;
    const estoque = embalagem.estoque_atual ?? 0;
    return `${embalagem.nome}
Código: ${codigo}
Dimensões: ${altura} × ${largura} × ${comprimento} cm
Preço unitário: ${formatCurrency(Number(embalagem.preco_unitario || 0))}
Estoque: ${estoque} un
Quantidade neste produto: ${quantidade}x

Clique para editar embalagem/quantidade`;
  };

  const linkedEmbalagens = linksLoaded ? links : [];
  const availableEmbalagens = embalagensCatalog.filter(
    (emb) => !linkedEmbalagens.some((linked) => linked.embalagem_id === emb.id)
  );

  const openEditModal = useCallback(
    (payload: { embalagemId: string; quantidade: number }) => {
      setModalEmbalagemId(payload.embalagemId);
      setModalQuantidade(Math.max(1, payload.quantidade || 1));
      setModalOpen(true);
    },
    []
  );

  const handleAddEmbalagem = async () => {
    if (!selectedEmbalagemId) return;
    if (!Number.isFinite(selectedQuantidade) || selectedQuantidade <= 0) {
      alert("Quantidade deve ser maior que zero");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`/api/produtos/${produtoId}/embalagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embalagem_id: selectedEmbalagemId,
          quantidade: selectedQuantidade,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao vincular embalagem");
      }

      await fetchLinks(produtoId);
      await onAfterChange();
      setShowSelect(false);
      setSelectedEmbalagemId("");
      setSelectedQuantidade(1);
    } catch (err) {
      console.error("Erro ao vincular embalagem:", err);
      alert(err instanceof Error ? err.message : "Erro ao vincular embalagem");
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEditing = async () => {
    if (!modalEmbalagemId) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/produtos/${produtoId}/embalagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embalagem_id: modalEmbalagemId,
          quantidade: modalQuantidade,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao salvar");
      }
      await fetchLinks(produtoId);
      await onAfterChange();
      setModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar embalagem:", err);
      alert(err instanceof Error ? err.message : "Erro ao salvar embalagem");
    } finally {
      setAdding(false);
    }
  };

  if (!linksLoaded) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando…
      </span>
    );
  }

  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" />
        Atualizando…
      </span>
    );
  }

  const modalCurrentEmb = modalEmbalagemId
    ? embalagensCatalog.find((e) => e.id === modalEmbalagemId) || linkedEmbalagens.find((l) => l.embalagem_id === modalEmbalagemId)?.embalagem || null
    : null;
  const modalOptions = modalCurrentEmb
    ? [modalCurrentEmb, ...availableEmbalagens].filter(
        (value, index, array) => array.findIndex((x) => x.id === value.id) === index
      )
    : availableEmbalagens;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {linkedEmbalagens.map((link) => {
            const emb = link.embalagem || embalagensCatalog.find((e) => e.id === link.embalagem_id) || null;
            if (!emb) return null;

            return (
              <button
                key={link.embalagem_id}
                type="button"
                onClick={() => openEditModal({ embalagemId: link.embalagem_id, quantidade: link.quantidade || 1 })}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-400 w-fit"
                title={formatEmbalagemTooltip(emb, link.quantidade)}
              >
                <Box className="h-2.5 w-2.5" />
                <span className="font-medium truncate max-w-[140px]">{emb.nome}</span>
                <span className="text-[9px] opacity-70">({link.quantidade}x)</span>
              </button>
            );
          })}
        </div>

        {showSelect ? (
          <div className="flex items-center gap-1.5">
            <select
              value={selectedEmbalagemId}
              onChange={(e) => setSelectedEmbalagemId(e.target.value)}
              className="app-input text-xs min-w-[220px]"
              disabled={adding}
            >
              <option value="">Selecione…</option>
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
              className="app-input text-xs w-20 text-right"
              disabled={adding}
            />
            <button
              type="button"
              onClick={handleAddEmbalagem}
              disabled={!selectedEmbalagemId || adding}
              className="text-xs px-2 py-1 rounded-md bg-[#009DA8] text-white disabled:opacity-50 inline-flex items-center justify-center"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSelect(false);
                setSelectedEmbalagemId("");
              }}
              disabled={adding}
              className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-50"
              title="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : availableEmbalagens.length > 0 && linkedEmbalagens.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              setShowSelect(false);
              setModalEmbalagemId("");
              setModalQuantidade(1);
              setModalOpen(true);
            }}
            className="w-fit text-xs px-2 py-1 rounded-md border border-dashed border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-100/60 dark:hover:bg-gray-700/60"
          >
            + Adicionar
          </button>
        ) : null}
      </div>

      {modalOpen && (
        typeof document !== "undefined"
          ? ReactDOM.createPortal(
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
                onClick={() => !adding && setModalOpen(false)}
              >
                <div
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 dark:border-gray-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Editar embalagem</h3>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 truncate">Produto #{produtoId}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalOpen(false)}
                        disabled={adding}
                        className="p-2 rounded-lg hover:bg-gray-100/60 dark:hover:bg-gray-700/60 disabled:opacity-50"
                        title="Fechar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Se estiver editando (modalEmbalagemId), mostra pill atual com X para deletar */}
                    {modalEmbalagemId ? (
                      (() => {
                        const current = embalagensCatalog.find((e) => e.id === modalEmbalagemId) ||
                          linkedEmbalagens.find((l) => l.embalagem_id === modalEmbalagemId)?.embalagem || null;
                        if (!current) return null;
                        return (
                          <div className="flex items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 dark:bg-blue-500/10 px-2 py-0.5 text-sm text-blue-700 dark:text-blue-300">
                              <Box className="h-3 w-3" />
                              <span className="font-medium truncate">{current.nome}</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm('Deseja remover esta embalagem do produto?')) return;
                                  try {
                                    setAdding(true);
                                    const res = await fetch(`/api/produtos/${produtoId}/embalagens?embalagem_id=${modalEmbalagemId}`, {
                                      method: 'DELETE',
                                    });
                                    if (!res.ok) {
                                      const err = await res.json().catch(() => ({}));
                                      throw new Error(err.error || 'Erro ao remover');
                                    }
                                    await fetchLinks(produtoId);
                                    await onAfterChange();
                                    setModalOpen(false);
                                  } catch (err) {
                                    console.error(err);
                                    alert(err instanceof Error ? err.message : 'Erro ao remover');
                                  } finally {
                                    setAdding(false);
                                  }
                                }}
                                className="ml-2 inline-flex items-center justify-center rounded-full bg-red-100 text-red-700 w-5 h-5 p-0"
                                title="Remover"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : null}

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
                      <div className="min-w-0">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Embalagem</label>
                        <select
                          value={modalEmbalagemId}
                          onChange={(e) => setModalEmbalagemId(e.target.value)}
                          className="app-input text-sm w-full"
                          disabled={adding}
                        >
                          {modalOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.nome} ({opt.codigo})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Quantidade</label>
                        <input
                          type="number"
                          min={1}
                          value={modalQuantidade}
                          onChange={(e) => setModalQuantidade(Math.max(1, Number(e.target.value) || 1))}
                          className="app-input text-sm w-full text-right"
                          disabled={adding}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setModalOpen(false)}
                        disabled={adding}
                        className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-100/60 dark:hover:bg-gray-700/60 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEditing}
                        disabled={adding || !modalEmbalagemId}
                        className="px-3 py-2 rounded-lg text-sm font-semibold bg-[#009DA8] text-white disabled:opacity-50 inline-flex items-center gap-2"
                      >
                        {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Salvar
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null
      )}
    </>
  );
};

export default function VendasMensaisPage() {
  // Filtros
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split("T")[0]);
  const [canal, setCanal] = useState("todos");
  const [situacoes, setSituacoes] = useState<string[]>([]);
  const [skuFilter, setSkuFilter] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("sku");
  const [viewMode, setViewMode] = useState<ViewMode>("unitario");
  const FILTERS_KEY = "rel_vendas_mensais_filters_v1";

  // Dados
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byChannel, setByChannel] = useState<ByChannel[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [data, setData] = useState<(PedidoAgrupado | TopProduct | ByChannel)[]>([]);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());
  const [expandedSkuRows, setExpandedSkuRows] = useState<Set<string>>(new Set());

  // Embalagens (para detalhamento por produto)
  const [embalagensCatalog, setEmbalagensCatalog] = useState<Embalagem[]>([]);
  const [embalagensByProdutoId, setEmbalagensByProdutoId] = useState<Record<number, ProdutoEmbalagemLink[]>>({});
  const [loadingEmbalagensByProdutoId, setLoadingEmbalagensByProdutoId] = useState<Record<number, boolean>>({});
  const [embalagemUiState, setEmbalagemUiState] = useState<
    Record<number, { showAdd: boolean; embalagemId: string; quantidade: number; editingId?: string | null }>
  >({});

  // Export
  const [exporting, setExporting] = useState<string | null>(null);

  const ensureEmbalagensCatalog = useCallback(async () => {
    if (embalagensCatalog.length > 0) return;
    try {
      const res = await fetch("/api/embalagens");
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const list = (json?.embalagens || []) as Embalagem[];
      setEmbalagensCatalog(list);
    } catch {
      // silencioso
    }
  }, [embalagensCatalog.length]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        dataInicio,
        dataFim,
        canal,
        sku: skuFilter,
        groupBy,
        viewMode,
        // sem paginação: retorna tudo em uma página
        page: "1",
        limit: "0",
      });

      if (situacoes.length > 0) {
        params.set("situacoes", situacoes.join(","));
      }

      const res = await fetch(`/api/reports/sales?${params}`);
      const result = await res.json();

      if (result.success) {
        setSummary(result.summary);
        setByChannel(result.byChannel);
        setTopProducts(result.topProducts);
        setData(result.data);
        setItems(result.items);

        // Modo kit: queremos as pills de embalagens já na tabela (sem botão)
        if (groupBy === 'sku' && viewMode === 'kit') {
          const rows = (result.data || []) as TopProduct[];
          const produtoIds = Array.from(
            new Set(rows.map((r) => r.produto_id).filter((id): id is number => typeof id === 'number' && Number.isFinite(id)))
          );

          if (produtoIds.length > 0) {
            void (async () => {
              try {
                await ensureEmbalagensCatalog();
                setLoadingEmbalagensByProdutoId((prev) => {
                  const next = { ...prev };
                  for (const id of produtoIds) next[id] = true;
                  return next;
                });

                const CHUNK_SIZE = 200;
                const merged: Record<number, ProdutoEmbalagemLink[]> = {};

                for (let i = 0; i < produtoIds.length; i += CHUNK_SIZE) {
                  const chunk = produtoIds.slice(i, i + CHUNK_SIZE);
                  const batchRes = await fetch(`/api/produtos/embalagens/batch?ids=${chunk.join(',')}`);
                  if (!batchRes.ok) continue;
                  const json = await batchRes.json().catch(() => null);
                  const map = (json?.embalagensByProdutoId || {}) as Record<number, ProdutoEmbalagemLink[]>;
                  for (const id of chunk) {
                    merged[id] = Array.isArray(map[id]) ? map[id] : [];
                  }
                }

                setEmbalagensByProdutoId((prev) => ({ ...prev, ...merged }));
              } finally {
                setLoadingEmbalagensByProdutoId((prev) => {
                  const next = { ...prev };
                  for (const id of produtoIds) next[id] = false;
                  return next;
                });
              }
            })();
          }
        }
      } else {
        alert("Erro ao gerar relatório: " + (result.error || "Erro desconhecido"));
      }
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, canal, situacoes, skuFilter, groupBy, viewMode, ensureEmbalagensCatalog]);

  // Ler filtros salvos (executa apenas uma vez ao montar)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) {
          if (parsed.dataInicio) setDataInicio(parsed.dataInicio);
          if (parsed.dataFim) setDataFim(parsed.dataFim);
          if (parsed.canal) setCanal(parsed.canal);
          if (Array.isArray(parsed.situacoes)) setSituacoes(parsed.situacoes);
          if (typeof parsed.skuFilter === "string") setSkuFilter(parsed.skuFilter);
          if (parsed.groupBy) setGroupBy(parsed.groupBy);
          if (parsed.viewMode) setViewMode(parsed.viewMode);
        }
      }
    } catch (err) {
      // ignore parse errors
    }
    // not calling fetchReport here to avoid loop — fetchReport will be called by the next effect once
  }, []);

  // Chama fetchReport uma vez quando o callback está pronto (após possíveis setStates acima)
  const initialFetchRef = useRef(false);
  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    fetchReport();
  }, [fetchReport]);

  // Persistir filtros quando mudarem
  useEffect(() => {
    try {
      const payload = {
        dataInicio,
        dataFim,
        canal,
        situacoes,
        skuFilter,
        groupBy,
        viewMode,
      };
      localStorage.setItem(FILTERS_KEY, JSON.stringify(payload));
    } catch (e) {
      // ignore
    }
  }, [dataInicio, dataFim, canal, situacoes, skuFilter, groupBy, viewMode]);

  // Paginação removida (tudo em uma página)

  const toggleRow = (id: string | number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const fetchProdutoEmbalagens = useCallback(async (produtoId: number) => {
    setLoadingEmbalagensByProdutoId((prev) => ({ ...prev, [produtoId]: true }));
    try {
      const res = await fetch(`/api/produtos/${produtoId}/embalagens`);
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const list = (json?.embalagens || []) as ProdutoEmbalagemLink[];
      setEmbalagensByProdutoId((prev) => ({ ...prev, [produtoId]: list }));
      return list;
    } finally {
      setLoadingEmbalagensByProdutoId((prev) => ({ ...prev, [produtoId]: false }));
    }
  }, []);

  const toggleSkuRow = useCallback(
    async (skuRow: TopProduct) => {
      const skuKey = skuRow.sku;
      const next = new Set(expandedSkuRows);
      const willOpen = !next.has(skuKey);
      if (willOpen) next.add(skuKey);
      else next.delete(skuKey);
      setExpandedSkuRows(next);

      if (willOpen && skuRow.produto_id) {
        await ensureEmbalagensCatalog();
        await fetchProdutoEmbalagens(skuRow.produto_id);
        setEmbalagemUiState((prev) => ({
          ...prev,
          [skuRow.produto_id!]: prev[skuRow.produto_id!] || { showAdd: false, embalagemId: "", quantidade: 1, editingId: null },
        }));
      }
    },
    [expandedSkuRows, ensureEmbalagensCatalog, fetchProdutoEmbalagens]
  );

  // Exportação
  const exportToCSV = async () => {
    setExporting("csv");
    try {
      const headers = ["SKU", "Produto", "Quantidade", "Faturamento", "Pedidos"];
      const rows = items.map((item) => [
        item.sku,
        item.nome_produto,
        item.quantidade,
        item.valor_total.toFixed(2),
        item.numero_pedido,
      ]);

      const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-vendas-${dataInicio}-${dataFim}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const exportToXLSX = async () => {
    setExporting("xlsx");
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(
        items.map((item) => ({
          SKU: item.sku,
          Produto: item.nome_produto,
          Quantidade: item.quantidade,
          "Valor Unitário": item.valor_unitario,
          "Valor Total": item.valor_total,
          Pedido: item.numero_pedido,
          Data: item.data,
          Canal: item.canal,
          Cliente: item.cliente_nome,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vendas");
      XLSX.writeFile(wb, `relatorio-vendas-${dataInicio}-${dataFim}.xlsx`);
    } catch (error) {
      console.error("Erro ao exportar XLSX:", error);
      alert("Erro ao exportar. Verifique se a biblioteca xlsx está instalada.");
    } finally {
      setExporting(null);
    }
  };

  const exportToPDF = async () => {
    setExporting("pdf");
    try {
      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF();
      
      // Título
      doc.setFontSize(16);
      doc.text("Relatório de Vendas", 14, 15);
      doc.setFontSize(10);
      doc.text(`Período: ${formatDate(dataInicio)} a ${formatDate(dataFim)}`, 14, 22);
      doc.text(`Modo: ${viewMode === "kit" ? "Apenas Kits" : "Todos os Produtos"}`, 14, 28);

      // Resumo
      if (summary) {
        doc.setFontSize(12);
        doc.text("Resumo", 14, 38);
        doc.setFontSize(10);
        doc.text(`Pedidos: ${formatNumber(summary.total_pedidos)}`, 14, 45);
        doc.text(`Faturamento: ${formatCurrency(summary.faturamento_total)}`, 14, 51);
        doc.text(`Ticket Médio: ${formatCurrency(summary.ticket_medio)}`, 14, 57);
      }

      // Tabela de produtos
      const tableData = topProducts.slice(0, 30).map((p) => [
        p.sku,
        p.nome.substring(0, 40),
        formatNumber(p.quantidade),
        formatCurrency(p.faturamento),
        p.pedidos,
      ]);

      autoTable(doc, {
        head: [["SKU", "Produto", "Qtd", "Faturamento", "Pedidos"]],
        body: tableData,
        startY: 65,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 157, 168] },
      });

      doc.save(`relatorio-vendas-${dataInicio}-${dataFim}.pdf`);
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      alert("Erro ao exportar PDF.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Cabeçalho + export (sem paginação: tudo em uma página) */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#009DA8]/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-[#009DA8]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold">Relatório de Vendas</h1>
                <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                  {formatDate(dataInicio)} → {formatDate(dataFim)} · {viewMode === "kit" ? "Apenas Kits" : "Todos os Produtos"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={exportToCSV}
                disabled={!!exporting || loading || !items.length}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting === "csv" ? "Exportando..." : "CSV"}
              </button>
              <button
                onClick={exportToXLSX}
                disabled={!!exporting || loading || !items.length}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting === "xlsx" ? "Exportando..." : "Excel"}
              </button>
              <button
                onClick={exportToPDF}
                disabled={!!exporting || loading || !items.length}
                className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors"
              >
                <FileText className="w-4 h-4" />
                {exporting === "pdf" ? "Exportando..." : "PDF"}
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-[#009DA8]" />
            <h2 className="font-semibold">Filtros</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Data início */}
            <div>
              <label className="block text-sm font-medium mb-1">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
            </div>

            {/* Data fim */}
            <div>
              <label className="block text-sm font-medium mb-1">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
            </div>

            {/* Canal */}
            <div>
              <label className="block text-sm font-medium mb-1">Canal</label>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                {CANAIS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Situações (múltipla escolha) */}
            <div>
              <label className="block text-sm font-medium mb-1">Situações</label>
              <div className="max-h-40 overflow-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 space-y-2 bg-white dark:bg-gray-700">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={situacoes.length === 0}
                    onChange={() => setSituacoes([])}
                    className="h-4 w-4"
                  />
                  <span>Todas</span>
                </label>
                {SITUACOES.map((s) => {
                  const checked = situacoes.includes(s.value);
                  return (
                    <label key={s.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={() => {
                          setSituacoes((prev) =>
                            checked ? prev.filter((v) => v !== s.value) : [...prev, s.value]
                          );
                        }}
                      />
                      <span>{s.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* SKU */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Filtrar por SKU</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={skuFilter}
                  onChange={(e) => setSkuFilter(e.target.value)}
                  placeholder="Digite o SKU..."
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </div>

            {/* Agrupar por */}
            <div>
              <label className="block text-sm font-medium mb-1">Agrupar por</label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="sku">Por SKU/Produto</option>
                <option value="pedido">Por Pedido</option>
                <option value="canal">Por Canal</option>
              </select>
            </div>

            {/* Botão gerar */}
            <div className="flex items-end">
              <button
                onClick={() => fetchReport()}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#009DA8] hover:bg-[#008B96] disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <BarChart3 className="w-4 h-4" />
                )}
                {loading ? "Gerando..." : "Gerar Relatório"}
              </button>
            </div>
          </div>

          {/* Toggle Unitário/Kit */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Visualização:</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                <button
                  onClick={() => setViewMode("unitario")}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    viewMode === "unitario"
                      ? "bg-[#009DA8] text-white"
                      : "bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  <Box className="w-4 h-4" />
                  Unitário
                </button>
                <button
                  onClick={() => setViewMode("kit")}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    viewMode === "kit"
                      ? "bg-[#009DA8] text-white"
                      : "bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Apenas Kits
                </button>
              </div>
              <span className="text-xs text-gray-500">
                {viewMode === "kit"
                  ? "Mostra apenas vendas de kits"
                  : "Mostra todos os produtos vendidos"}
              </span>
            </div>
          </div>
        </div>

        {/* Alertas */}
        {summary && (summary.pedidos_nao_vinculados > 0 || summary.pedidos_com_problema > 0) && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">Atenção</h3>
                <ul className="text-sm text-amber-700 dark:text-amber-300 mt-1 space-y-1">
                  {summary.pedidos_nao_vinculados > 0 && (
                    <li>
                      • {summary.pedidos_nao_vinculados} pedido(s) de marketplace não estão vinculados
                    </li>
                  )}
                  {summary.pedidos_com_problema > 0 && (
                    <li>• {summary.pedidos_com_problema} pedido(s) sem itens cadastrados</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Cards de Resumo */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <ShoppingCart className="w-4 h-4" />
                <span className="text-xs font-medium">Pedidos</span>
              </div>
              <p className="text-2xl font-bold">{formatNumber(summary.total_pedidos)}</p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Package className="w-4 h-4" />
                <span className="text-xs font-medium">Quantidade</span>
              </div>
              <p className="text-2xl font-bold">{formatNumber(summary.quantidade_total)}</p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-medium">Faturamento</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.faturamento_total)}</p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">Ticket Médio</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(summary.ticket_medio)}</p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Store className="w-4 h-4" />
                <span className="text-xs font-medium">Canais</span>
              </div>
              <p className="text-2xl font-bold">{byChannel.length}</p>
            </div>
          </div>
        )}

        {/* Gráficos */}
        {byChannel.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de barras - Faturamento por canal */}
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold mb-4">Faturamento por Canal</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byChannel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="canal" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="faturamento" fill="#009DA8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Gráfico de pizza - Pedidos por canal */}
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold mb-4">Pedidos por Canal</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={byChannel}
                    dataKey="pedidos"
                    nameKey="canal"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {byChannel.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatNumber(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Ranking de Produtos */}
        {topProducts.length > 0 && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#009DA8]" />
              Top 10 Produtos Mais Vendidos
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3">#</th>
                    <th className="text-left py-2 px-3">SKU</th>
                    <th className="text-left py-2 px-3">Produto</th>
                    <th className="text-right py-2 px-3">Qtd</th>
                    <th className="text-right py-2 px-3">Faturamento</th>
                    <th className="text-right py-2 px-3">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.slice(0, 10).map((p, i) => (
                    <tr key={p.sku} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-2 px-3 font-bold text-[#009DA8]">{i + 1}</td>
                      <td className="py-2 px-3 font-mono text-xs">{p.sku}</td>
                      <td className="py-2 px-3 truncate max-w-[200px]" title={p.nome}>{p.nome}</td>
                      <td className="py-2 px-3 text-right font-medium">{formatNumber(p.quantidade)}</td>
                      <td className="py-2 px-3 text-right text-green-600">{formatCurrency(p.faturamento)}</td>
                      <td className="py-2 px-3 text-right">{p.pedidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tabela de Dados (agrupada) */}
        {data.length > 0 && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold mb-4">
              {groupBy === "pedido" && "Detalhamento por Pedido"}
              {groupBy === "sku" && "Detalhamento por Produto"}
              {groupBy === "canal" && "Detalhamento por Canal"}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    {groupBy === "pedido" && (
                      <>
                        <th className="text-left py-2 px-3 w-8"></th>
                        <th className="text-left py-2 px-3">Pedido</th>
                        <th className="text-left py-2 px-3">Data</th>
                        <th className="text-left py-2 px-3">Canal</th>
                        <th className="text-left py-2 px-3">Cliente</th>
                        <th className="text-right py-2 px-3">Itens</th>
                        <th className="text-right py-2 px-3">Qtd</th>
                        <th className="text-right py-2 px-3">Total</th>
                      </>
                    )}
                    {groupBy === "sku" && (
                      <>
                        <th className="text-left py-2 px-3 w-8"></th>
                        <th className="text-left py-2 px-3">SKU</th>
                        <th className="text-left py-2 px-3">Produto</th>
                        <th className="text-right py-2 px-3">Quantidade</th>
                        <th className="text-right py-2 px-3">Faturamento</th>
                        {viewMode === "kit" && (
                          <th className="text-right py-2 px-3">Total embalagens</th>
                        )}
                        {viewMode === "kit" && (
                          <th className="text-left py-2 px-3">Embalagens</th>
                        )}
                        <th className="text-right py-2 px-3">Pedidos</th>
                      </>
                    )}
                    {groupBy === "canal" && (
                      <>
                        <th className="text-left py-2 px-3">Canal</th>
                        <th className="text-right py-2 px-3">Pedidos</th>
                        <th className="text-right py-2 px-3">Quantidade</th>
                        <th className="text-right py-2 px-3">Faturamento</th>
                        <th className="text-right py-2 px-3">Ticket Médio</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => {
                    if (groupBy === "pedido") {
                      const pedido = row as PedidoAgrupado;
                      const keyPedido = pedido.pedido_id ?? pedido.numero_pedido ?? `idx-${idx}`;
                      const isExpanded = expandedRows.has(pedido.pedido_id);
                      return (
                        <React.Fragment key={`pedido-${keyPedido}`}>
                          <tr
                            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                            onClick={() => toggleRow(pedido.pedido_id)}
                          >
                            <td className="py-2 px-3">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </td>
                            <td className="py-2 px-3 font-medium">{pedido.numero_pedido}</td>
                            <td className="py-2 px-3">{formatDate(pedido.data)}</td>
                            <td className="py-2 px-3">{pedido.canal}</td>
                            <td className="py-2 px-3 truncate max-w-[150px]">{pedido.cliente_nome}</td>
                            <td className="py-2 px-3 text-right">{pedido.itens}</td>
                            <td className="py-2 px-3 text-right">{formatNumber(pedido.quantidade_total)}</td>
                            <td className="py-2 px-3 text-right text-green-600 font-medium">
                              {formatCurrency(pedido.valor_total)}
                            </td>
                          </tr>
                          {isExpanded &&
                            pedido.items?.map((item, idx) => (
                              <tr
                                key={`item-${pedido.pedido_id}-${item.sku}-${item.valor_unitario}-${idx}`}
                                className="bg-gray-50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-800"
                              >
                                <td></td>
                                <td className="py-1 px-3 text-xs font-mono text-gray-500">{item.sku}</td>
                                <td colSpan={3} className="py-1 px-3 text-xs truncate">
                                  {item.nome_produto}
                                  {item.kit_parent_sku && (
                                    <span className="ml-2 text-[#009DA8]">(de kit {item.kit_parent_sku})</span>
                                  )}
                                </td>
                                <td></td>
                                <td className="py-1 px-3 text-xs text-right">{item.quantidade}</td>
                                <td className="py-1 px-3 text-xs text-right">{formatCurrency(item.valor_total)}</td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    }

                    if (groupBy === "sku") {
                      const produto = row as TopProduct;
                      const isExpanded = expandedSkuRows.has(produto.sku);
                      const produtoId = produto.produto_id;
                      const links = produtoId ? embalagensByProdutoId[produtoId] || [] : [];
                      const loadingEmbalagens = produtoId ? Boolean(loadingEmbalagensByProdutoId[produtoId]) : false;
                      const ui = produtoId ? (embalagemUiState[produtoId] || { showAdd: false, embalagemId: "", quantidade: 1, editingId: null }) : null;
                      const linksLoaded = produtoId ? Object.prototype.hasOwnProperty.call(embalagensByProdutoId, produtoId) : false;

                      return (
                        <React.Fragment key={`sku-${produto.sku}-${idx}`}>
                          <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="py-2 px-3">
                              {produtoId && viewMode !== "kit" ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSkuRow(produto)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-100/60 dark:hover:bg-gray-700/60"
                                  title={isExpanded ? "Ocultar embalagens" : "Ver/editar embalagens"}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </button>
                              ) : null}
                            </td>
                            <td className="py-2 px-3 font-mono text-xs">{produto.sku}</td>
                            <td className="py-2 px-3 truncate max-w-[250px]" title={produto.nome}>
                              {produto.nome}
                            </td>
                            <td className="py-2 px-3 text-right font-medium">{formatNumber(produto.quantidade)}</td>
                            <td className="py-2 px-3 text-right text-green-600">{formatCurrency(produto.faturamento)}</td>
                            {viewMode === "kit" && (
                              <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-200">
                                {formatCurrency(produto.custo_embalagens || 0)}
                              </td>
                            )}
                            {viewMode === "kit" && (
                              <td className="py-2 px-3">
                                {!produtoId ? (
                                  <span className="text-xs text-gray-500 dark:text-gray-300">Sem ID</span>
                                ) : (
                                  <EmbalagemInlineSelector
                                    produtoId={produtoId}
                                    links={links}
                                    linksLoaded={linksLoaded}
                                    loading={loadingEmbalagens}
                                    embalagensCatalog={embalagensCatalog}
                                    ensureCatalog={ensureEmbalagensCatalog}
                                    fetchLinks={async (id) => (await fetchProdutoEmbalagens(id)) || []}
                                    onAfterChange={fetchReport}
                                  />
                                )}
                              </td>
                            )}
                            <td className="py-2 px-3 text-right">{produto.pedidos}</td>
                          </tr>

                          {viewMode !== "kit" && isExpanded && (
                            <tr className="bg-gray-50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-800">
                              <td></td>
                              <td colSpan={5} className="py-3 px-3">
                                {!produtoId ? (
                                  <div className="text-sm text-gray-600 dark:text-gray-300">
                                    Produto sem ID (não foi possível carregar embalagens).
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/40 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <Box className="w-4 h-4 text-[#009DA8]" />
                                        <span className="text-sm font-semibold">Embalagens do produto</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => fetchProdutoEmbalagens(produtoId)}
                                        className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100/60 dark:hover:bg-gray-700/60"
                                      >
                                        Recarregar
                                      </button>
                                    </div>

                                    {loadingEmbalagens ? (
                                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">Carregando…</div>
                                    ) : (
                                      <div className="mt-3 space-y-2">
                                        {links.length === 0 ? (
                                          <div className="text-sm text-gray-600 dark:text-gray-300">Nenhuma embalagem vinculada.</div>
                                        ) : (
                                          links.map((link) => {
                                            const emb = link.embalagem;
                                            const editing = ui?.editingId === link.embalagem_id;
                                            return (
                                              <div key={link.embalagem_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/30 px-3 py-2">
                                                <div className="min-w-0">
                                                  <div className="text-sm font-medium truncate">
                                                    {emb?.nome || "Embalagem"}
                                                  </div>
                                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {emb?.codigo ? `Código ${emb.codigo}` : "Sem código"} · {formatCurrency(Number(emb?.preco_unitario || 0))}
                                                  </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                  {editing ? (
                                                    <>
                                                      <input
                                                        type="number"
                                                        min={1}
                                                        value={link.quantidade}
                                                        onChange={(e) => {
                                                          const q = Math.max(1, Number(e.target.value) || 1);
                                                          setEmbalagensByProdutoId((prev) => ({
                                                            ...prev,
                                                            [produtoId]: (prev[produtoId] || []).map((l) =>
                                                              l.embalagem_id === link.embalagem_id ? { ...l, quantidade: q } : l
                                                            ),
                                                          }));
                                                        }}
                                                        className="w-20 rounded-md border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/30 px-2 py-1 text-xs text-right"
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={async () => {
                                                          const quantidade = Number(link.quantidade) || 1;
                                                          const res = await fetch(`/api/produtos/${produtoId}/embalagens`, {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ embalagem_id: link.embalagem_id, quantidade }),
                                                          });
                                                          if (res.ok) {
                                                            setEmbalagemUiState((prev) => ({
                                                              ...prev,
                                                              [produtoId]: { ...(prev[produtoId] || { showAdd: false, embalagemId: "", quantidade: 1 }), editingId: null },
                                                            }));
                                                            await fetchProdutoEmbalagens(produtoId);
                                                          } else {
                                                            const err = await res.json().catch(() => ({}));
                                                            alert(err.error || "Erro ao salvar embalagem");
                                                          }
                                                        }}
                                                        className="text-xs px-2 py-1 rounded-md bg-[#009DA8] text-white"
                                                      >
                                                        Salvar
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          setEmbalagemUiState((prev) => ({
                                                            ...prev,
                                                            [produtoId]: { ...(prev[produtoId] || { showAdd: false, embalagemId: "", quantidade: 1 }), editingId: null },
                                                          }))
                                                        }
                                                        className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700"
                                                        title="Cancelar"
                                                      >
                                                        <X className="w-4 h-4" />
                                                      </button>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <span className="text-xs text-gray-700 dark:text-gray-200">{link.quantidade}x</span>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          setEmbalagemUiState((prev) => ({
                                                            ...prev,
                                                            [produtoId]: { ...(prev[produtoId] || { showAdd: false, embalagemId: "", quantidade: 1 }), editingId: link.embalagem_id },
                                                          }))
                                                        }
                                                        className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100/60 dark:hover:bg-gray-700/60"
                                                      >
                                                        Editar
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={async () => {
                                                          const res = await fetch(`/api/produtos/${produtoId}/embalagens?embalagem_id=${link.embalagem_id}`, { method: "DELETE" });
                                                          if (res.ok) {
                                                            await fetchProdutoEmbalagens(produtoId);
                                                          } else {
                                                            const err = await res.json().catch(() => ({}));
                                                            alert(err.error || "Erro ao desvincular embalagem");
                                                          }
                                                        }}
                                                        className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-200 dark:hover:bg-red-900/20"
                                                      >
                                                        Remover
                                                      </button>
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })
                                        )}

                                        <div className="pt-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEmbalagemUiState((prev) => ({
                                                ...prev,
                                                [produtoId]: { ...(prev[produtoId] || { showAdd: false, embalagemId: "", quantidade: 1 }), showAdd: !Boolean(prev[produtoId]?.showAdd) },
                                              }))
                                            }
                                            className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100/60 dark:hover:bg-gray-700/60"
                                          >
                                            {ui?.showAdd ? "Cancelar" : "Adicionar embalagem"}
                                          </button>
                                        </div>

                                        {ui?.showAdd && (
                                          <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <select
                                              value={ui.embalagemId}
                                              onChange={(e) =>
                                                setEmbalagemUiState((prev) => ({
                                                  ...prev,
                                                  [produtoId]: { ...(prev[produtoId] || { showAdd: true, embalagemId: "", quantidade: 1 }), embalagemId: e.target.value },
                                                }))
                                              }
                                              className="app-input text-xs min-w-[240px]"
                                            >
                                              <option value="">Selecione uma embalagem…</option>
                                              {embalagensCatalog
                                                .filter((e) => !links.some((l) => l.embalagem_id === e.id))
                                                .map((e) => (
                                                  <option key={e.id} value={e.id}>
                                                    {e.nome} ({e.codigo})
                                                  </option>
                                                ))}
                                            </select>
                                            <input
                                              type="number"
                                              min={1}
                                              value={ui.quantidade}
                                              onChange={(e) =>
                                                setEmbalagemUiState((prev) => ({
                                                  ...prev,
                                                  [produtoId]: { ...(prev[produtoId] || { showAdd: true, embalagemId: "", quantidade: 1 }), quantidade: Math.max(1, Number(e.target.value) || 1) },
                                                }))
                                              }
                                              className="app-input text-xs w-24 text-right"
                                            />
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                if (!ui.embalagemId) return;
                                                const res = await fetch(`/api/produtos/${produtoId}/embalagens`, {
                                                  method: "POST",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({ embalagem_id: ui.embalagemId, quantidade: ui.quantidade }),
                                                });
                                                if (res.ok) {
                                                  setEmbalagemUiState((prev) => ({
                                                    ...prev,
                                                    [produtoId]: { ...(prev[produtoId] || { showAdd: true, embalagemId: "", quantidade: 1 }), embalagemId: "", quantidade: 1, showAdd: false },
                                                  }));
                                                  await fetchProdutoEmbalagens(produtoId);
                                                } else {
                                                  const err = await res.json().catch(() => ({}));
                                                  alert(err.error || "Erro ao vincular embalagem");
                                                }
                                              }}
                                              className="text-xs px-3 py-2 rounded-md bg-[#009DA8] text-white disabled:opacity-50"
                                              disabled={!ui.embalagemId}
                                            >
                                              Vincular
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    }

                    if (groupBy === "canal") {
                      const canalData = row as ByChannel;
                      return (
                        <tr
                          key={`canal-${canalData.canal}-${idx}`}
                          className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <td className="py-2 px-3 font-medium">{canalData.canal}</td>
                          <td className="py-2 px-3 text-right">{formatNumber(canalData.pedidos)}</td>
                          <td className="py-2 px-3 text-right">{formatNumber(canalData.quantidade)}</td>
                          <td className="py-2 px-3 text-right text-green-600">{formatCurrency(canalData.faturamento)}</td>
                          <td className="py-2 px-3 text-right">
                            {formatCurrency(canalData.ticket_medio || (canalData.pedidos > 0 ? canalData.faturamento / canalData.pedidos : 0))}
                          </td>
                        </tr>
                      );
                    }

                    return null;
                  })}

                  {groupBy === "sku" && summary && (
                    <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/30">
                      <td className="py-2 px-3"></td>
                      <td className="py-2 px-3"></td>
                      <td className="py-2 px-3 font-semibold">TOTAL</td>
                      <td className="py-2 px-3 text-right font-semibold">{formatNumber(summary.quantidade_total)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-green-700 dark:text-green-300">{formatCurrency(summary.faturamento_total)}</td>
                      {viewMode === "kit" && (
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(summary.custo_embalagens_total || 0)}</td>
                      )}
                      {viewMode === "kit" && <td className="py-2 px-3"></td>}
                      <td className="py-2 px-3 text-right font-semibold">{summary.total_pedidos}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Estado vazio */}
        {!loading && data.length === 0 && summary === null && (
          <div className="text-center py-12 text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Selecione os filtros e clique em &quot;Gerar Relatório&quot;</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
