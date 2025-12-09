"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  AlertCircle,
  BarChart2,
  CalendarDays,
  CheckCircle2,
  Cloud,
  Info,
  PackageCheck,
  Percent,
  RefreshCcw,
  Search,
  ShoppingBag,
  Truck,
  TruckIcon,
  Wallet,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import type { MeliOrder } from "@/src/types/mercadoLivre";
import { chartColors, chartDefaults } from "@/components/charts/chartTheme";

type MeliOrderDb = MeliOrder & {
  buyer_full_name?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
};

type MeliOrdersApiSuccess = {
  ok: true;
  data: {
    orders: Array<MeliOrder>;
    hasMore: boolean;
    nextCursor?: string;
  };
  meta: {
    timeFrom: string;
    timeTo: string;
    status?: string | null;
    mock?: boolean;
    source?: string | null;
  };
};

type MeliOrdersApiError = {
  ok: false;
  error: { message: string; code?: string };
};

const PERIOD_OPTIONS = [
  { label: "3 dias", days: 3 },
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "180 dias", days: 180 },
] as const;

const STATUS_OPTIONS = [
  { label: "Todos", value: "ALL" },
  { label: "paid", value: "paid" },
  { label: "ready_to_ship", value: "ready_to_ship" },
  { label: "shipped", value: "shipped" },
  { label: "delivered", value: "delivered" },
  { label: "cancelled", value: "cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-100/80 text-emerald-700",
  ready_to_ship: "bg-amber-100/80 text-amber-700",
  shipped: "bg-sky-100/80 text-sky-700",
  delivered: "bg-indigo-100/80 text-indigo-700",
  cancelled: "bg-rose-100/80 text-rose-700",
};

const STATUS_HEX: Record<string, string> = {
  paid: "#10b981",
  ready_to_ship: "#f59e0b",
  shipped: "#0ea5e9",
  delivered: "#6366f1",
  cancelled: "#f87171",
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

type Metrics = ReturnType<typeof buildMetricsFromOrders>;

export default function MercadoLivrePage() {
  const [periodDays, setPeriodDays] = useState<number>(3);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [orders, setOrders] = useState<MeliOrder[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const requestIdRef = useRef(0);

  const metrics: Metrics = useMemo(() => buildMetricsFromOrders(orders), [orders]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const term = searchTerm.toLowerCase();
    return orders.filter(
      (o) =>
        String(o.id).toLowerCase().includes(term) ||
        o.buyer?.nickname?.toLowerCase().includes(term) ||
        (o.shipping?.receiver_address?.city?.name?.toLowerCase().includes(term) ?? false)
    );
  }, [orders, searchTerm]);

  const fetchOrders = useCallback(
    async (opts?: { cursor?: string; append?: boolean }) => {
      const requestId = ++requestIdRef.current;
      if (opts?.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      setNotConfigured(false);
      setSource(null);

      try {
        const params = new URLSearchParams();
        params.set("periodDays", String(periodDays));
        params.set("pageSize", "50");
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        if (opts?.cursor) params.set("cursor", opts.cursor);

        const res = await fetch(`/api/marketplaces/mercado-livre/orders/db?${params.toString()}`, {
          cache: "no-store",
        });
        const text = await res.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(
            text?.toLowerCase().includes("<!doctype") || text?.toLowerCase().includes("<html")
              ? "O Mercado Livre retornou HTML em vez de JSON (possível login/erro interno)."
              : `Resposta inválida do Mercado Livre: ${text?.slice(0, 120) ?? "desconhecida"}`
          );
        }
        const isSuccess = (data: unknown): data is MeliOrdersApiSuccess =>
          typeof data === "object" && data !== null && (data as { ok?: unknown }).ok === true;
        const isError = (data: unknown): data is MeliOrdersApiError =>
          typeof data === "object" && data !== null && (data as { ok?: unknown }).ok === false;
        const json = parsed as MeliOrdersApiSuccess | MeliOrdersApiError;

        if (requestId !== requestIdRef.current) return;

        if (!res.ok || !isSuccess(json)) {
          if (isError(json) && json.error?.code === "ML_NOT_CONFIGURED") {
            setNotConfigured(true);
            setOrders([]);
            setHasMore(false);
            setNextCursor(undefined);
            setIsMockMode(false);
            setLastUpdated(null);
            return;
          }
          const message = !res.ok
            ? `Erro ${res.status}: ${res.statusText || "falha ao buscar pedidos"}`
            : (isError(json) && json.error?.message) || "Erro ao buscar pedidos do Mercado Livre.";
          throw new Error(message);
        }

        const payload = json.data;
        const normalizedOrders = (payload.orders ?? []).map((order) => {
          const dbOrder = order as MeliOrderDb;
          return {
            ...order,
            buyer_full_name: dbOrder.buyer_full_name ?? null,
            shipping_city: dbOrder.shipping_city,
            shipping_state: dbOrder.shipping_state,
            order_items: Array.isArray(dbOrder.order_items) ? dbOrder.order_items : [],
            total_amount: Number((dbOrder as { total_amount?: number | string }).total_amount ?? 0),
            coverImageUrl: (
              dbOrder.order_items?.find(
                (it) => (it as { item_thumbnail_url?: string | null }).item_thumbnail_url
              ) as { item_thumbnail_url?: string | null } | undefined
            )?.item_thumbnail_url ?? null,
          };
        });
        setOrders((prev) => (opts?.append ? [...prev, ...normalizedOrders] : normalizedOrders));
        setHasMore(payload.hasMore);
        setNextCursor(payload.nextCursor);
        setIsMockMode(Boolean((json as MeliOrdersApiSuccess).meta.mock));
        setSource((json as MeliOrdersApiSuccess).meta.source ?? null);
        setLastUpdated(Date.now());
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        const message = err instanceof Error ? err.message : "Erro ao carregar pedidos do Mercado Livre.";
        setError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [periodDays, statusFilter]
  );

  useEffect(() => {
    setOrders([]);
    setNextCursor(undefined);
    fetchOrders();
  }, [fetchOrders]);

  return (
    <AppLayout title="Mercado Livre">
      <div className="space-y-6 pb-12">
        <MeliHeaderSection
          periodDays={periodDays}
          setPeriodDays={setPeriodDays}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          loading={loading}
          onRefresh={() => fetchOrders()}
          isMockMode={isMockMode}
          lastUpdated={lastUpdated}
          notConfigured={notConfigured}
          totalOrders={orders.length}
          source={source}
        />

        <MeliSummaryPanel summaries={metrics.summary} loading={loading && orders.length === 0} />

        <MeliChartsSection metrics={metrics} loading={loading && orders.length === 0} />

        <MeliRankingsSection rankings={metrics.rankings} loading={loading && orders.length === 0} />

        <MeliOrdersSection
          orders={filteredOrders}
          totalOrders={orders.length}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          nextCursor={nextCursor}
          error={error}
          notConfigured={notConfigured}
          isMockMode={isMockMode}
          onRetry={() => fetchOrders()}
          onLoadMore={() => nextCursor && fetchOrders({ cursor: nextCursor, append: true })}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          expandedOrders={expandedOrders}
          setExpandedOrders={setExpandedOrders}
        />
      </div>
    </AppLayout>
  );
}

// Helpers
function buildMetricsFromOrders(orders: MeliOrder[]) {
  const totalPedidos = orders.length;
  const totalValor = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const itensVendidos = orders.reduce(
    (sum, order) =>
      sum +
      (order.order_items ?? []).reduce((acc, item) => acc + (Number(item.quantity) || 0), 0),
    0
  );
  const cancelados = orders.filter((o) => o.status === "cancelled").length;
  const pagos = orders.filter((o) => o.status === "paid").length;
  const ticketMedio = totalPedidos ? totalValor / totalPedidos : 0;
  const cancelRate = totalPedidos ? (cancelados / totalPedidos) * 100 : 0;

  // Using 'date_created' as the primary order date anchor for charts/timeline
  const perDay = orders.reduce<Record<string, { valor: number; pedidos: number; status: Record<string, number> }>>(
    (acc, order) => {
      const day = new Date(order.date_created).toLocaleDateString("pt-BR");
      if (!acc[day]) acc[day] = { valor: 0, pedidos: 0, status: {} };
      acc[day].valor += order.total_amount || 0;
      acc[day].pedidos += 1;
      acc[day].status[order.status] = (acc[day].status[order.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const dailySeries = Object.entries(perDay)
    .sort((a, b) => {
      const [da] = a;
      const [db] = b;
      const [dayA, monthA, yearA] = da.split("/").map(Number);
      const [dayB, monthB, yearB] = db.split("/").map(Number);
      return new Date(yearA + 2000, monthA - 1, dayA).getTime() - new Date(yearB + 2000, monthB - 1, dayB).getTime();
    })
    .map(([date, info]) => ({
      date,
      valor: Number(info.valor.toFixed(2)),
      pedidos: info.pedidos,
    }));

  // collect top 5 statuses for timeline
  const allStatuses = Array.from(new Set(orders.map((o) => o.status)));
  const topStatuses = allStatuses.slice(0, 6);
  const statusTimeline = Object.entries(perDay)
    .sort((a, b) => {
      const [da] = a;
      const [db] = b;
      const [dayA, monthA, yearA] = da.split("/").map(Number);
      const [dayB, monthB, yearB] = db.split("/").map(Number);
      return new Date(yearA + 2000, monthA - 1, dayA).getTime() - new Date(yearB + 2000, monthB - 1, dayB).getTime();
    })
    .map(([date, info]) => {
      const entry: Record<string, number | string> = { date };
      topStatuses.forEach((status) => {
        entry[status] = info.status[status] ?? 0;
      });
      return entry;
    });

  const statusCounts = orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {});
  const statusDistribution = Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      count,
      percent: totalPedidos ? Math.round((count / totalPedidos) * 100) : 0,
    }));

  // Rankings
  const productMap = new Map<string, { name: string; units: number; revenue: number; orders: number }>();
  orders.forEach((order) => {
    const seen = new Set<string>();
    (order.order_items ?? []).forEach((item) => {
      const key = item.item.id;
      const price = item.unit_price || 0;
      const prev =
        productMap.get(key) ?? {
          name: item.item.title,
          units: 0,
          revenue: 0,
          orders: 0,
        };
      prev.units += item.quantity || 0;
      prev.revenue += price * (item.quantity || 0);
      if (!seen.has(key)) {
        prev.orders += 1;
        seen.add(key);
      }
      productMap.set(key, prev);
    });
  });
  const products = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      units: p.units,
      revenue: Number(p.revenue.toFixed(2)),
      orders: p.orders,
      revenuePerc: totalValor ? Math.round((p.revenue / totalValor) * 100) : 0,
    }));

  const cityMap = new Map<string, { pedidos: number; valor: number }>();
  orders.forEach((order) => {
    const city = order.shipping?.receiver_address?.city?.name ?? "Cidade não informada";
    const state = order.shipping?.receiver_address?.state?.id ?? order.shipping?.receiver_address?.state?.name ?? "";
    const cityKey = `${city}${state ? ` - ${state}` : ""}`;
    const prev = cityMap.get(cityKey) ?? { pedidos: 0, valor: 0 };
    prev.pedidos += 1;
    prev.valor += order.total_amount || 0;
    cityMap.set(cityKey, prev);
  });
  const cities = Array.from(cityMap.entries())
    .sort((a, b) => b[1].valor - a[1].valor)
    .slice(0, 5)
    .map(([city, info]) => ({
      city,
      pedidos: info.pedidos,
      valor: Number(info.valor.toFixed(2)),
      percent: totalPedidos ? Math.round((info.pedidos / totalPedidos) * 100) : 0,
    }));

  const carrierMap = new Map<string, { pedidos: number; valor: number }>();
  orders.forEach((order) => {
    const carrier = order.shipping?.shipping_mode || String(order.shipping?.id ?? "Indefinido");
    const prev = carrierMap.get(carrier) ?? { pedidos: 0, valor: 0 };
    prev.pedidos += 1;
    prev.valor += order.total_amount || 0;
    carrierMap.set(carrier, prev);
  });
  const carriers = Array.from(carrierMap.entries())
    .sort((a, b) => b[1].pedidos - a[1].pedidos)
    .slice(0, 5)
    .map(([carrier, info]) => ({
      carrier,
      pedidos: info.pedidos,
      valor: Number(info.valor.toFixed(2)),
      percent: totalPedidos ? Math.round((info.pedidos / totalPedidos) * 100) : 0,
    }));

  const insights = buildInsights(orders, totalValor, cancelados, totalPedidos, carriers, cities);

  return {
    summary: {
      totalPedidos,
      totalValor,
      ticketMedio,
      totalItens: itensVendidos,
      cancelRate,
      pagos,
    },
    dailySeries,
    statusTimeline,
    statusDistribution,
    rankings: { products, cities, carriers },
    insights,
    topStatuses,
  };
}

function buildInsights(
  orders: MeliOrder[],
  totalValor: number,
  cancelados: number,
  totalPedidos: number,
  carriers: Array<{ carrier: string; pedidos: number }>,
  cities: Array<{ city: string; pedidos: number }>
) {
  if (!orders.length) return [];

  const maior = [...orders].sort((a, b) => Number(b.total_amount) - Number(a.total_amount))[0];
  const cancelPerc = totalPedidos ? Math.round((cancelados / totalPedidos) * 100) : 0;
  const topCarrier = carriers[0];
  const topCity = cities[0];

  return [
    {
      title: "Maior pedido",
      body: `${formatCurrency(Number(maior.total_amount) || 0)} · ${formatDate(maior.date_created)} (${maior.id})`,
      icon: Wallet,
    },
    {
      title: "Taxa de cancelamento",
      body: `${cancelPerc}% dos pedidos no período`,
      icon: Percent,
    },
    topCarrier && {
      title: "Envio mais usado",
      body: `${topCarrier.carrier} · ${topCarrier.pedidos} pedidos`,
      icon: TruckIcon,
    },
    topCity && {
      title: "Cidade/UF em destaque",
      body: `${topCity.city} · ${topCity.pedidos} pedidos`,
      icon: Info,
    },
    {
      title: "Volume total",
      body: `Faturamento somado: ${formatCurrency(totalValor)}`,
      icon: CheckCircle2,
    },
  ].filter(Boolean) as Array<{ title: string; body: string; icon: ComponentType<{ className?: string }> }>;
}

// Components
type HeaderProps = {
  periodDays: number;
  setPeriodDays: (days: number) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  loading: boolean;
  onRefresh: () => void;
  isMockMode: boolean;
  lastUpdated: number | null;
  notConfigured: boolean;
  totalOrders: number;
  source: string | null;
};

function MeliHeaderSection({
  periodDays,
  setPeriodDays,
  statusFilter,
  setStatusFilter,
  loading,
  onRefresh,
  isMockMode,
  lastUpdated,
  notConfigured,
  totalOrders,
  source,
}: HeaderProps) {
  const periodLabel = PERIOD_OPTIONS.find((p) => p.days === periodDays)?.label ?? `${periodDays} dias`;

  return (
    <header className="relative overflow-hidden rounded-[36px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl">
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">Visão geral dos pedidos e desempenho de vendas no Mercado Livre.</p>
          <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white">Mercado Livre</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-xs text-slate-700 dark:text-slate-200">
              <CalendarDays className="w-4 h-4" />
              {periodLabel}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-xs text-slate-700 dark:text-slate-200">
              <ShoppingBag className="w-4 h-4" />
              {totalOrders} pedidos carregados
            </span>
            {source && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-xs text-slate-700 dark:text-slate-200">
                <Cloud className="w-4 h-4" />
                Fonte: {source}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur ${
              notConfigured
                ? "border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                : "border-emerald-300/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
            }`}
          >
            {notConfigured ? "Integração pendente" : "Conectado (env vars)"}
          </span>
          {isMockMode && (
            <span className="rounded-full border border-amber-300/70 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-200 shadow-sm backdrop-blur">
              Modo demonstração (dados mock)
            </span>
          )}
        </div>
      </div>

      <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <div className="rounded-[18px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-3 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300">Período</p>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="app-input w-full pl-10 pr-8"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.days} value={option.days}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-[18px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-3 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300">Status</p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="app-input w-full"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-[18px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-3 flex items-center justify-center">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#009DA8] to-[#00B5C3] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#009DA8]/30 transition hover:shadow-xl hover:shadow-[#009DA8]/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="relative text-xs text-slate-500 dark:text-slate-400">
          Atualizado em {new Date(lastUpdated).toLocaleString("pt-BR")}
        </p>
      )}
    </header>
  );
}

type SummaryPanelProps = {
  summaries: Metrics["summary"];
  loading: boolean;
};

function MeliSummaryPanel({ summaries, loading }: SummaryPanelProps) {
  const cards = [
    { title: "Vendas (R$)", value: formatCurrency(summaries.totalValor), icon: Wallet, color: "text-[#009DA8] dark:text-[#00B5C3]" },
    { title: "Pedidos", value: summaries.totalPedidos.toString(), icon: ShoppingBag, color: "text-emerald-500 dark:text-emerald-400" },
    { title: "Ticket médio", value: summaries.totalPedidos ? formatCurrency(summaries.ticketMedio) : "—", icon: BarChart2, color: "text-amber-500 dark:text-amber-300" },
    { title: "Itens vendidos", value: summaries.totalItens.toString(), icon: PackageCheck, color: "text-indigo-500 dark:text-indigo-300" },
    { title: "Taxa de cancelamento", value: `${summaries.cancelRate.toFixed(1)}%`, icon: Percent, color: "text-rose-500 dark:text-rose-300" },
    { title: "Pedidos pagos", value: summaries.pagos.toString(), icon: CheckCircle2, color: "text-sky-500 dark:text-sky-300" },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((_, idx) => (
          <div key={idx} className="h-28 rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <SummaryCard key={card.title} title={card.title} value={card.value} icon={card.icon} colorClass={card.color} />
      ))}
    </section>
  );
}

function MeliChartsSection({ metrics, loading }: { metrics: Metrics; loading: boolean }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Tendência de vendas e pedidos</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Valor total x quantidade por dia</p>
          </div>
          <Wallet className="w-5 h-5 text-[#009DA8]" />
        </div>
        <div className="h-64">
          {loading ? (
            <div className="h-full rounded-2xl bg-white/60 dark:bg-slate-800/60 animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.dailySeries}>
                <defs>
                  <linearGradient id="meliValor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#009DA8" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#009DA8" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="meliPedidos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="valor"
                  stroke="#009DA8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="url(#meliValor)"
                  strokeWidth={1.75}
                  name="Vendas (R$)"
                />
                <Area
                  type="monotone"
                  dataKey="pedidos"
                  stroke="#f59e0b"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="url(#meliPedidos)"
                  strokeWidth={1.75}
                  name="Pedidos"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Status ao longo do tempo</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Volume diário por status</p>
          </div>
        </div>
        <div className="h-64">
          {loading ? (
            <div className="h-full rounded-2xl bg-white/60 dark:bg-slate-800/60 animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.statusTimeline} stackOffset="none">
                <defs>
                  {metrics.topStatuses.map((status) => (
                    <linearGradient key={status} id={`meli-${status}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={statusColor(status)} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={statusColor(status)} stopOpacity={0.05} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {metrics.topStatuses.map((status) => (
                  <Area
                    key={status}
                    type="monotone"
                    dataKey={status}
                    stackId="1"
                    stroke={statusColor(status)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill={`url(#meli-${status})`}
                    strokeWidth={1.75}
                    name={status}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

type RankingsSectionProps = {
  rankings: Metrics["rankings"];
  loading: boolean;
};

function MeliRankingsSection({ rankings, loading }: RankingsSectionProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <RankingCard
        title="Top produtos"
        subtitle="Itens mais vendidos (unidades)"
        icon={PackageCheck}
        loading={loading}
        headers={["Produto", "Unidades", "Faturamento", "% Fat."]}
        rows={rankings.products.map((p) => [p.name, p.units, formatCurrency(p.revenue), `${p.revenuePerc}%`])}
      />
      <RankingCard
        title="Top cidades/UF"
        subtitle="Destinos com mais pedidos"
        icon={Truck}
        loading={loading}
        headers={["Cidade/UF", "Pedidos", "Faturamento", "% Ped."]}
        rows={rankings.cities.map((c) => [c.city, c.pedidos, formatCurrency(c.valor), `${c.percent}%`])}
      />
      <RankingCard
        title="Transportadoras"
        subtitle="Uso por transportadora"
        icon={TruckIcon}
        loading={loading}
        headers={["Transportadora", "Pedidos", "% Ped.", "Valor"]}
        rows={rankings.carriers.map((c) => [c.carrier, c.pedidos, `${c.percent}%`, formatCurrency(c.valor)])}
      />
    </section>
  );
}

function RankingCard({
  title,
  subtitle,
  icon: Icon,
  loading,
  headers,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  loading: boolean;
  headers: string[];
  rows: Array<(string | number)[]>;
}) {
  return (
    <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <Icon className="w-5 h-5 text-[#009DA8]" />
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-6 rounded bg-white/60 dark:bg-slate-800/60 animate-pulse" />
          <div className="h-6 rounded bg-white/60 dark:bg-slate-800/60 animate-pulse" />
          <div className="h-6 rounded bg-white/60 dark:bg-slate-800/60 animate-pulse" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados suficientes.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-4 text-xs text-slate-500 dark:text-slate-400">
            {headers.map((h) => (
              <span key={h} className="truncate">
                {h}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-4 text-sm text-slate-800 dark:text-slate-100">
                {row.map((cell, cidx) => (
                  <span key={cidx} className="truncate">
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type OrdersSectionProps = {
  orders: MeliOrder[];
  totalOrders: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  nextCursor?: string;
  error: string | null;
  notConfigured: boolean;
  isMockMode: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  expandedOrders: Record<string, boolean>;
  setExpandedOrders: (value: Record<string, boolean>) => void;
};

function MeliOrdersSection({
  orders,
  totalOrders,
  loading,
  loadingMore,
  hasMore,
  nextCursor,
  error,
  notConfigured,
  isMockMode,
  onRetry,
  onLoadMore,
  searchTerm,
  setSearchTerm,
  expandedOrders,
  setExpandedOrders,
}: OrdersSectionProps) {
  const isInitialLoading = loading && totalOrders === 0;
  const friendlyError =
    error && (error.toLowerCase().includes("doctype") || error.toLowerCase().includes("html"))
      ? "O Mercado Livre retornou HTML (login ou erro interno) em vez de JSON. Verifique se o app está autorizado e se o token é válido."
      : error;
  const renderEmpty = !isInitialLoading && orders.length === 0 && !error && !notConfigured;

  return (
    <section className="glass-panel glass-tint border border-white/60 dark:border-white/10 rounded-[36px] shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Pedidos</h2>
          <p className="text-sm text-slate-500">Lista dos pedidos recentes do Mercado Livre</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="rounded-full bg-white/70 dark:bg-slate-800/60 px-3 py-1 border border-white/50 dark:border-slate-800/50">
            {orders.length} pedidos exibidos
          </span>
          {loading && totalOrders > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <RefreshCcw className="w-4 h-4 animate-spin" /> Atualizando...
            </span>
          )}
        </div>
      </div>

      <div className="px-6 pb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="app-input pl-9"
            placeholder="Buscar por número do pedido ou cliente"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {error && !notConfigured && <MeliErrorAlert message={friendlyError ?? "Erro ao carregar pedidos."} onRetry={onRetry} />}

      {notConfigured && <MeliNotConfiguredCard onRetry={onRetry} loading={loading} />}

      {isMockMode && (
        <p className="px-6 text-xs text-amber-600 dark:text-amber-300">
          Dados simulados para testes. Os números podem não corresponder à loja real.
        </p>
      )}

      {isInitialLoading && (
        <div className="px-6 pb-6 space-y-3">
          <div className="h-12 rounded-2xl bg-white/60 dark:bg-slate-800/70 animate-pulse" />
          <div className="h-12 rounded-2xl bg-white/60 dark:bg-slate-800/70 animate-pulse" />
          <div className="h-12 rounded-2xl bg-white/60 dark:bg-slate-800/70 animate-pulse" />
          <p className="text-sm text-slate-500 dark:text-slate-400 px-1">Carregando pedidos do Mercado Livre...</p>
        </div>
      )}

      {renderEmpty && (
        <div className="px-6 pb-6">
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/50 p-6 text-center text-slate-500 dark:text-slate-400 space-y-2">
            <AlertCircle className="w-5 h-5 mx-auto text-slate-400" />
            <p className="font-semibold">Nenhum pedido encontrado neste período.</p>
            <p className="text-sm">Tente ampliar o período ou alterar o status.</p>
          </div>
        </div>
      )}

      {orders.length > 0 && !notConfigured && (
        <>
          <div className="hidden md:block overflow-x-auto px-6 pb-6">
            <MeliOrdersTable orders={orders} expandedOrders={expandedOrders} setExpandedOrders={setExpandedOrders} />
          </div>

          <div className="md:hidden px-6 pb-6 space-y-3">
            <MeliOrdersCardsMobile orders={orders} expandedOrders={expandedOrders} setExpandedOrders={setExpandedOrders} />
          </div>

          {(hasMore || nextCursor) && (
            <div className="px-6 pb-6">
              <button
                type="button"
                disabled={loadingMore || !nextCursor}
                onClick={onLoadMore}
                className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-[#009DA8]/60 bg-white/70 dark:bg-slate-900/60 px-4 py-2 text-sm font-semibold text-[#009DA8] dark:text-[#00B5C3] shadow-sm hover:bg-[#009DA8]/10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingMore ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                {loadingMore ? "Carregando..." : "Carregar mais pedidos"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function MeliOrdersTable({
  orders,
  expandedOrders,
  setExpandedOrders,
}: {
  orders: Array<
    MeliOrder & {
      items?: { id: string; title: string; quantity: number; unit_price: number; sku: string | null }[];
      coverImageUrl?: string | null;
    }
  >;
  expandedOrders: Record<string, boolean>;
  setExpandedOrders: (value: Record<string, boolean>) => void;
}) {
  // Mapping: using id as order code, date_created as main date, total_amount as BRL total, buyer.nickname as customer name,
  // city/state from shipping.receiver_address, and shipping_mode as carrier label.
  const toggle = (id: string | number) => {
    setExpandedOrders({ ...expandedOrders, [String(id)]: !expandedOrders[String(id)] });
  };

  return (
    <table className="min-w-full text-sm text-left">
      <thead>
        <tr className="text-slate-500 dark:text-slate-400">
          <th className="py-3 pr-4">ID</th>
          <th className="py-3 pr-4">Status</th>
          <th className="py-3 pr-4">Data</th>
          <th className="py-3 pr-4">Valor</th>
          <th className="py-3 pr-4">Itens</th>
          <th className="py-3 pr-4">Cliente</th>
          <th className="py-3 pr-4">Cidade/UF</th>
          <th className="py-3 pr-4">Transportadora</th>
          <th className="py-3 pr-4">Detalhes</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/40 dark:divide-slate-800/60">
        {orders.map((order, idx) => {
          const dbOrder = order as MeliOrderDb;
          const statusClass = STATUS_COLORS[order.status] ?? "bg-slate-100/80 text-slate-700";
          const qtdItens =
            (order.order_items ?? []).reduce((acc, item) => acc + (Number(item.quantity) || 0), 0) ?? 0;
          const city =
            dbOrder.shipping_city ??
            order.shipping?.receiver_address?.city?.name ??
            order.shipping?.receiver_address?.city?.id ??
            "—";
          const state =
            dbOrder.shipping_state ??
            order.shipping?.receiver_address?.state?.id ??
            order.shipping?.receiver_address?.state?.name ??
            "";
          const cityInfo =
            city && city !== "—"
              ? `${city}${state ? ` / ${state}` : ""}`
              : state
              ? state
              : "—";
          const clientName =
            dbOrder.buyer_full_name ||
            order.buyer?.nickname ||
            order.buyer?.email ||
            order.shipping?.receiver_address?.city?.name ||
            order.shipping?.receiver_address?.state?.name ||
            order.shipping?.receiver_address?.city?.id ||
            "—";
          const coverAlt =
            clientName && clientName !== "—"
              ? `Pedido de ${clientName}`
              : `Pedido ${order.id ?? `#${idx + 1}`}`;
          const carrier = order.shipping?.shipping_mode || order.shipping?.id || "—";
          const expanded = expandedOrders[String(order.id)];
          return (
            <tr key={`ml-order-${order.id ?? idx}`} className="text-slate-800 dark:text-slate-100 align-top">
              <td className="py-3 pr-4">
                {order.coverImageUrl ? (
                  <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm border border-white/10 shadow-sm">
                    <Image
                      src={order.coverImageUrl}
                      alt={coverAlt}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-[10px] text-white/50 uppercase tracking-wide">
                    sem imagem
                  </div>
                )}
              </td>
              <td className="py-3 pr-4 font-semibold">{order.id ?? `#${idx + 1}`}</td>
              <td className="py-3 pr-4">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
                  {order.status}
                </span>
              </td>
              <td className="py-3 pr-4">{formatDate(order.date_created)}</td>
              <td className="py-3 pr-4">{formatCurrency(order.total_amount || 0)}</td>
              <td className="py-3 pr-4">{qtdItens || "—"}</td>
              <td className="py-3 pr-4">{clientName}</td>
              <td className="py-3 pr-4 max-w-[200px] truncate">{cityInfo}</td>
              <td className="py-3 pr-4">{carrier}</td>
              <td className="py-3 pr-4">
                <button
                  type="button"
                  onClick={() => toggle(order.id)}
                  className="text-xs font-semibold text-[#009DA8] hover:underline"
                >
                  {expanded ? "Esconder itens" : "Ver itens"}
                </button>
              </td>
              {expanded && (
                <td className="py-3 pr-4" colSpan={9}>
                  <MeliOrderItemsList items={order.order_items} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MeliOrdersCardsMobile({
  orders,
  expandedOrders,
  setExpandedOrders,
}: {
  orders: Array<
    MeliOrder & {
      items?: { id: string; title: string; quantity: number; unit_price: number; sku: string | null }[];
      coverImageUrl?: string | null;
    }
  >;
  expandedOrders: Record<string, boolean>;
  setExpandedOrders: (value: Record<string, boolean>) => void;
}) {
  const toggle = (id: string | number) => {
    setExpandedOrders({ ...expandedOrders, [String(id)]: !expandedOrders[String(id)] });
  };

  return (
    <>
      {orders.map((order, idx) => {
        const dbOrder = order as MeliOrderDb;
        const statusClass = STATUS_COLORS[order.status] ?? "bg-slate-100/80 text-slate-700";
        const qtdItens =
          (order.order_items ?? []).reduce((acc, item) => acc + (Number(item.quantity) || 0), 0) ?? 0;
        const city =
          dbOrder.shipping_city ??
          order.shipping?.receiver_address?.city?.name ??
          order.shipping?.receiver_address?.city?.id ??
          "—";
        const state =
          dbOrder.shipping_state ??
          order.shipping?.receiver_address?.state?.id ??
          order.shipping?.receiver_address?.state?.name ??
          "";
        const cityInfo =
          city && city !== "—"
            ? `${city}${state ? ` / ${state}` : ""}`
            : state
            ? state
            : "—";
        const clientName =
          dbOrder.buyer_full_name ||
          order.buyer?.nickname ||
          order.buyer?.email ||
          order.shipping?.receiver_address?.city?.name ||
          order.shipping?.receiver_address?.state?.name ||
          order.shipping?.receiver_address?.city?.id ||
          "—";
        const coverAlt =
          clientName && clientName !== "—" ? `Pedido de ${clientName}` : `Pedido ${order.id ?? `#${idx + 1}`}`;
        const carrier = order.shipping?.shipping_mode || order.shipping?.id || "—";
        const expanded = expandedOrders[String(order.id)];
        return (
          <div
            key={`ml-order-card-${order.id ?? idx}`}
            className="rounded-2xl border border-white/60 dark:border-slate-800 glass-panel glass-tint p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pedido</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{order.id}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Valor</p>
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(order.total_amount || 0)}
                </p>
              </div>
            </div>
            {order.coverImageUrl && (
              <div className="relative mt-3 mb-1 h-32 w-full rounded-2xl overflow-hidden bg-white/10 backdrop-blur-sm border border-white/10">
                <Image
                  src={order.coverImageUrl}
                  alt={coverAlt}
                  fill
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="flex flex-col gap-1">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
                  {order.status}
                </span>
                <span className="inline-flex items-center rounded-full bg-white/70 dark:bg-slate-800/70 px-3 py-1 text-xs text-slate-700 dark:text-slate-200">
                  {formatDate(order.date_created)}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-right">
                <p className="text-xs text-slate-500">Transportadora</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{order.shipping?.shipping_mode || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Cliente</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{clientName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Cidade/UF</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{cityInfo}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Qtd. itens</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{qtdItens || "—"}</p>
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => toggle(order.id)}
                className="text-xs font-semibold text-[#009DA8] hover:underline"
              >
                {expanded ? "Esconder itens" : "Ver itens"}
              </button>
              {expanded && <MeliOrderItemsList items={order.order_items ?? []} />}
            </div>
          </div>
        );
      })}
    </>
  );
}

function MeliOrderItemsList({ items }: { items: NonNullable<MeliOrder["order_items"]> }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Sem itens informados.</p>;
  }
  return (
    <div className="mt-3 rounded-2xl border border-white/50 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 p-3 space-y-2">
      {items.map((item) => (
        <div key={`${item.item.id}`} className="flex justify-between text-xs text-slate-700 dark:text-slate-200">
          <div className="space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">{item.item.title}</p>
            <p className="text-slate-500 dark:text-slate-400">{item.item.category_id || "Sem categoria"}</p>
          </div>
          <div className="text-right space-y-1">
            <p>{formatCurrency(item.unit_price || 0)}</p>
            <p className="text-slate-500 dark:text-slate-400">Qtd: {item.quantity || 0}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// UI atoms
type SummaryCardProps = {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  colorClass?: string;
  helper?: string;
};

function SummaryCard({ title, value, icon: Icon, colorClass = "text-[var(--accent)]", helper }: SummaryCardProps) {
  return (
    <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wide text-slate-500 truncate">{title}</p>
        <Icon className={`w-5 h-5 ${colorClass} shrink-0`} />
      </div>
      <p className={`text-3xl font-semibold ${colorClass} truncate`}>{value}</p>
      {helper && <p className="text-xs text-slate-500 mt-2 truncate">{helper}</p>}
    </div>
  );
}

function MeliErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="px-6 pb-4">
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 text-rose-700 px-4 py-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-1" />
        <div className="flex-1">
          <p className="font-semibold">Não foi possível carregar os pedidos do Mercado Livre.</p>
          <p className="text-sm">{message}</p>
        </div>
        <button
          onClick={onRetry}
          className="text-xs font-semibold underline decoration-rose-500 hover:opacity-80"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

function MeliNotConfiguredCard({ onRetry, loading }: { onRetry: () => void; loading: boolean }) {
  return (
    <div className="px-6 pb-6">
      <div className="rounded-[28px] glass-panel glass-tint border border-amber-200/60 dark:border-amber-500/20 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-300">Ação necessária</p>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Integração Mercado Livre pendente</h3>
          </div>
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-300" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
        Defina ML_APP_ID e ML_ACCESS_TOKEN nas variáveis de ambiente e autorize o app para seguir.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>1. Autorize o app Ambienta Mercado Livre.</li>
          <li>2. Obtenha o access_token e configure as variáveis.</li>
          <li>3. Volte aqui e recarregue a página.</li>
        </ul>
        <div className="pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#009DA8] to-[#00B5C3] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#009DA8]/30 transition hover:shadow-xl hover:shadow-[#009DA8]/40 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading}
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}

function statusColor(status: string) {
  return STATUS_HEX[status] ?? "#94a3b8";
}
