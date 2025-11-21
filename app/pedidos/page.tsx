"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCcw,
  Search,
  Truck,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";

const STATUS_CONFIG = [
  { codigo: -1, label: "Todos", color: "text-slate-600", bg: "bg-slate-200/50" },
  { codigo: 0, label: "Aberta", color: "text-slate-700", bg: "bg-slate-200/60" },
  { codigo: 3, label: "Aprovada", color: "text-sky-700", bg: "bg-sky-100/70" },
  { codigo: 4, label: "Preparando envio", color: "text-amber-700", bg: "bg-amber-100/70" },
  { codigo: 1, label: "Faturada", color: "text-emerald-700", bg: "bg-emerald-100/70" },
  { codigo: 7, label: "Pronto para envio", color: "text-blue-700", bg: "bg-blue-100/70" },
  { codigo: 5, label: "Enviada", color: "text-indigo-700", bg: "bg-indigo-100/70" },
  { codigo: 6, label: "Entregue", color: "text-emerald-800", bg: "bg-emerald-50" },
  { codigo: 2, label: "Cancelada", color: "text-rose-700", bg: "bg-rose-100/80" },
  { codigo: 8, label: "Dados incompletos", color: "text-slate-700", bg: "bg-slate-100/70" },
  { codigo: 9, label: "Não entregue", color: "text-rose-800", bg: "bg-rose-50" },
] as const;

const CHANNEL_COLORS: Record<string, string> = {
  "Mercado Livre": "bg-yellow-100 text-yellow-800",
  Shopee: "bg-orange-100 text-orange-700",
  Magalu: "bg-blue-100 text-blue-700",
  Amazon: "bg-amber-100 text-amber-700",
  Olist: "bg-purple-100 text-purple-700",
  "Loja própria": "bg-emerald-100 text-emerald-700",
  Outros: "bg-slate-100 text-slate-600",
};

type DatePreset = "today" | "7d" | "30d" | "custom";

type OrderRow = {
  tinyId: number;
  numeroPedido: number | null;
  dataCriacao: string | null;
  dataPrevista: string | null;
  cliente: string | null;
  canal: string;
  situacao: number;
  situacaoDescricao: string;
  valor: number;
  valorFrete: number;
  valorLiquido: number;
  itensQuantidade: number;
  primeiraImagem: string | null;
  notaFiscal: string | null;
  marketplaceOrder: string | null;
};

