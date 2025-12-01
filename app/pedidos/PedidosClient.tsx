"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { staleWhileRevalidate } from "@/lib/staleCache";

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

type DatePreset = "today" | "7d" | "30d" | "month" | "custom";

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

type OrdersErrorResponse = {
  details?: string;
  message?: string;
  error?: string;
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return "";
};

const PEDIDOS_FILTERS_STORAGE_KEY = "tiny_pedidos_filters_v1";
const ORDERS_CACHE_TTL_MS = 60_000;
const startOfCurrentMonthIso = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.toISOString().slice(0, 10);
};

const buildOrdersCacheKey = (params: URLSearchParams) => `orders:${params.toString()}`;

function useDebounce<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export default function PedidosClient() {
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
  const [sort, setSort] = useState<{ by: "numero_pedido" | "data_criacao" | "valor" | "valor_frete"; dir: "asc" | "desc" }>({
    by: "numero_pedido",
    dir: "desc",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const ordersRequestId = useRef(0);

  const resetPage = () => setPage(1);

  const fetchOrders = async () => {
    const requestId = ++ordersRequestId.current;
    setLoading(true);
    setError(null);

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

    const cacheKey = buildOrdersCacheKey(params);

    const applyResponse = (json: OrdersResponse) => {
      if (ordersRequestId.current !== requestId) return;
      setOrders(json.orders);
      setMetrics(json.metrics);
      setStatusCounts(json.statusCounts || {});
      setChannels(json.canaisDisponiveis || []);
      setPageMeta({ total: json.pageInfo.total, totalPages: json.pageInfo.totalPages });
      if (json.pageInfo.page !== page) setPage(json.pageInfo.page);
      if (json.pageInfo.pageSize !== pageSize) setPageSize(json.pageInfo.pageSize);
      if (json.warnings?.includes("orders_metrics_function_missing")) {
        setWarning('Execute a migração 010_create_orders_metrics_function.sql (supabase db push) para habilitar os indicadores completos desta página.');
      } else {
        setWarning(null);
      }
    };

    try {
      const { data } = await staleWhileRevalidate<OrdersResponse>({
        key: cacheKey,
        ttlMs: ORDERS_CACHE_TTL_MS,
        fetcher: async () => {
          const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
          const json = (await response.json()) as OrdersResponse | OrdersErrorResponse;
          if (!response.ok) {
            const errorPayload = json as OrdersErrorResponse;
            const errorMessage = errorPayload.details || errorPayload.error || errorPayload.message || "Erro ao carregar pedidos";
            throw new Error(errorMessage);
          }
          return json as OrdersResponse;
        },
        onUpdate: (fresh) => applyResponse(fresh),
      });
      applyResponse(data);
    } catch (error) {
      if (ordersRequestId.current === requestId) {
        setError(getErrorMessage(error) || "Erro desconhecido");
      }
    } finally {
      if (ordersRequestId.current === requestId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evita recriar fetchOrders a cada render
  }, [page, pageSize, debouncedSearch, selectedStatuses, selectedChannels, dateRange, sort]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PEDIDOS_FILTERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.search === "string") setSearch(parsed.search);
        if (Array.isArray(parsed.selectedStatuses)) setSelectedStatuses(parsed.selectedStatuses);
        if (Array.isArray(parsed.selectedChannels)) setSelectedChannels(parsed.selectedChannels);
        if (parsed.datePreset === "today" || parsed.datePreset === "7d" || parsed.datePreset === "30d" || parsed.datePreset === "month" || parsed.datePreset === "custom") {
          setDatePreset(parsed.datePreset);
        }
        if (parsed.dateRange?.start && parsed.dateRange?.end) {
          setDateRange({ start: parsed.dateRange.start, end: parsed.dateRange.end });
        } else if (parsed.datePreset === "month") {
          setDateRange({ start: startOfCurrentMonthIso(), end: todayIso() });
        }
        if (parsed.sort?.by && parsed.sort?.dir) {
          setSort(parsed.sort);
        }
        if (typeof parsed.pageSize === "number") setPageSize(parsed.pageSize);
      }
    } catch {
      // ignore parse errors
    } finally {
      setFiltersLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!filtersLoaded || typeof window === "undefined") return;
    const toStore = {
      search,
      selectedStatuses,
      selectedChannels,
      datePreset,
      dateRange,
      sort,
      pageSize,
    };
    try {
      window.localStorage.setItem(PEDIDOS_FILTERS_STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      // ignore write errors
    }
  }, [filtersLoaded, search, selectedStatuses, selectedChannels, datePreset, dateRange, sort, pageSize]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1024px)");
    const handler = (event: MediaQueryListEvent) => {
      setShowFilters(!event.matches);
    };
    setShowFilters(!mq.matches);
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

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
    { preset: "month", label: "Mês atual", start: startOfCurrentMonthIso(), end: todayIso() },
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

  const onSort = (field: "numero_pedido" | "data_criacao" | "valor" | "valor_frete") => {
    setSort((prev) => ({
      by: field,
      dir: prev.by === field && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  const changePage = (direction: -1 | 1) => {
    setPage((prev) => Math.min(Math.max(1, prev + direction), pageMeta.totalPages));
  };

  const filtersPanel = (
    <>
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
        <div className="flex gap-2 overflow-x-auto flex-nowrap pb-1">
          {quickRanges.map((range) => (
            <button
              key={range.preset}
              onClick={() => handleQuickRange(range.preset, range.start, range.end)}
              className={`flex-none min-w-[90px] max-w-[180px] rounded-2xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap overflow-hidden text-ellipsis ${
                datePreset === range.preset
                  ? "bg-[var(--accent)] text-white"
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
    </>
  );

  return (
    <div className="space-y-8 pb-16 max-w-[1440px] mx-auto px-4 lg:px-8">
      <section className="rounded-[38px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6 md:p-8 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40 bg-gradient-to-br from-[#fff9fe] via-transparent to-[#e0e0dd]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">Painel diário</p>
            <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Pedidos sincronizados</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {pageMeta.total.toLocaleString("pt-BR") || "0"} pedidos encontrados para o intervalo selecionado.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchOrders}
              className="inline-flex items-center gap-2 rounded-full border border-white/70 dark:border-white/20 bg-white/80 dark:bg-white/5 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-white"
            >
              <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar lista
            </button>
            <a
              href="https://erp.tiny.com.br/vendas#list"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-4 py-2 text-sm font-semibold"
            >
              <ExternalLink className="w-4 h-4" /> Ver no Tiny
            </a>
          </div>
        </div>

        {warning && (
          <div className="relative mt-6 flex items-start gap-2 rounded-3xl border border-amber-200/60 bg-white/70 px-4 py-3 text-sm text-amber-700">
            <Filter className="w-4 h-4 mt-0.5" />
            <p>{warning}</p>
          </div>
        )}

        <div className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Faturamento bruto" value={formatCurrency(metrics.totalBruto)} helper="Receita no período" icon={<CalendarDays className="w-4 h-4" />} />
          <SummaryCard label="Ticket médio" value={formatCurrency(metrics.ticketMedio)} helper="Baseado nos filtros" icon={<Filter className="w-4 h-4" />} />
          <SummaryCard label="Frete" value={formatCurrency(metrics.totalFrete)} helper="Somatório de fretes" icon={<Truck className="w-4 h-4" />} />
          <SummaryCard label="Pedidos" value={metrics.totalPedidos.toLocaleString("pt-BR") || "0"} helper="Registros encontrados" icon={<CheckCircle2 className="w-4 h-4" />} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="lg:hidden space-y-3">
          <button
            onClick={() => setShowFilters((open) => !open)}
            className="w-full flex items-center justify-between rounded-3xl glass-panel glass-tint border border-white/60 dark:border-white/10 px-4 py-3 text-sm font-semibold"
          >
            Filtros e período
            <span className="text-xs text-muted">{showFilters ? "Ocultar" : "Exibir"}</span>
          </button>
          {showFilters && (
            <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 space-y-6">
              {filtersPanel}
            </div>
          )}
        </div>

        <aside className="hidden lg:block rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6 space-y-6">
          {filtersPanel}
        </aside>

        <div className="space-y-4">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted">Fila por status</p>
                <p className="text-lg font-semibold text-[var(--text-main)]">Trilhas ativas no Tiny ERP</p>
              </div>
              <div className="text-xs text-muted">
                Ordenação atual: {sort.by === "valor"
                  ? "Valor total"
                  : sort.by === "valor_frete"
                  ? "Frete"
                  : sort.by === "data_criacao"
                  ? "Data"
                  : "Número do pedido"}
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto flex-nowrap pb-1">
              {STATUS_CONFIG.filter((status) => status.codigo >= 0).map((status) => {
                const count = statusCounts[String(status.codigo)] ?? 0;
                const active = selectedStatuses.length === 1 && selectedStatuses[0] === status.codigo;
                return (
                  <button
                    key={status.codigo}
                    onClick={() => toggleStatusTab(status.codigo)}
                    className={`flex-none max-w-[220px] items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition border whitespace-nowrap overflow-hidden text-ellipsis ${
                      active
                        ? "bg-[var(--accent)] text-white border-transparent"
                        : "border-slate-200 text-slate-600 hover:border-[var(--accent)]"
                    }`}
                  >
                    <span className="truncate">{status.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-700">
                      {count.toLocaleString("pt-BR")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando pedidos...
              </div>
            ) : !orders.length ? (
              <div className="text-center py-16 text-muted text-sm">Nenhum pedido encontrado com os filtros atuais.</div>
            ) : (
              <>
                <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] bg-white/70 dark:bg-slate-800/70 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
                  <div className="px-6 py-4 flex items-center gap-2">
                    Pedido / Cliente
                    <button onClick={() => onSort("numero_pedido")}>
                      <ArrowUpDown className={`w-4 h-4 ${sort.by === "numero_pedido" ? "text-[var(--accent)]" : "text-slate-400"}`} />
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

                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {orders.map((order) => (
                    <OrderMobileCard key={order.tinyId} order={order} />
                  ))}
                </div>

                <div className="hidden md:block divide-y divide-slate-100 dark:divide-slate-800">
                  {orders.map((order) => (
                    <OrderDesktopRow key={order.tinyId} order={order} />
                  ))}
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="text-sm text-rose-500 bg-rose-50/90 dark:bg-rose-500/10 border border-rose-200/60 rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

          <footer className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
  );
}

type OrderCardProps = {
  order: OrderRow;
};

const OrderMobileCard = memo(function OrderMobileCard({ order }: OrderCardProps) {
  const status = STATUS_CONFIG.find((cfg) => cfg.codigo === order.situacao);
  const channelColor = CHANNEL_COLORS[order.canal] ?? "bg-slate-100 text-slate-600";

  return (
    <article className="glass-panel glass-tint p-4 flex flex-col gap-3 rounded-3xl border border-white/60 dark:border-white/10">
      <div className="flex items-start gap-3">
        <div className="relative w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-white/70 dark:border-slate-700 flex items-center justify-center">
          {order.primeiraImagem ? (
            <>
              <div className="w-full h-full rounded-2xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.primeiraImagem} alt="Produto" className="w-full h-full object-cover rounded-2xl" />
              </div>
              {(order.itensQuantidade ?? 0) > 1 && (
                <span className="absolute top-0 right-0 translate-x-2 -translate-y-1/2 bg-white text-[var(--accent)] border border-[var(--accent)] rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ zIndex: 50 }}>
                  +{(order.itensQuantidade ?? 0) - 1}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted">{order.itensQuantidade ?? 0} itens</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text-main)] truncate flex items-center gap-2">
                #{order.numeroPedido ?? order.tinyId}
                <a
                  href={`https://erp.tiny.com.br/vendas#edit/${order.tinyId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] hover:underline shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <p className="text-[11px] text-muted truncate">
                {order.cliente || "Cliente não informado"} · {formatDate(order.dataCriacao)}
              </p>
              {order.marketplaceOrder && <p className="text-[11px] text-muted truncate">Marketplace: {order.marketplaceOrder}</p>}
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${status ? `${status.bg} ${status.color}` : "bg-slate-100 text-slate-600"}`}>
              {status?.label ?? order.situacaoDescricao}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/30 dark:bg-white/5 px-3 py-2">
          <p className="uppercase tracking-[0.15em] text-[10px] text-muted">Total</p>
          <p className="font-semibold text-[var(--text-main)]">{formatCurrency(order.valor)}</p>
        </div>
        <div className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/30 dark:bg-white/5 px-3 py-2">
          <p className="uppercase tracking-[0.15em] text-[10px] text-muted">Frete</p>
            <p className="font-semibold text-[var(--text-main)]">{formatCurrency(order.valorFrete)}</p>
            <p className="text-[11px] text-muted">Líquido: {formatCurrency(order.valorLiquido)}</p>
        </div>
        <div className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/30 dark:bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${channelColor}`}>
            {order.canal}
          </span>
          {order.itensQuantidade ? <span className="text-[10px] text-muted">{order.itensQuantidade} itens</span> : null}
        </div>
        <div className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/30 dark:bg-white/5 px-3 py-2">
          {order.dataPrevista && (
            <p className="text-[11px] text-muted flex items-center gap-1">
              <Clock className="w-3 h-3" /> Previsto {formatDate(order.dataPrevista)}
            </p>
          )}
          {order.notaFiscal && (
            <p className="text-[11px] text-muted flex items-center gap-1 mt-1">
              NF {order.notaFiscal}
            </p>
          )}
          {!order.dataPrevista && !order.notaFiscal && <p className="text-[11px] text-muted">Sem previsão disponível</p>}
        </div>
      </div>
    </article>
  );
});

const OrderDesktopRow = memo(function OrderDesktopRow({ order }: OrderCardProps) {
  const status = STATUS_CONFIG.find((cfg) => cfg.codigo === order.situacao);
  const channelColor = CHANNEL_COLORS[order.canal] ?? "bg-slate-100 text-slate-600";

  return (
    <article className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center text-sm hover:bg-white/70 dark:hover:bg-slate-800/60 transition">
      <div className="px-6 py-4 space-y-1">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-white/70 dark:border-slate-700 flex items-center justify-center">
            {order.primeiraImagem ? (
              <>
                <div className="w-full h-full rounded-2xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={order.primeiraImagem} alt="Produto" className="w-full h-full object-cover rounded-2xl" />
                </div>
                {(order.itensQuantidade ?? 0) > 1 && (
                  <span className="absolute top-0 right-0 translate-x-2 -translate-y-1/2 bg-white text-[var(--accent)] border border-[var(--accent)] rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ zIndex: 50 }}>
                    +{(order.itensQuantidade ?? 0) - 1}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted">{order.itensQuantidade ?? 0} itens</span>
            )}
          </div>
          <div>
            <p className="font-semibold text-[var(--text-main)] flex items-center gap-2">
              #{order.numeroPedido ?? order.tinyId}
              <a
                href={`https://erp.tiny.com.br/vendas#edit/${order.tinyId}`}
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
});

function SummaryCard({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: ReactNode }) {
  return (
    <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 px-5 py-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500 dark:text-slate-300">{label}</p>
        <span className="text-[var(--accent)] bg-[var(--accent)]/12 rounded-full p-2">{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-[var(--text-main)] leading-tight">{value}</p>
      <p className="text-[12px] text-muted">{helper}</p>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.3em] text-muted font-semibold">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