type OrdersResponse = {
  orders: OrderRow[];
  pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
  metrics: {
    totalPedidos: number;
    totalBruto: number;
    totalFrete: number;
    totalLiquido: number;
    ticketMedio: number;
  };
  statusCounts: Record<string, number>;
  canaisDisponiveis: string[];
  warnings?: string[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (value: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : "—";

function useDebounce<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [metrics, setMetrics] = useState<OrdersResponse["metrics"]>({
    totalPedidos: 0,
    totalBruto: 0,
    totalFrete: 0,
    totalLiquido: 0,
    ticketMedio: 0,
  });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [channels, setChannels] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pageMeta, setPageMeta] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset>("7d");
  const [dateRange, setDateRange] = useState({
    start: isoDaysAgo(6),
    end: todayIso(),
  });
  const [sort, setSort] = useState<{ by: "data_criacao" | "valor" | "valor_frete"; dir: "asc" | "desc" }>({
    by: "data_criacao",
    dir: "desc",
  });

  const resetPage = () => setPage(1);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sortBy", sort.by);
      params.set("sortDir", sort.dir);
      params.set("dataInicial", dateRange.start);
      params.set("dataFinal", dateRange.end);
      if (selectedStatuses.length) params.set("situacoes", selectedStatuses.join(","));
      if (selectedChannels.length) params.set("canais", selectedChannels.join(","));
      if (debouncedSearch) params.set("search", debouncedSearch);

      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as OrdersResponse;
      if (!response.ok) {
        throw new Error((json as any)?.details ?? "Erro ao carregar pedidos");
      }

      setOrders(json.orders);
      setMetrics(json.metrics);
      setStatusCounts(json.statusCounts || {});
      setChannels(json.canaisDisponiveis || []);
      setPageMeta({ total: json.pageInfo.total, totalPages: json.pageInfo.totalPages });
      if (json.pageInfo.page !== page) setPage(json.pageInfo.page);
      if (json.pageInfo.pageSize !== pageSize) setPageSize(json.pageInfo.pageSize);
      if (json.warnings?.includes('orders_metrics_function_missing')) {
        setWarning('Execute a migração 010_create_orders_metrics_function.sql (supabase db push) para habilitar os indicadores completos desta página.');
      } else {
        setWarning(null);
      }
    } catch (err: any) {
      setError(err?.message ?? "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, selectedStatuses, selectedChannels, dateRange, sort]);

  const statusOptions = useMemo(
    () =>
      STATUS_CONFIG.filter((status) => status.codigo >= 0).map((status) => ({
        value: status.codigo,
        label: status.label,
      })),
    []
  );

  const channelOptions = useMemo(
    () => channels.map((canal) => ({ value: canal, label: canal })),
    [channels]
  );

  const quickRanges: Array<{ preset: DatePreset; label: string; start: string; end: string }> = [
    { preset: "today", label: "Hoje", start: todayIso(), end: todayIso() },
    { preset: "7d", label: "7 dias", start: isoDaysAgo(6), end: todayIso() },
    { preset: "30d", label: "30 dias", start: isoDaysAgo(29), end: todayIso() },
  ];

  const handleQuickRange = (preset: DatePreset, start: string, end: string) => {
    setDatePreset(preset);
    setDateRange({ start, end });
    resetPage();
  };

  const toggleStatusTab = (codigo: number) => {
    setSelectedStatuses((prev) => {
      if (prev.length === 1 && prev[0] === codigo) return [];
      return [codigo];
    });
    resetPage();
  };

  const onSort = (field: "data_criacao" | "valor" | "valor_frete") => {
    setSort((prev) => ({
      by: field,
      dir: prev.by === field && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  const changePage = (direction: -1 | 1) => {
    setPage((prev) => Math.min(Math.max(1, prev + direction), pageMeta.totalPages));
  };

  return (
    <AppLayout title="Pedidos">
      <div className="space-y-8 pb-10">
        <section className="rounded-[36px] bg-gradient-to-r from-sky-50 via-indigo-50 to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-900 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.15)] relative overflow-hidden">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">Painel diário</p>
              <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Pedidos sincronizados</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {pageMeta.total.toLocaleString("pt-BR") || "0"} pedidos encontrados para o intervalo selecionado.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={fetchOrders}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 dark:border-white/20 bg-white/80 dark:bg-white/10 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-white shadow-sm"
              >
                <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar lista
              </button>
              <a
                href="https://erp.tiny.com.br/vendas#list"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-[var(--accent)]/30"
              >
                <ExternalLink className="w-4 h-4" /> Ver no Tiny
              </a>
            </div>
          </div>

          {warning && (
            <div className="mt-6 flex items-start gap-2 rounded-3xl border border-amber-200/60 bg-white/70 px-4 py-3 text-sm text-amber-700 shadow-sm">
              <Filter className="w-4 h-4 mt-0.5" />
              <p>{warning}</p>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Faturamento bruto" value={formatCurrency(metrics.totalBruto)} helper="Receita no período" icon={<CalendarDays className="w-4 h-4" />} />
            <SummaryCard label="Ticket médio" value={formatCurrency(metrics.ticketMedio)} helper="Baseado nos filtros" icon={<Filter className="w-4 h-4" />} />
            <SummaryCard label="Frete" value={formatCurrency(metrics.totalFrete)} helper="Somatório de fretes" icon={<Truck className="w-4 h-4" />} />
            <SummaryCard label="Pedidos" value={metrics.totalPedidos.toLocaleString("pt-BR") || "0"} helper="Registros encontrados" icon={<CheckCircle2 className="w-4 h-4" />} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-[32px] bg-white/90 dark:bg-slate-900/70 border border-white/50 dark:border-white/10 p-6 shadow-[0_25px_60px_rgba(15,23,42,0.12)] space-y-6">
            <FilterGroup label="Buscar pedido, cliente ou canal">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="app-input pl-9"
                  placeholder="Ex: 251121B59 ou Shopee"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    resetPage();
                  }}
                />
              </div>
            </FilterGroup>

            <FilterGroup label="Períodos rápidos">
              <div className="flex flex-wrap gap-2">
                {quickRanges.map((range) => (
                  <button
                    key={range.preset}
                    onClick={() => handleQuickRange(range.preset, range.start, range.end)}
                    className={`flex-1 min-w-[90px] rounded-2xl px-3 py-1.5 text-xs font-semibold transition ${
                      datePreset === range.preset
                        ? "bg-[var(--accent)] text-white shadow"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="Período manual">
              <div className="flex flex-col gap-3">
                <input
                  type="date"
                  className="app-input"
                  value={dateRange.start}
                  onChange={(event) => {
                    setDatePreset("custom");
                    setDateRange((prev) => ({ ...prev, start: event.target.value }));
                    resetPage();
                  }}
                />
                <input
                  type="date"
                  className="app-input"
                  value={dateRange.end}
                  onChange={(event) => {
                    setDatePreset("custom");
                    setDateRange((prev) => ({ ...prev, end: event.target.value }));
                    resetPage();
                  }}
                />
              </div>
            </FilterGroup>

            <FilterGroup label="Status Tiny">
              <MultiSelectDropdown
                label="Status"
                options={statusOptions}
                selected={selectedStatuses}
                onChange={(values) => {
                  setSelectedStatuses(values as number[]);
                  resetPage();
                }}
                onClear={() => {
                  setSelectedStatuses([]);
                  resetPage();
                }}
              />
            </FilterGroup>

            <FilterGroup label="Canal">
              <MultiSelectDropdown
                label="Canais"
                options={channelOptions}
                selected={selectedChannels}
                onChange={(values) => {
                  setSelectedChannels(values as string[]);
                  resetPage();
                }}
                onClear={() => {
                  setSelectedChannels([]);
                  resetPage();
                }}
                displayFormatter={(values) => (values.length ? `${values.length} selecionado(s)` : "Todos")}
              />
            </FilterGroup>
          </aside>

          <div className="space-y-4">
            <div className="rounded-[32px] bg-white/90 dark:bg-slate-900/70 border border-white/30 dark:border-white/5 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Fila por status</p>
                  <p className="text-lg font-semibold text-[var(--text-main)]">Trilhas ativas no Tiny ERP</p>
                </div>
                <div className="text-xs text-muted">Ordenação atual: {sort.by === "valor" ? "Valor total" : sort.by === "valor_frete" ? "Frete" : "Data"}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {STATUS_CONFIG.filter((status) => status.codigo >= 0).map((status) => {
                  const count = statusCounts[String(status.codigo)] ?? 0;
                  const active = selectedStatuses.length === 1 && selectedStatuses[0] === status.codigo;
                  return (
                    <button
                      key={status.codigo}
                      onClick={() => toggleStatusTab(status.codigo)}
                      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition border ${
                        active
                          ? "bg-[var(--accent)] text-white border-transparent shadow"
                          : "border-slate-200 text-slate-600 hover:border-[var(--accent)]"
                      }`}
                    >
                      <span>{status.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-700">
                        {count.toLocaleString("pt-BR")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[36px] bg-white dark:bg-slate-900 border border-white/60 dark:border-white/10 overflow-hidden shadow-[0_35px_80px_rgba(15,23,42,0.18)]">
              <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                <div className="px-6 py-4 flex items-center gap-2">
                  Pedido / Cliente
                  <button onClick={() => onSort("data_criacao")}>
                    <ArrowUpDown className={`w-4 h-4 ${sort.by === "data_criacao" ? "text-[var(--accent)]" : "text-slate-400"}`} />
                  </button>
                </div>
                <div className="px-6 py-4">Status</div>
                <div className="px-6 py-4">Canal</div>
                <div className="px-6 py-4 flex items-center gap-2">
                  Frete
                  <button onClick={() => onSort("valor_frete")}>
                    <ArrowUpDown className={`w-4 h-4 ${sort.by === "valor_frete" ? "text-[var(--accent)]" : "text-slate-400"}`} />
                  </button>
                </div>
                <div className="px-6 py-4 flex items-center gap-2">
                  Total
                  <button onClick={() => onSort("valor")}>
                    <ArrowUpDown className={`w-4 h-4 ${sort.by === "valor" ? "text-[var(--accent)]" : "text-slate-400"}`} />
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && (
                  <div className="flex items-center justify-center py-16 text-muted text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando pedidos...
                  </div>
                )}

                {!loading && !orders.length && (
                  <div className="text-center py-16 text-muted text-sm">Nenhum pedido encontrado com os filtros atuais.</div>
                )}

                {!loading &&
                  orders.map((order) => {
                    const status = STATUS_CONFIG.find((cfg) => cfg.codigo === order.situacao);
                    const channelColor = CHANNEL_COLORS[order.canal] ?? "bg-slate-100 text-slate-600";
                    return (
                      <article key={order.tinyId} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center text-sm">
                        <div className="px-6 py-4 space-y-1">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-white/70 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                              {order.primeiraImagem ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={order.primeiraImagem} alt="Produto" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs text-muted">{order.itensQuantidade || 0} itens</span>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--text-main)] flex items-center gap-2">
                                #{order.numeroPedido ?? order.tinyId}
                                <a
                                  href={`https://erp.tiny.com.br/pedido/${order.tinyId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--accent)] hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </p>
                              <p className="text-xs text-muted">
                                {order.cliente || "Cliente não informado"} · Criado em {formatDate(order.dataCriacao)}
                              </p>
                              {order.marketplaceOrder && <p className="text-[11px] text-muted">Pedido marketplace: {order.marketplaceOrder}</p>}
                            </div>
                          </div>
                        </div>

                        <div className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold ${
                              status ? `${status.bg} ${status.color}` : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {status?.label ?? order.situacaoDescricao}
                          </span>
                          {order.dataPrevista && (
                            <p className="text-[11px] text-muted flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" /> Previsto {formatDate(order.dataPrevista)}
                            </p>
                          )}
                          {order.notaFiscal && (
                            <p className="text-[11px] text-muted flex items-center gap-1">
                              NF {order.notaFiscal}
                            </p>
                          )}
                        </div>

                        <div className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${channelColor}`}>
                            {order.canal}
                          </span>
                        </div>

                        <div className="px-6 py-4 font-semibold text-[var(--text-main)]">
                          <p>{formatCurrency(order.valorFrete)}</p>
                          <p className="text-[11px] text-muted">Líquido: {formatCurrency(order.valorLiquido)}</p>
                        </div>

                        <div className="px-6 py-4 font-semibold text-[var(--text-main)]">
                          <p>{formatCurrency(order.valor)}</p>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </div>

            {error && (
              <div className="text-sm text-rose-500 bg-rose-50/90 dark:bg-rose-500/10 border border-rose-200/60 rounded-2xl px-4 py-3">
                {error}
              </div>
            )}

            <footer className="rounded-[32px] bg-white/90 dark:bg-slate-900/70 border border-white/40 dark:border-white/10 px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-xs text-muted">
                Exibindo {(orders.length && (page - 1) * pageSize + 1) || 0}–
                {(page - 1) * pageSize + orders.length} de {pageMeta.total} pedidos
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changePage(-1)}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-full border text-xs font-semibold disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-xs font-semibold text-muted">
                  Página {page} de {pageMeta.totalPages}
                </span>
                <button
                  onClick={() => changePage(1)}
                  disabled={page >= pageMeta.totalPages}
                  className="px-4 py-2 rounded-full border text-xs font-semibold disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function SummaryCard({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 p-4 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">{label}</p>
        <span className="text-[var(--accent)]">{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-[var(--text-main)]">{value}</p>
      <p className="text-[11px] text-muted">{helper}</p>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.3em] text-muted font-semibold">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}