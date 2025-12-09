"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HelpCircle,
  Info,
  Lightbulb,
  MapPin,
  Package,
  PackageCheck,
  Percent,
  RefreshCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Target,
  Trophy,
  Truck,
  TruckIcon,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import type { ShopeeOrder, ShopeeOrderStatus } from "@/src/types/shopee";

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE ANIMAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

// Hook para animação de entrada staggered (escalonada)
function useStaggeredAnimation(itemCount: number, baseDelay = 50) {
  return (index: number): CSSProperties => ({
    animationDelay: `${index * baseDelay}ms`,
    animationFillMode: "backwards",
  });
}

// Componente wrapper para animações de fade-in
function FadeInUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div
      className={`animate-fade-in-up ${className}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      {children}
    </div>
  );
}

// Componente de pulse suave para elementos que precisam de atenção
function PulseHighlight({ children, active = false, className = "" }: { children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <div className={`${active ? "animate-pulse-soft" : ""} ${className}`}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE DE TOOLTIP REUTILIZÁVEL
// ═══════════════════════════════════════════════════════════════════════════════

// Contador estável para gerar IDs únicos sem Math.random durante render
let tooltipIdCounter = 0;

function InfoTooltip({ content, position = "top", id }: { content: string; position?: "top" | "bottom" | "left" | "right"; id?: string }) {
  const [show, setShow] = useState(false);
  const tooltipIdRef = useRef<string>(id || `tooltip-${++tooltipIdCounter}`);
  const tooltipId = tooltipIdRef.current;
  
  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };
  
  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-slate-800 border-x-transparent border-b-transparent",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-x-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-slate-800 border-y-transparent border-r-transparent",
    right: "right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-y-transparent border-l-transparent",
  };
  
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label="Mais informações"
        aria-describedby={show ? tooltipId : undefined}
        aria-expanded={show}
      >
        <HelpCircle className="w-4 h-4 transition-transform duration-200" aria-hidden="true" />
      </button>
      {show && (
        <div
          id={tooltipId}
          className={`absolute z-50 ${positionClasses[position]} animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200`}
          role="tooltip"
          aria-live="polite"
        >
          <div className="max-w-xs px-3 py-2 text-xs text-white bg-slate-800 dark:bg-slate-900 rounded-xl shadow-xl border border-slate-700/50 backdrop-blur-sm">
            {content}
          </div>
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  );
}

type ShopeeOrdersApiSuccess = {
  ok: true;
  data: {
    orders: ShopeeOrder[];
    hasMore: boolean;
    nextCursor?: string;
    nextOffset?: number;
    totalCount?: number;
  };
  meta: {
    timeFrom: number;
    timeTo: number;
    status?: ShopeeOrderStatus | null;
    mock?: boolean;
    source?: string;
    needsInitialSync?: boolean;
  };
};

type ShopeeOrdersApiError = {
  ok: false;
  error: { message: string; code?: string };
};

const PERIOD_OPTIONS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "180 dias", days: 180 },
] as const;

// Período padrão: 90 dias (conforme instrução)
const DEFAULT_PERIOD_DAYS = 90;

const STATUS_OPTIONS: { label: string; value: "ALL" | ShopeeOrderStatus }[] = [
  { label: "Todos", value: "ALL" },
  { label: "UNPAID", value: "UNPAID" },
  { label: "READY_TO_SHIP", value: "READY_TO_SHIP" },
  { label: "IN_CANCEL", value: "IN_CANCEL" },
  { label: "CANCELLED", value: "CANCELLED" },
  { label: "COMPLETED", value: "COMPLETED" },
];

const STATUS_STYLES: Record<ShopeeOrderStatus, { label: string; className: string }> = {
  UNPAID: { label: "Aguardando pagamento", className: "bg-slate-100/80 text-slate-700" },
  READY_TO_SHIP: { label: "Pronto para envio", className: "bg-amber-100/80 text-amber-700" },
  PROCESSED: { label: "Processado", className: "bg-indigo-100/80 text-indigo-700" },
  COMPLETED: { label: "Concluído", className: "bg-emerald-100/80 text-emerald-700" },
  CANCELLED: { label: "Cancelado", className: "bg-rose-100/80 text-rose-700" },
  TO_RETURN: { label: "Em devolução", className: "bg-orange-100/80 text-orange-700" },
  IN_CANCEL: { label: "Em cancelamento", className: "bg-rose-100/80 text-rose-700" },
};

const STATUS_ORDER: ShopeeOrderStatus[] = [
  "COMPLETED",
  "READY_TO_SHIP",
  "UNPAID",
  "PROCESSED",
  "CANCELLED",
  "IN_CANCEL",
  "TO_RETURN",
];

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const formatDate = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const getStatusStyle = (status: ShopeeOrderStatus) => STATUS_STYLES[status] ?? STATUS_STYLES.PROCESSED;

type Metrics = ReturnType<typeof buildMetricsFromOrders>;

export default function ShopeePage() {
  const [periodDays, setPeriodDays] = useState<number>(DEFAULT_PERIOD_DAYS);
  const [statusFilter, setStatusFilter] = useState<"ALL" | ShopeeOrderStatus>("ALL");
  const [orders, setOrders] = useState<ShopeeOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const requestIdRef = useRef(0);

  const { timeFrom, timeTo } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return { timeTo: now, timeFrom: now - periodDays * 24 * 60 * 60 };
  }, [periodDays]);

  const metrics: Metrics = useMemo(() => buildMetricsFromOrders(orders), [orders]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const term = searchTerm.toLowerCase();
    return orders.filter(
      (o) =>
        o.order_sn.toLowerCase().includes(term) ||
        (o.recipient_address?.name?.toLowerCase().includes(term) ?? false)
    );
  }, [orders, searchTerm]);

  // Estado para sync
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ lastSync: string | null; totalInDb: number } | null>(null);
  const [needsInitialSync, setNeedsInitialSync] = useState(false);

  // Buscar status do sync ao carregar
  useEffect(() => {
    fetch('/api/marketplaces/shopee/sync')
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) {
          setSyncStatus({
            lastSync: json.data.last_sync_at,
            totalInDb: json.data.totalOrdersInDb || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Função para executar sync inicial
  const runInitialSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/marketplaces/shopee/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial: true, periodDays: 90 }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || 'Erro ao sincronizar');
      }
      // Atualizar status e recarregar pedidos
      setSyncStatus({
        lastSync: new Date().toISOString(),
        totalInDb: json.data?.ordersProcessed || 0,
      });
      setNeedsInitialSync(false);
      // Recarregar pedidos
      fetchOrders();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao sincronizar';
      setError(message);
    } finally {
      setSyncing(false);
    }
  }, []);

  const fetchOrders = useCallback(
    async (opts?: { offset?: number; append?: boolean }) => {
      const requestId = ++requestIdRef.current;
      if (opts?.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      setNotConfigured(false);

      try {
        const params = new URLSearchParams();
        params.set("from", String(timeFrom));
        params.set("to", String(timeTo));
        params.set("pageSize", "100");
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        if (opts?.offset) params.set("offset", String(opts.offset));

        // Buscar do banco de dados
        const res = await fetch(`/api/marketplaces/shopee/orders/db?${params.toString()}`, {
          cache: "no-store",
        });
        const text = await res.text();
        let json: ShopeeOrdersApiSuccess | ShopeeOrdersApiError;
        try {
          json = JSON.parse(text) as ShopeeOrdersApiSuccess | ShopeeOrdersApiError;
        } catch {
          throw new Error(
            text?.toLowerCase().includes("<!doctype") || text?.toLowerCase().includes("<html")
              ? "A Shopee retornou HTML em vez de JSON (possível login/erro interno)."
              : `Resposta inválida da Shopee: ${text?.slice(0, 120) ?? "desconhecida"}`
          );
        }

        if (requestId !== requestIdRef.current) return;

        if (!res.ok || !json.ok) {
          if (!json.ok && json.error?.code === "SHOPEE_NOT_CONFIGURED") {
            setNotConfigured(true);
            setOrders([]);
            setHasMore(false);
            setNextOffset(undefined);
            setNextCursor(undefined);
            setIsMockMode(false);
            setLastUpdated(null);
            return;
          }
          const message = !res.ok
            ? `Erro ${res.status}: ${res.statusText || "falha ao buscar pedidos"}`
            : (json as ShopeeOrdersApiError).error?.message || "Erro ao buscar pedidos da Shopee.";
          throw new Error(message);
        }

        const payload = json.data;
        const meta = (json as ShopeeOrdersApiSuccess).meta;
        
        // Verificar se precisa de sync inicial
        if (meta.needsInitialSync) {
          setNeedsInitialSync(true);
        }

        setOrders((prev) => (opts?.append ? [...prev, ...payload.orders] : payload.orders));
        setTotalCount(payload.totalCount || payload.orders.length);
        setHasMore(payload.hasMore);
        setNextOffset(payload.nextOffset);
        setNextCursor(payload.nextCursor);
        setIsMockMode(Boolean(meta.mock));
        setLastUpdated(Date.now());
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        const message = err instanceof Error ? err.message : "Erro ao carregar pedidos da Shopee.";
        setError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [statusFilter, timeFrom, timeTo]
  );

  useEffect(() => {
    setOrders([]);
    setNextOffset(undefined);
    setNextCursor(undefined);
    fetchOrders();
  }, [fetchOrders]);

  return (
    <AppLayout title="Shopee">
      <div className="space-y-6 pb-12">
        <ShopeeHeaderSection
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
          totalCount={totalCount}
          metrics={metrics}
          syncing={syncing}
          needsInitialSync={needsInitialSync}
          onSync={runInitialSync}
          syncStatus={syncStatus}
        />

        {/* Banner de Sync Inicial */}
        {needsInitialSync && !syncing && (
          <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40">
                <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-100">Sincronização Inicial Necessária</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Ainda não há pedidos da Shopee no banco de dados. Clique para carregar os últimos 90 dias.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={runInitialSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#EE4D2D] to-[#FF6B4D] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 transition-all disabled:opacity-60"
            >
              <RefreshCcw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar Agora"}
            </button>
          </div>
        )}

        <ShopeeSummaryPanel 
          summaries={metrics.summary} 
          loading={loading && orders.length === 0} 
          dailySeries={metrics.dailySeries}
        />

        <ShopeeInsightsSection insights={metrics.insights} loading={loading && orders.length === 0} />

        <ShopeeChartsSection metrics={metrics} loading={loading && orders.length === 0} />

        <ShopeeRankingsSection rankings={metrics.rankings} loading={loading && orders.length === 0} />

        <ShopeeOrdersSection
          orders={filteredOrders}
          totalOrders={orders.length}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          nextCursor={nextCursor}
          nextOffset={nextOffset}
          error={error}
          notConfigured={notConfigured}
          isMockMode={isMockMode}
          onRetry={() => fetchOrders()}
          onLoadMore={() => nextOffset && fetchOrders({ offset: nextOffset, append: true })}
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
function buildMetricsFromOrders(orders: ShopeeOrder[]) {
  const totalPedidos = orders.length;
  const totalValor = orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
  const prontosParaEnvio = orders.filter((o) => o.order_status === "READY_TO_SHIP").length;
  const cancelados = orders.filter((o) => o.order_status === "CANCELLED" || o.order_status === "IN_CANCEL").length;
  const totalItens = orders.reduce((sum, order) => sum + (order.order_items?.length ?? 0), 0);
  const ticketMedio = totalPedidos ? totalValor / totalPedidos : 0;
  const cancelRate = totalPedidos ? (cancelados / totalPedidos) * 100 : 0;

  // Daily aggregates
  const perDay = orders.reduce<Record<string, { valor: number; pedidos: number; status: Record<ShopeeOrderStatus, number> }>>(
    (acc, order) => {
      const day = new Date(order.create_time * 1000).toLocaleDateString("pt-BR");
      if (!acc[day]) {
        acc[day] = { valor: 0, pedidos: 0, status: {} as Record<ShopeeOrderStatus, number> };
      }
      acc[day].valor += Number(order.total_amount) || 0;
      acc[day].pedidos += 1;
      acc[day].status[order.order_status] = (acc[day].status[order.order_status] ?? 0) + 1;
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
      STATUS_ORDER.forEach((status) => {
        entry[status] = info.status[status] ?? 0;
      });
      return entry;
    });

  // Status distribution
  const statusCounts = orders.reduce<Record<ShopeeOrderStatus, number>>((acc, order) => {
    acc[order.order_status] = (acc[order.order_status] ?? 0) + 1;
    return acc;
  }, {
    UNPAID: 0,
    READY_TO_SHIP: 0,
    PROCESSED: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    TO_RETURN: 0,
    IN_CANCEL: 0,
  });
  const statusDistribution = Object.entries(statusCounts)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status: status as ShopeeOrderStatus,
      count,
      percent: totalPedidos ? Math.round((count / totalPedidos) * 100) : 0,
    }));

  // Rankings
  const productMap = new Map<
    string,
    { name: string; units: number; revenue: number; orders: number }
  >();
  orders.forEach((order) => {
    const items = order.order_items ?? [];
    const seen = new Set<string>();
    items.forEach((item) => {
      const key = `${item.item_id}-${item.model_id}`;
      const price =
        Number(item.variation_discounted_price) ||
        Number(item.variation_original_price) ||
        Number(order.total_amount) / (items.length || 1) ||
        0;
      const prev = productMap.get(key) ?? { name: `${item.item_name} ${item.model_name ?? ""}`.trim(), units: 0, revenue: 0, orders: 0 };
      prev.units += 1;
      prev.revenue += price;
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
    const address = order.recipient_address?.full_address ?? "Endereço não informado";
    const cityKey = extractCity(address);
    const prev = cityMap.get(cityKey) ?? { pedidos: 0, valor: 0 };
    prev.pedidos += 1;
    prev.valor += Number(order.total_amount) || 0;
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
    const carrier = order.shipping_carrier || "Indefinido";
    const prev = carrierMap.get(carrier) ?? { pedidos: 0, valor: 0 };
    prev.pedidos += 1;
    prev.valor += Number(order.total_amount) || 0;
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
      ticketMedio: ticketMedio,
      totalItens,
      cancelRate,
      prontosParaEnvio,
    },
    dailySeries,
    statusTimeline,
    statusDistribution,
    rankings: { products, cities, carriers },
    insights,
  };
}

function buildInsights(
  orders: ShopeeOrder[],
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
  const ticketMedio = totalPedidos > 0 ? totalValor / totalPedidos : 0;
  
  // Calcular melhor dia
  const diasAgregados = orders.reduce<Record<string, { valor: number; pedidos: number }>>((acc, order) => {
    const dia = new Date(order.create_time * 1000).toLocaleDateString("pt-BR", { weekday: "long" });
    if (!acc[dia]) acc[dia] = { valor: 0, pedidos: 0 };
    acc[dia].valor += Number(order.total_amount) || 0;
    acc[dia].pedidos += 1;
    return acc;
  }, {});
  const melhorDia = Object.entries(diasAgregados).sort((a, b) => b[1].valor - a[1].valor)[0];
  
  // Calcular pedidos por hora (horário de pico)
  const horasAgregadas = orders.reduce<Record<number, number>>((acc, order) => {
    const hora = new Date(order.create_time * 1000).getHours();
    acc[hora] = (acc[hora] || 0) + 1;
    return acc;
  }, {});
  const horaPico = Object.entries(horasAgregadas).sort((a, b) => b[1] - a[1])[0];

  return [
    {
      title: "🏆 Maior pedido do período",
      body: `${formatCurrency(Number(maior.total_amount) || 0)} em ${formatDate(maior.create_time)}`,
      detail: `Pedido #${maior.order_sn}`,
      icon: Award,
      type: "highlight" as const,
    },
    {
      title: "📊 Taxa de cancelamento",
      body: `${cancelPerc}% dos pedidos foram cancelados`,
      detail: cancelPerc > 5 ? "Atenção: acima da média" : "Dentro do esperado",
      icon: Target,
      type: cancelPerc > 10 ? "warning" as const : cancelPerc > 5 ? "attention" as const : "success" as const,
    },
    melhorDia && {
      title: "📅 Melhor dia da semana",
      body: `${melhorDia[0].charAt(0).toUpperCase() + melhorDia[0].slice(1)} lidera com ${formatCurrency(melhorDia[1].valor)}`,
      detail: `${melhorDia[1].pedidos} pedidos neste dia`,
      icon: Star,
      type: "info" as const,
    },
    horaPico && {
      title: "⏰ Horário de pico",
      body: `${horaPico[0]}h às ${(Number(horaPico[0]) + 1) % 24}h é o horário mais movimentado`,
      detail: `${horaPico[1]} pedidos neste horário`,
      icon: Zap,
      type: "info" as const,
    },
    topCarrier && {
      title: "🚚 Transportadora favorita",
      body: `${topCarrier.carrier} domina com ${topCarrier.pedidos} envios`,
      detail: `${Math.round((topCarrier.pedidos / totalPedidos) * 100)}% dos pedidos`,
      icon: TruckIcon,
      type: "info" as const,
    },
    topCity && {
      title: "📍 Cidade destaque",
      body: `${topCity.city} é o principal destino`,
      detail: `${topCity.pedidos} pedidos para esta região`,
      icon: MapPin,
      type: "info" as const,
    },
    {
      title: "💰 Ticket médio",
      body: `${formatCurrency(ticketMedio)} por pedido`,
      detail: ticketMedio > 100 ? "Excelente valor médio!" : "Oportunidade de upsell",
      icon: TrendingUp,
      type: ticketMedio > 150 ? "success" as const : "info" as const,
    },
  ].filter(Boolean) as Array<{ 
    title: string; 
    body: string; 
    detail?: string;
    icon: ComponentType<{ className?: string }>;
    type: "highlight" | "success" | "warning" | "attention" | "info";
  }>;
}

function extractCity(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 2) return `${parts[0]}${parts[1] ? ` - ${parts[1]}` : ""}`;
  return address || "Endereço não informado";
}

// Components
type ShopeeHeaderProps = {
  periodDays: number;
  setPeriodDays: (days: number) => void;
  statusFilter: "ALL" | ShopeeOrderStatus;
  setStatusFilter: (value: "ALL" | ShopeeOrderStatus) => void;
  loading: boolean;
  onRefresh: () => void;
  isMockMode: boolean;
  lastUpdated: number | null;
  notConfigured: boolean;
  totalOrders: number;
};

function ShopeeHeaderSection({
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
  totalCount,
  metrics,
  syncing,
  needsInitialSync,
  onSync,
  syncStatus,
}: ShopeeHeaderProps & { 
  metrics?: Metrics;
  totalCount?: number;
  syncing?: boolean;
  needsInitialSync?: boolean;
  onSync?: () => void;
  syncStatus?: { lastSync: string | null; totalInDb: number } | null;
}) {
  const periodLabel = PERIOD_OPTIONS.find((p) => p.days === periodDays)?.label ?? `${periodDays} dias`;

  return (
    <header 
      className="relative overflow-hidden rounded-[24px] sm:rounded-[32px] border border-white/20 dark:border-white/5 shadow-2xl"
      role="banner"
      aria-label="Cabeçalho do Dashboard Shopee"
    >
      {/* Gradiente Shopee Premium */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#EE4D2D] via-[#F26D4E] to-[#FF8566] dark:from-[#EE4D2D]/90 dark:via-[#D84315]/80 dark:to-[#BF360C]/70" aria-hidden="true" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtNi42MjcgMC0xMiA1LjM3My0xMiAxMnM1LjM3MyAxMiAxMiAxMiAxMi01LjM3MyAxMi0xMi01LjM3My0xMi0xMi0xMnptMCAxOGMtMy4zMTQgMC02LTIuNjg2LTYtNnMyLjY4Ni02IDYtNiA2IDIuNjg2IDYgNi0yLjY4NiA2LTYgNnoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30" aria-hidden="true" />
      
      <div className="relative p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        {/* Top Row: Logo + Status */}
        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Shopee Logo */}
            <div className="flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-xl border border-white/30 shadow-lg" aria-hidden="true">
              <Store className="w-6 h-6 sm:w-8 sm:h-8 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">Shopee</h1>
              <p className="text-white/80 text-xs sm:text-sm mt-0.5 sm:mt-1">Dashboard de vendas e métricas</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
            {/* Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold backdrop-blur-xl transition-all ${
                notConfigured
                  ? "bg-amber-500/20 text-amber-100 border border-amber-300/30"
                  : "bg-emerald-500/20 text-emerald-100 border border-emerald-300/30"
              }`}
              aria-label={notConfigured ? "Status: Integração pendente" : "Status: Conectado"}
            >
              <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${notConfigured ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} aria-hidden="true" />
              {notConfigured ? "Pendente" : "Conectado"}
            </span>
            {isMockMode && (
              <span className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-white/10 border border-white/20 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white/90 backdrop-blur-xl" aria-label="Modo demonstração ativo">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
                Demo
              </span>
            )}
          </div>
        </div>

        {/* Mini Métricas Rápidas - collapsible on mobile */}
        {metrics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <div className="rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-2.5 sm:p-4">
              <p className="text-white/70 text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Faturamento</p>
              <p className="text-lg sm:text-2xl font-bold text-white">{formatCurrency(metrics.summary.totalValor)}</p>
            </div>
            <div className="rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-2.5 sm:p-4">
              <p className="text-white/70 text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Pedidos</p>
              <p className="text-lg sm:text-2xl font-bold text-white">{metrics.summary.totalPedidos}</p>
            </div>
            <div className="rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-2.5 sm:p-4">
              <p className="text-white/70 text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Ticket Médio</p>
              <p className="text-lg sm:text-2xl font-bold text-white">{formatCurrency(metrics.summary.ticketMedio)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-4">
              <p className="text-white/70 text-xs uppercase tracking-wider mb-1">Itens</p>
              <p className="text-2xl font-bold text-white">{metrics.summary.totalItens}</p>
            </div>
          </div>
        )}

        {/* Filtros - melhor layout mobile */}
        <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3" role="group" aria-label="Filtros de visualização">
          <div className="col-span-2 sm:col-span-1 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-2.5 sm:p-3">
            <p className="text-[9px] sm:text-[10px] uppercase tracking-widest text-white/60 mb-1.5 sm:mb-2" id="period-filter-label">Período</p>
            <div className="flex gap-1 flex-wrap" role="radiogroup" aria-labelledby="period-filter-label">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setPeriodDays(option.days)}
                  role="radio"
                  aria-checked={periodDays === option.days}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold transition-all duration-200 transform focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-[#EE4D2D] ${
                    periodDays === option.days
                      ? "bg-white text-[#EE4D2D] shadow-lg scale-105"
                      : "bg-white/10 text-white hover:bg-white/20 hover:scale-105 active:scale-95"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-2.5 sm:p-3">
            <p className="text-[9px] sm:text-[10px] uppercase tracking-widest text-white/60 mb-1.5 sm:mb-2" id="status-filter-label">Status</p>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | ShopeeOrderStatus)}
              aria-labelledby="status-filter-label"
              className="w-full px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium bg-white/10 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-800 text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-2.5 sm:p-3 flex flex-col justify-center">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label={loading ? "Atualizando dados..." : "Atualizar dados da Shopee"}
              aria-busy={loading}
              className="group w-full inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-[#EE4D2D] shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-white/30 sm:hover:scale-[1.03] active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#EE4D2D]"
            >
              <RefreshCcw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-300 ${loading ? "animate-spin" : "group-hover:rotate-180"}`} aria-hidden="true" />
              <span className="hidden sm:inline">{loading ? "Atualizando..." : "Atualizar dados"}</span>
              <span className="sm:hidden">{loading ? "..." : "Atualizar"}</span>
            </button>
          </div>
        </div>

        {/* Info Row - compacto no mobile */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-white/70 text-[10px] sm:text-xs" role="contentinfo" aria-label="Informações do período">
          <span className="inline-flex items-center gap-1 sm:gap-1.5">
            <CalendarDays className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
            <span>{periodLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1 sm:gap-1.5">
            <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
            <span>{totalOrders} pedidos</span>
          </span>
          {lastUpdated && (
            <span className="inline-flex items-center gap-1 sm:gap-1.5">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Atualizado </span>
              <time dateTime={new Date(lastUpdated).toISOString()}>
                {new Date(lastUpdated).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </time>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

type SummaryPanelProps = {
  summaries: Metrics["summary"];
  loading: boolean;
};

function ShopeeSummaryPanel({ summaries, loading, dailySeries }: SummaryPanelProps & { dailySeries?: Array<{ date: string; valor: number; pedidos: number }> }) {
  // Calcular variações baseado na série diária (primeira metade vs segunda metade)
  const variations = useMemo(() => {
    if (!dailySeries || dailySeries.length < 2) return null;
    const mid = Math.floor(dailySeries.length / 2);
    const firstHalf = dailySeries.slice(0, mid);
    const secondHalf = dailySeries.slice(mid);
    
    const firstValor = firstHalf.reduce((acc, d) => acc + d.valor, 0);
    const secondValor = secondHalf.reduce((acc, d) => acc + d.valor, 0);
    const firstPedidos = firstHalf.reduce((acc, d) => acc + d.pedidos, 0);
    const secondPedidos = secondHalf.reduce((acc, d) => acc + d.pedidos, 0);
    
    const valorChange = firstValor > 0 ? ((secondValor - firstValor) / firstValor) * 100 : 0;
    const pedidosChange = firstPedidos > 0 ? ((secondPedidos - firstPedidos) / firstPedidos) * 100 : 0;
    const ticketFirst = firstPedidos > 0 ? firstValor / firstPedidos : 0;
    const ticketSecond = secondPedidos > 0 ? secondValor / secondPedidos : 0;
    const ticketChange = ticketFirst > 0 ? ((ticketSecond - ticketFirst) / ticketFirst) * 100 : 0;
    
    return { valorChange, pedidosChange, ticketChange };
  }, [dailySeries]);

  const cards = [
    {
      title: "Faturamento Total",
      value: formatCurrency(summaries.totalValor),
      icon: Wallet,
      color: "from-[#EE4D2D] to-[#FF6B47]",
      iconBg: "bg-[#EE4D2D]/10",
      iconColor: "text-[#EE4D2D]",
      change: variations?.valorChange,
      sparkData: dailySeries?.map(d => d.valor),
      tooltip: "Soma total dos valores de todos os pedidos no período selecionado, incluindo frete.",
    },
    {
      title: "Total de Pedidos",
      value: summaries.totalPedidos.toString(),
      icon: ShoppingBag,
      color: "from-emerald-500 to-emerald-400",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      change: variations?.pedidosChange,
      sparkData: dailySeries?.map(d => d.pedidos),
      tooltip: "Quantidade total de pedidos realizados no período, independente do status.",
    },
    {
      title: "Ticket Médio",
      value: summaries.totalPedidos ? formatCurrency(summaries.ticketMedio) : "—",
      icon: BarChart2,
      color: "from-amber-500 to-amber-400",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
      change: variations?.ticketChange,
      tooltip: "Valor médio por pedido (faturamento ÷ número de pedidos). Indica o gasto médio dos clientes.",
    },
    {
      title: "Itens Vendidos",
      value: summaries.totalItens.toLocaleString("pt-BR"),
      icon: PackageCheck,
      color: "from-indigo-500 to-indigo-400",
      iconBg: "bg-indigo-500/10",
      iconColor: "text-indigo-500",
      tooltip: "Quantidade total de itens vendidos em todos os pedidos do período.",
    },
    {
      title: "Taxa de Cancelamento",
      value: `${summaries.cancelRate.toFixed(1)}%`,
      icon: Percent,
      color: "from-rose-500 to-rose-400",
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-500",
      isNegativeGood: true,
      tooltip: "Porcentagem de pedidos cancelados em relação ao total. Valores menores são melhores.",
    },
    {
      title: "Prontos para Envio",
      value: summaries.prontosParaEnvio.toString(),
      icon: Truck,
      color: "from-sky-500 to-sky-400",
      iconBg: "bg-sky-500/10",
      iconColor: "text-sky-500",
      urgent: summaries.prontosParaEnvio > 0,
      tooltip: "Pedidos com status 'READY_TO_SHIP' aguardando envio. Ação necessária!",
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        {cards.map((_, idx) => (
          <div key={idx} className="h-32 sm:h-36 rounded-[20px] sm:rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <section 
      className="grid gap-3 grid-cols-2 lg:grid-cols-3"
      role="region"
      aria-label="Indicadores chave de performance"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const hasChange = typeof card.change === "number" && card.change !== 0;
        const isPositive = card.isNegativeGood ? (card.change ?? 0) < 0 : (card.change ?? 0) > 0;
        
        return (
          <article
            key={card.title}
            className="group relative rounded-[20px] sm:rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-3 sm:p-5 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 sm:hover:scale-[1.02] sm:hover:-translate-y-1 hover:border-white/80 dark:hover:border-white/20 animate-fade-in-up"
            style={{ animationDelay: `${cards.indexOf(card) * 80}ms`, animationFillMode: "backwards" }}
            aria-label={`${card.title}: ${card.value}`}
          >
            {/* Gradient accent line com animação */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.color} opacity-80 transition-all duration-300 group-hover:h-1.5 group-hover:opacity-100`} aria-hidden="true" />
            
            {/* Urgency indicator */}
            {card.urgent && (
              <div className="absolute top-2 sm:top-3 right-2 sm:right-3" aria-hidden="true">
                <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-amber-500" />
                </span>
              </div>
            )}
            
            <div className="flex items-start justify-between mb-2 sm:mb-3">
              <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl ${card.iconBg} transition-all duration-300 group-hover:scale-110 group-hover:rotate-3`} aria-hidden="true">
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${card.iconColor} transition-transform duration-300`} aria-hidden="true" />
              </div>
              
              {/* Variação */}
              {hasChange && (
                <div className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold ${
                  isPositive
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                }`}>
                  {isPositive ? (
                    <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  )}
                  {Math.abs(card.change ?? 0).toFixed(1)}%
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-1">
              <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 transition-colors duration-300 group-hover:text-slate-700 dark:group-hover:text-slate-300">
                {card.title}
              </p>
              {/* Tooltip - hidden on small mobile */}
              {card.tooltip && (
                <span className="hidden sm:inline-flex">
                  <InfoTooltip content={card.tooltip} position="top" />
                </span>
              )}
            </div>
            <p className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5 sm:mt-1 transition-transform duration-300 group-hover:scale-105 origin-left">
              {card.value}
            </p>
            
            {/* Mini Sparkline - hidden on very small screens */}
            {card.sparkData && card.sparkData.length > 1 && (
              <div className="hidden sm:block mt-3 h-8 opacity-60 group-hover:opacity-100 transition-opacity">
                <MiniSparkline data={card.sparkData} color={card.iconColor} />
              </div>
            )}
            
            {hasChange && (
              <p className="hidden sm:block text-[10px] text-slate-400 mt-2">
                vs. período anterior
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}

// Mini Sparkline component para KPIs
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  
  const colorMap: Record<string, string> = {
    "text-[#EE4D2D]": "#EE4D2D",
    "text-emerald-500": "#10b981",
    "text-amber-500": "#f59e0b",
    "text-indigo-500": "#6366f1",
    "text-rose-500": "#f43f5e",
    "text-sky-500": "#0ea5e9",
  };
  const strokeColor = colorMap[color] || "#94a3b8";
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#spark-${color})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Seção de Insights Inteligentes
function ShopeeInsightsSection({ insights, loading }: { insights: Metrics["insights"]; loading: boolean }) {
  if (loading) {
    return (
      <section className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Lightbulb className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Insights do Período</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/60 dark:bg-slate-800/60 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!insights.length) return null;

  const typeStyles = {
    highlight: {
      bg: "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20",
      border: "border-amber-200/60 dark:border-amber-500/20",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    success: {
      bg: "bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20",
      border: "border-emerald-200/60 dark:border-emerald-500/20",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    warning: {
      bg: "bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20",
      border: "border-rose-200/60 dark:border-rose-500/20",
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-600 dark:text-rose-400",
    },
    attention: {
      bg: "bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20",
      border: "border-amber-200/60 dark:border-amber-500/20",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    info: {
      bg: "bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-800/40 dark:to-gray-900/40",
      border: "border-slate-200/60 dark:border-slate-600/20",
      iconBg: "bg-slate-500/10",
      iconColor: "text-slate-600 dark:text-slate-400",
    },
  };

  return (
    <section 
      className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6 shadow-xl"
      role="region"
      aria-labelledby="insights-heading"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20" aria-hidden="true">
          <Lightbulb className="w-5 h-5 text-amber-500" aria-hidden="true" />
        </div>
        <div>
          <h3 id="insights-heading" className="text-lg font-bold text-slate-900 dark:text-white">Insights do Período</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Destaques e tendências identificados</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="list">
        {insights.map((insight, idx) => {
          const Icon = insight.icon;
          const styles = typeStyles[insight.type];
          
          return (
            <article
              key={idx}
              role="listitem"
              className={`group relative rounded-2xl border ${styles.border} ${styles.bg} p-4 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/30 dark:hover:shadow-slate-900/30 hover:scale-[1.02] hover:-translate-y-0.5 animate-fade-in-up`}
              style={{ animationDelay: `${idx * 100}ms`, animationFillMode: "backwards" }}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-xl ${styles.iconBg} shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6`} aria-hidden="true">
                  <Icon className={`w-4 h-4 ${styles.iconColor} transition-transform duration-200`} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1 leading-tight">
                    {insight.title}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
                    {insight.body}
                  </p>
                  {insight.detail && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                      {insight.detail}
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Custom tooltip para gráficos - definido fora do componente para evitar recreação durante render
function ChartCustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-white/60 dark:border-slate-700 shadow-2xl p-4 min-w-[180px]">
      <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
          </span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {entry.name.includes("R$") ? formatCurrency(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ShopeeChartsSection({ metrics, loading }: { metrics: Metrics; loading: boolean }) {
  return (
    <section className="grid gap-4 sm:gap-6 lg:grid-cols-2" role="region" aria-label="Gráficos de performance">
      {/* Gráfico de Vendas */}
      <div className="rounded-[20px] sm:rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-6 shadow-xl" role="figure" aria-labelledby="sales-chart-title">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 sm:p-2 rounded-lg bg-[#EE4D2D]/10" aria-hidden="true">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EE4D2D]" aria-hidden="true" />
              </div>
              <h3 id="sales-chart-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Evolução de Vendas</h3>
              <InfoTooltip content="Mostra a tendência diária de faturamento e número de pedidos no período selecionado." position="right" id="sales-chart-tooltip" />
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Faturamento e pedidos por dia</p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-[10px] sm:text-xs" role="legend" aria-label="Legenda do gráfico">
            <span className="flex items-center gap-1 sm:gap-1.5">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#EE4D2D]" aria-hidden="true" />
              <span>Vendas</span>
            </span>
            <span className="flex items-center gap-1 sm:gap-1.5">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500" aria-hidden="true" />
              <span>Pedidos</span>
            </span>
          </div>
        </div>
        <div className="h-52 sm:h-72">
          {loading ? (
            <div className="h-full rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.dailySeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="shopeeGradientValor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EE4D2D" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#EE4D2D" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="shopeeGradientPedidos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: "#94a3b8", fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fill: "#94a3b8", fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  dx={-5}
                  width={35}
                  tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}k` : value}
                />
                <Tooltip content={<ChartCustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="valor" 
                  stroke="#EE4D2D" 
                  strokeWidth={2.5}
                  fill="url(#shopeeGradientValor)" 
                  name="Vendas (R$)" 
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                />
                <Area 
                  type="monotone" 
                  dataKey="pedidos" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  fill="url(#shopeeGradientPedidos)" 
                  name="Pedidos" 
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Gráfico de Status + Distribuição */}
      <div className="rounded-[20px] sm:rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-6 shadow-xl" role="figure" aria-labelledby="status-chart-title">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10" aria-hidden="true">
                <BarChart2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" aria-hidden="true" />
              </div>
              <h3 id="status-chart-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Distribuição de Status</h3>
              <InfoTooltip content="Visualiza a distribuição dos pedidos por status ao longo do tempo. Útil para identificar gargalos operacionais." position="left" id="status-chart-tooltip" />
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Volume por status no período</p>
          </div>
        </div>
        
        {/* Status Pills - scrollable on mobile */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide" role="list" aria-label="Distribuição por status">
          {metrics.statusDistribution.map((status, idx) => (
            <div 
              key={status.status}
              role="listitem"
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/60 dark:border-slate-700 flex-shrink-0 transition-all duration-200 hover:scale-105 hover:shadow-md cursor-default animate-fade-in-up"
              style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "backwards" }}
              aria-label={`${STATUS_STYLES[status.status]?.label || status.status}: ${status.count} pedidos`}
            >
              <span 
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full" 
                style={{ backgroundColor: getStatusColor(status.status) }}
                aria-hidden="true"
              />
              <span className="text-[10px] sm:text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                {STATUS_STYLES[status.status]?.label || status.status}
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white">
                {status.count}
              </span>
            </div>
          ))}
        </div>

        <div className="h-44 sm:h-56">
          {loading ? (
            <div className="h-full rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.statusTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="statusGradCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="statusGradReady" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="statusGradUnpaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#64748b" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#64748b" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="statusGradCancelled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: "#94a3b8", fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fill: "#94a3b8", fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={30}
                />
                <Tooltip content={<ChartCustomTooltip />} />
                <Area type="monotone" dataKey="COMPLETED" stackId="1" stroke="#10b981" strokeWidth={1.5} fill="url(#statusGradCompleted)" name="Concluído" />
                <Area type="monotone" dataKey="READY_TO_SHIP" stackId="1" stroke="#f59e0b" strokeWidth={1.5} fill="url(#statusGradReady)" name="Pronto envio" />
                <Area type="monotone" dataKey="UNPAID" stackId="1" stroke="#64748b" strokeWidth={1.5} fill="url(#statusGradUnpaid)" name="Aguardando" />
                <Area type="monotone" dataKey="CANCELLED" stackId="1" stroke="#ef4444" strokeWidth={1.5} fill="url(#statusGradCancelled)" name="Cancelado" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

// Helper para cores de status
function getStatusColor(status: ShopeeOrderStatus): string {
  const colors: Record<ShopeeOrderStatus, string> = {
    COMPLETED: "#10b981",
    READY_TO_SHIP: "#f59e0b",
    UNPAID: "#64748b",
    PROCESSED: "#6366f1",
    CANCELLED: "#ef4444",
    IN_CANCEL: "#f87171",
    TO_RETURN: "#fb923c",
  };
  return colors[status] || "#94a3b8";
}

type RankingsSectionProps = {
  rankings: Metrics["rankings"];
  loading: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════════
// RANKING VISUAL CARDS - Medalhas, barras de progresso e animações
// ═══════════════════════════════════════════════════════════════════════════════

const RANK_BADGES = ["🥇", "🥈", "🥉"];
const RANK_COLORS = [
  "from-amber-400 to-yellow-500", // Ouro
  "from-slate-300 to-slate-400",   // Prata
  "from-amber-600 to-orange-500",  // Bronze
];

function ShopeeRankingsSection({ rankings, loading }: RankingsSectionProps) {
  return (
    <section className="space-y-4" role="region" aria-labelledby="rankings-heading">
      {/* Título da seção */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#EE4D2D] to-[#FF8566] flex items-center justify-center shadow-lg shadow-[#EE4D2D]/20" aria-hidden="true">
          <Trophy className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h2 id="rankings-heading" className="text-xl font-semibold text-slate-900 dark:text-white">Rankings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Destaques do período selecionado</p>
        </div>
      </div>
      
      <div className="grid gap-4 lg:grid-cols-3" role="list">
        <ProductRankingCard products={rankings.products} loading={loading} />
        <CityRankingCard cities={rankings.cities} loading={loading} />
        <CarrierRankingCard carriers={rankings.carriers} loading={loading} />
      </div>
    </section>
  );
}

function ProductRankingCard({
  products,
  loading,
}: {
  products: Array<{ name: string; units: number; revenue: number; revenuePerc: number }>;
  loading?: boolean;
}) {
  const maxRevenue = products.length > 0 ? Math.max(...products.map(p => p.revenue)) : 1;
  
  return (
    <article 
      className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 shadow-xl space-y-4 group hover:shadow-2xl hover:shadow-[#EE4D2D]/10 hover:border-[#EE4D2D]/30 transition-all duration-500 animate-fade-in-up" 
      style={{ animationDelay: "100ms", animationFillMode: "backwards" }}
      role="listitem"
      aria-labelledby="products-ranking-title"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 id="products-ranking-title" className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-2xl transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12 inline-block" aria-hidden="true">🏆</span> Top Produtos
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300 group-hover:text-slate-600 dark:group-hover:text-slate-300">Campeões de vendas do período</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#EE4D2D] to-[#FF8566] flex items-center justify-center shadow-lg shadow-[#EE4D2D]/30 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500" aria-hidden="true">
          <ShoppingBag className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
      </div>
      
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-6">
          <Package className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados suficientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.slice(0, 5).map((product, idx) => {
            const percentage = (product.revenue / maxRevenue) * 100;
            const isTopThree = idx < 3;
            
            return (
              <div 
                key={idx} 
                className={`rounded-2xl p-3 transition-all duration-300 hover:scale-[1.02] ${
                  isTopThree 
                    ? "bg-gradient-to-r from-white/80 to-white/40 dark:from-slate-800/80 dark:to-slate-800/40 border border-white/60 dark:border-slate-700/60" 
                    : "bg-white/40 dark:bg-slate-800/30"
                }`}
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  {/* Badge de posição */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold ${
                    isTopThree 
                      ? `bg-gradient-to-br ${RANK_COLORS[idx]} text-white shadow-md`
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}>
                    {isTopThree ? RANK_BADGES[idx] : idx + 1}
                  </div>
                  
                  {/* Info do produto */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white truncate text-sm">
                        {product.name}
                      </p>
                      <span className="text-xs font-bold text-[#EE4D2D] whitespace-nowrap">
                        {formatCurrency(product.revenue)}
                      </span>
                    </div>
                    
                    {/* Barra de progresso animada */}
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out animate-progress-fill ${
                          isTopThree 
                            ? "bg-gradient-to-r from-[#EE4D2D] to-[#FF8566] shadow-sm shadow-[#EE4D2D]/30" 
                            : "bg-gradient-to-r from-slate-400 to-slate-300"
                        }`}
                        style={{ width: `${percentage}%`, animationDelay: `${idx * 150}ms` }}
                      />
                    </div>
                    
                    {/* Meta infos */}
                    <div className="flex items-center justify-between mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{product.units} unidades</span>
                      <span className="font-medium">{product.revenuePerc.toFixed(1)}% do total</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function CityRankingCard({
  cities,
  loading,
}: {
  cities: Array<{ city: string; pedidos: number; valor: number; percent: number }>;
  loading?: boolean;
}) {
  const maxPedidos = cities.length > 0 ? Math.max(...cities.map(c => c.pedidos)) : 1;
  
  return (
    <article 
      className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 shadow-xl space-y-4 group hover:shadow-2xl hover:shadow-emerald-500/10 hover:border-emerald-500/30 transition-all duration-500 animate-fade-in-up" 
      style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
      role="listitem"
      aria-labelledby="cities-ranking-title"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 id="cities-ranking-title" className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-2xl transition-transform duration-300 group-hover:scale-125 group-hover:bounce inline-block" aria-hidden="true">📍</span> Top Cidades
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300 group-hover:text-slate-600 dark:group-hover:text-slate-300">Onde seus clientes estão</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500" aria-hidden="true">
          <MapPin className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
      </div>
      
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : cities.length === 0 ? (
        <div className="text-center py-6">
          <MapPin className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados suficientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cities.slice(0, 5).map((city, idx) => {
            const percentage = (city.pedidos / maxPedidos) * 100;
            const isTopThree = idx < 3;
            
            return (
              <div 
                key={idx} 
                className={`rounded-2xl p-3 transition-all duration-300 hover:scale-[1.02] ${
                  isTopThree 
                    ? "bg-gradient-to-r from-white/80 to-white/40 dark:from-slate-800/80 dark:to-slate-800/40 border border-white/60 dark:border-slate-700/60" 
                    : "bg-white/40 dark:bg-slate-800/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Badge de posição */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold ${
                    isTopThree 
                      ? `bg-gradient-to-br ${RANK_COLORS[idx]} text-white shadow-md`
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}>
                    {isTopThree ? RANK_BADGES[idx] : idx + 1}
                  </div>
                  
                  {/* Info da cidade */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white truncate text-sm">
                        {city.city}
                      </p>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {city.pedidos} pedidos
                      </span>
                    </div>
                    
                    {/* Barra de progresso */}
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          isTopThree 
                            ? "bg-gradient-to-r from-emerald-500 to-teal-400" 
                            : "bg-gradient-to-r from-slate-400 to-slate-300"
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    
                    {/* Meta infos */}
                    <div className="flex items-center justify-between mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatCurrency(city.valor)} em vendas</span>
                      <span className="font-medium">{city.percent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function CarrierRankingCard({
  carriers,
  loading,
}: {
  carriers: Array<{ carrier: string; pedidos: number; percent: number; valor: number }>;
  loading?: boolean;
}) {
  const maxPedidos = carriers.length > 0 ? Math.max(...carriers.map(c => c.pedidos)) : 1;
  
  return (
    <article 
      className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 shadow-xl space-y-4 group hover:shadow-2xl hover:shadow-violet-500/10 hover:border-violet-500/30 transition-all duration-500 animate-fade-in-up" 
      style={{ animationDelay: "300ms", animationFillMode: "backwards" }}
      role="listitem"
      aria-labelledby="carriers-ranking-title"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 id="carriers-ranking-title" className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-2xl transition-transform duration-300 group-hover:scale-125 group-hover:-translate-x-1 inline-block" aria-hidden="true">🚚</span> Transportadoras
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300 group-hover:text-slate-600 dark:group-hover:text-slate-300">Quem entrega suas vendas</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/30 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500" aria-hidden="true">
          <Truck className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
      </div>
      
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : carriers.length === 0 ? (
        <div className="text-center py-6">
          <Truck className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados suficientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {carriers.slice(0, 5).map((carrier, idx) => {
            const percentage = (carrier.pedidos / maxPedidos) * 100;
            const isTopThree = idx < 3;
            
            return (
              <div 
                key={idx} 
                className={`rounded-2xl p-3 transition-all duration-300 hover:scale-[1.02] ${
                  isTopThree 
                    ? "bg-gradient-to-r from-white/80 to-white/40 dark:from-slate-800/80 dark:to-slate-800/40 border border-white/60 dark:border-slate-700/60" 
                    : "bg-white/40 dark:bg-slate-800/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Badge de posição */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold ${
                    isTopThree 
                      ? `bg-gradient-to-br ${RANK_COLORS[idx]} text-white shadow-md`
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}>
                    {isTopThree ? RANK_BADGES[idx] : idx + 1}
                  </div>
                  
                  {/* Info da transportadora */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white truncate text-sm">
                        {carrier.carrier || "Não informada"}
                      </p>
                      <span className="text-xs font-bold text-violet-600 dark:text-violet-400 whitespace-nowrap">
                        {carrier.pedidos} envios
                      </span>
                    </div>
                    
                    {/* Barra de progresso */}
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          isTopThree 
                            ? "bg-gradient-to-r from-violet-500 to-purple-400" 
                            : "bg-gradient-to-r from-slate-400 to-slate-300"
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    
                    {/* Meta infos */}
                    <div className="flex items-center justify-between mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatCurrency(carrier.valor)} transportado</span>
                      <span className="font-medium">{carrier.percent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

type OrdersSectionProps = {
  orders: ShopeeOrder[];
  totalOrders: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  nextCursor?: string;
  nextOffset?: number;
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

// ═══════════════════════════════════════════════════════════════════════════════
// TABELA DE PEDIDOS MODERNIZADA - Badges animados, expand suave, visual premium
// ═══════════════════════════════════════════════════════════════════════════════

// Status styling modernizado com ícones e cores vibrantes
function getModernStatusStyle(status: string): {
  label: string;
  bgClass: string;
  textClass: string;
  icon: string;
  pulseClass?: string;
} {
  const styles: Record<string, { label: string; bgClass: string; textClass: string; icon: string; pulseClass?: string }> = {
    COMPLETED: {
      label: "Concluído",
      bgClass: "bg-emerald-100 dark:bg-emerald-900/40",
      textClass: "text-emerald-700 dark:text-emerald-300",
      icon: "✓",
    },
    READY_TO_SHIP: {
      label: "Pronto p/ envio",
      bgClass: "bg-amber-100 dark:bg-amber-900/40",
      textClass: "text-amber-700 dark:text-amber-300",
      icon: "📦",
      pulseClass: "animate-pulse",
    },
    SHIPPED: {
      label: "Enviado",
      bgClass: "bg-blue-100 dark:bg-blue-900/40",
      textClass: "text-blue-700 dark:text-blue-300",
      icon: "🚚",
    },
    UNPAID: {
      label: "Aguardando pgto",
      bgClass: "bg-orange-100 dark:bg-orange-900/40",
      textClass: "text-orange-700 dark:text-orange-300",
      icon: "⏳",
      pulseClass: "animate-pulse",
    },
    CANCELLED: {
      label: "Cancelado",
      bgClass: "bg-rose-100 dark:bg-rose-900/40",
      textClass: "text-rose-700 dark:text-rose-300",
      icon: "✗",
    },
    IN_CANCEL: {
      label: "Em cancelamento",
      bgClass: "bg-rose-100 dark:bg-rose-900/40",
      textClass: "text-rose-700 dark:text-rose-300",
      icon: "⚠",
    },
    TO_RETURN: {
      label: "Devolução",
      bgClass: "bg-purple-100 dark:bg-purple-900/40",
      textClass: "text-purple-700 dark:text-purple-300",
      icon: "↩",
    },
  };
  return styles[status] || {
    label: status,
    bgClass: "bg-slate-100 dark:bg-slate-800",
    textClass: "text-slate-700 dark:text-slate-300",
    icon: "•",
  };
}

function ShopeeOrdersSection({
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
      ? "A Shopee retornou uma página HTML (login ou erro interno) em vez de JSON. Verifique se o app está autorizado e se o token é válido."
      : error;
  const renderEmpty = !isInitialLoading && orders.length === 0 && !error && !notConfigured;

  // Estatísticas rápidas dos pedidos exibidos
  const quickStats = useMemo(() => {
    const total = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const readyToShip = orders.filter(o => o.order_status === "READY_TO_SHIP").length;
    const completed = orders.filter(o => o.order_status === "COMPLETED").length;
    return { total, readyToShip, completed };
  }, [orders]);

  return (
    <section 
      role="region" 
      aria-label="Lista de pedidos Shopee"
      className="glass-panel glass-tint border border-white/60 dark:border-white/10 rounded-[36px] shadow-2xl overflow-hidden"
    >
      {/* Header modernizado com estatísticas inline */}
      <div className="bg-gradient-to-r from-white/80 via-white/60 to-white/40 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-slate-800/40 px-6 py-5 border-b border-white/40 dark:border-slate-700/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#EE4D2D] to-[#FF8566] flex items-center justify-center shadow-lg shadow-[#EE4D2D]/20" aria-hidden="true">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 id="orders-section-title" className="text-xl font-bold text-slate-900 dark:text-white">Pedidos</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Lista detalhada dos pedidos</p>
            </div>
          </div>
          
          {/* Quick stats pills */}
          <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-white/60 dark:border-slate-700/60 shadow-sm" aria-label={`${orders.length} pedidos exibidos`}>
              <span className="text-[#EE4D2D]">{orders.length}</span> exibidos
            </span>
            {quickStats.readyToShip > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 shadow-sm animate-pulse" aria-label={`${quickStats.readyToShip} pedidos prontos para envio`}>
                <span aria-hidden="true">📦</span> {quickStats.readyToShip} para enviar
              </span>
            )}
            {loading && totalOrders > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300" aria-label="Atualizando lista de pedidos">
                <RefreshCcw className="w-3 h-3 animate-spin" aria-hidden="true" /> Atualizando...
              </span>
            )}
          </div>
        </div>
        
        {/* Barra de busca melhorada */}
        <div className="mt-4" role="search">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <label htmlFor="orders-search" className="sr-only">Buscar pedidos</label>
            <input
              id="orders-search"
              type="search"
              aria-label="Buscar por número do pedido ou cliente"
              className="w-full rounded-2xl bg-white/90 dark:bg-slate-900/60 border border-white/60 dark:border-slate-700/60 pl-11 pr-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/30 focus:border-[#EE4D2D]/40 transition-all shadow-sm"
              placeholder="Buscar por número do pedido ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && !notConfigured && <ShopeeErrorAlert message={friendlyError ?? "Erro ao carregar pedidos."} onRetry={onRetry} />}

      {notConfigured && <ShopeeNotConfiguredCard onRetry={onRetry} loading={loading} />}

      {isMockMode && (
        <div className="px-6 py-2 bg-amber-50/80 dark:bg-amber-900/20 border-b border-amber-200/60 dark:border-amber-800/40">
          <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <span className="text-sm">⚠️</span> Dados simulados para testes. Os números podem não corresponder à loja real.
          </p>
        </div>
      )}

      {isInitialLoading && (
        <div className="px-6 py-6 space-y-3" aria-busy="true" aria-live="polite" role="status">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-white/60 dark:bg-slate-800/60 p-4 animate-pulse" aria-hidden="true">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                </div>
                <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
              </div>
            </div>
          ))}
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-2">Carregando pedidos da Shopee...</p>
        </div>
      )}

      {renderEmpty && (
        <div className="px-6 py-8">
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-900/40 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700 dark:text-slate-300">Nenhum pedido encontrado</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Tente ampliar o período ou alterar o status.</p>
          </div>
        </div>
      )}

      {orders.length > 0 && !notConfigured && (
        <>
          {/* Desktop: Tabela moderna */}
          <div className="hidden md:block overflow-x-auto">
            <ShopeeOrdersTable orders={orders} expandedOrders={expandedOrders} setExpandedOrders={setExpandedOrders} />
          </div>

          {/* Mobile: Cards modernos */}
          <div className="md:hidden px-4 py-4 space-y-3">
            <ShopeeOrdersCardsMobile orders={orders} expandedOrders={expandedOrders} setExpandedOrders={setExpandedOrders} />
          </div>

          {/* Botão "Carregar mais" modernizado */}
          {(hasMore || nextCursor) && (
            <div className="px-6 pb-6 pt-2">
              <button
                type="button"
                disabled={loadingMore || !nextCursor}
                onClick={onLoadMore}
                className="group w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#EE4D2D] to-[#FF8566] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#EE4D2D]/30 hover:shadow-xl hover:shadow-[#EE4D2D]/40 hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {loadingMore ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12" />}
                {loadingMore ? "Carregando..." : "Carregar mais pedidos"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ShopeeOrdersTable({
  orders,
  expandedOrders,
  setExpandedOrders,
}: {
  orders: ShopeeOrder[];
  expandedOrders: Record<string, boolean>;
  setExpandedOrders: (value: Record<string, boolean>) => void;
}) {
  const toggle = (orderSn: string) => {
    setExpandedOrders({ ...expandedOrders, [orderSn]: !expandedOrders[orderSn] });
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full" role="table" aria-label="Lista de pedidos Shopee">
        <thead>
          <tr className="bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-700/60">
            <th scope="col" className="py-3.5 px-6 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pedido</th>
            <th scope="col" className="py-3.5 px-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
            <th scope="col" className="py-3.5 px-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data</th>
            <th scope="col" className="py-3.5 px-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valor</th>
            <th scope="col" className="py-3.5 px-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cliente</th>
            <th scope="col" className="py-3.5 px-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Destino</th>
            <th scope="col" className="py-3.5 px-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Transporte</th>
            <th scope="col" className="py-3.5 px-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {orders.map((order, idx) => {
            const statusStyle = getModernStatusStyle(order.order_status);
            const qtdItens = order.order_items?.length ?? 0;
            const expanded = expandedOrders[order.order_sn];
            const isUrgent = order.order_status === "READY_TO_SHIP" || order.order_status === "UNPAID";
            
            return (
              <tr 
                key={order.order_sn} 
                className={`hover:bg-white/60 dark:hover:bg-slate-800/40 transition-all duration-200 animate-fade-in-up ${
                  isUrgent ? "bg-amber-50/30 dark:bg-amber-900/10" : ""
                }`}
                style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "backwards" }}
              >
                {/* Pedido */}
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      isUrgent 
                        ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20" 
                        : "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600"
                    }`}>
                      {statusStyle.icon}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{order.order_sn}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{qtdItens} {qtdItens === 1 ? "item" : "itens"}</p>
                    </div>
                  </div>
                </td>
                
                {/* Status */}
                <td className="py-4 px-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyle.bgClass} ${statusStyle.textClass} ${statusStyle.pulseClass || ""}`}>
                    <span>{statusStyle.icon}</span>
                    {statusStyle.label}
                  </span>
                </td>
                
                {/* Data */}
                <td className="py-4 px-4">
                  <p className="text-sm text-slate-700 dark:text-slate-200">{formatDate(order.create_time)}</p>
                </td>
                
                {/* Valor */}
                <td className="py-4 px-4">
                  <p className="font-bold text-[#EE4D2D] text-sm">{formatCurrency(Number(order.total_amount) || 0)}</p>
                </td>
                
                {/* Cliente */}
                <td className="py-4 px-4">
                  <p className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
                    {order.recipient_address?.name || "—"}
                  </p>
                </td>
                
                {/* Destino */}
                <td className="py-4 px-4">
                  <p className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[160px]">
                    {order.recipient_address?.full_address || "—"}
                  </p>
                </td>
                
                {/* Transporte */}
                <td className="py-4 px-4">
                  <span className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                    🚚 {order.shipping_carrier || "—"}
                  </span>
                </td>
                
                {/* Ações */}
                <td className="py-4 px-4 text-center">
                  <button
                    type="button"
                    onClick={() => toggle(order.order_sn)}
                    aria-expanded={expanded}
                    aria-controls={`order-items-${order.order_sn}`}
                    aria-label={expanded ? `Fechar itens do pedido ${order.order_sn}` : `Ver itens do pedido ${order.order_sn}`}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50 focus:ring-offset-2 ${
                      expanded 
                        ? "bg-[#EE4D2D] text-white shadow-lg shadow-[#EE4D2D]/30" 
                        : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-[#EE4D2D]/10 hover:text-[#EE4D2D]"
                    }`}
                  >
                    <span className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
                    {expanded ? "Fechar" : "Itens"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {/* Área expandida dos itens - fora da tabela para melhor layout */}
      {orders.map((order) => {
        const expanded = expandedOrders[order.order_sn];
        if (!expanded) return null;
        return (
          <div 
            key={`items-${order.order_sn}`} 
            id={`order-items-${order.order_sn}`}
            role="region"
            aria-label={`Itens do pedido ${order.order_sn}`}
            className="px-6 py-4 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-700/60 animate-in slide-in-from-top-2 fade-in-0 duration-300"
          >
            <OrderItemsList items={order.order_items} orderSn={order.order_sn} />
          </div>
        );
      })}
    </div>
  );
}

function ShopeeOrdersCardsMobile({
  orders,
  expandedOrders,
  setExpandedOrders,
}: {
  orders: ShopeeOrder[];
  expandedOrders: Record<string, boolean>;
  setExpandedOrders: (value: Record<string, boolean>) => void;
}) {
  const toggle = (orderSn: string) => {
    setExpandedOrders({ ...expandedOrders, [orderSn]: !expandedOrders[orderSn] });
  };

  return (
    <div role="list" aria-label="Lista de pedidos">
      {orders.map((order, idx) => {
        const statusStyle = getModernStatusStyle(order.order_status);
        const qtdItens = order.order_items?.length ?? 0;
        const expanded = expandedOrders[order.order_sn];
        const isUrgent = order.order_status === "READY_TO_SHIP" || order.order_status === "UNPAID";
        
        return (
          <article
            key={order.order_sn}
            role="listitem"
            aria-label={`Pedido ${order.order_sn}, ${statusStyle.label}, ${formatCurrency(Number(order.total_amount) || 0)}`}
            className={`rounded-3xl border shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 animate-fade-in-up mb-3 ${
              isUrgent 
                ? "border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-50/80 to-white/80 dark:from-amber-900/20 dark:to-slate-900/80 hover:shadow-amber-200/30" 
                : "border-white/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 hover:shadow-slate-200/50"
            }`}
            style={{ animationDelay: `${idx * 80}ms`, animationFillMode: "backwards" }}
          >
            {/* Header do card */}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                    isUrgent 
                      ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30" 
                      : "bg-gradient-to-br from-[#EE4D2D] to-[#FF8566] shadow-lg shadow-[#EE4D2D]/20"
                  }`}>
                    {statusStyle.icon}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{order.order_sn}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(order.create_time)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-[#EE4D2D]">{formatCurrency(Number(order.total_amount) || 0)}</p>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle.bgClass} ${statusStyle.textClass} ${statusStyle.pulseClass || ""}`}>
                    {statusStyle.label}
                  </span>
                </div>
              </div>
              
              {/* Detalhes em grid */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/60 dark:bg-slate-700/40 p-2.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Cliente</p>
                  <p className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">
                    {order.recipient_address?.name || "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-white/60 dark:bg-slate-700/40 p-2.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Transporte</p>
                  <p className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">
                    🚚 {order.shipping_carrier || "—"}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl bg-white/60 dark:bg-slate-700/40 p-2.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Destino</p>
                  <p className="font-medium text-sm text-slate-800 dark:text-slate-100 line-clamp-2">
                    📍 {order.recipient_address?.full_address || "—"}
                  </p>
                </div>
              </div>
              
              {/* Botão expandir */}
              <button
                type="button"
                onClick={() => toggle(order.order_sn)}
                aria-expanded={expanded}
                aria-controls={`mobile-order-items-${order.order_sn}`}
                aria-label={expanded ? `Esconder itens do pedido ${order.order_sn}` : `Ver itens do pedido ${order.order_sn}`}
                className={`mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition-all duration-300 transform active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#EE4D2D]/50 focus:ring-offset-2 ${
                  expanded 
                    ? "bg-[#EE4D2D] text-white shadow-lg shadow-[#EE4D2D]/30" 
                    : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                }`}
              >
                <span className={`inline-block transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
                {expanded ? ` Esconder ${qtdItens} ${qtdItens === 1 ? "item" : "itens"}` : ` Ver ${qtdItens} ${qtdItens === 1 ? "item" : "itens"}`}
              </button>
            </div>
            
            {/* Área expandida */}
            {expanded && (
              <div 
                id={`mobile-order-items-${order.order_sn}`}
                role="region"
                aria-label={`Itens do pedido ${order.order_sn}`}
                className="border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-900/40 p-4 animate-in slide-in-from-top-2 fade-in-0 duration-300"
              >
                <OrderItemsList items={order.order_items} orderSn={order.order_sn} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function OrderItemsList({ items, orderSn }: { items?: ShopeeOrder["order_items"]; orderSn?: string }) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-4">
        <Package className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Sem itens informados</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-2" role="list" aria-label={`Itens do pedido ${orderSn || ''}`}>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3" aria-hidden="true">
        <span aria-hidden="true">📦</span> Itens do pedido {orderSn ? `#${orderSn}` : ""}
      </p>
      {items.map((item, idx) => (
        <div 
          key={`${item.item_id}-${item.model_id}`}
          role="listitem"
          aria-label={`${item.item_name}, ${formatCurrency(Number(item.variation_discounted_price) || Number(item.variation_original_price) || 0)}`}
          className="flex items-center gap-3 rounded-2xl bg-white/80 dark:bg-slate-800/60 p-3 border border-white/60 dark:border-slate-700/60 hover:shadow-md hover:scale-[1.01] hover:border-slate-200 dark:hover:border-slate-600 transition-all duration-200 animate-fade-in-up"
          style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "backwards" }}
        >
          {/* Thumbnail placeholder */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-lg flex-shrink-0 transition-transform duration-300 hover:scale-110 hover:rotate-6" aria-hidden="true">
            🛍️
          </div>
          
          {/* Info do item */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{item.item_name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {item.model_name || item.item_sku || "Variação padrão"}
            </p>
          </div>
          
          {/* Preço */}
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-[#EE4D2D]">
              {formatCurrency(Number(item.variation_discounted_price) || Number(item.variation_original_price) || 0)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Qtd: 1</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShopeeErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="px-6 pb-4" role="alert" aria-live="assertive">
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 text-rose-700 px-4 py-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-1" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold">Não foi possível carregar os pedidos da Shopee.</p>
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

function ShopeeNotConfiguredCard({ onRetry, loading }: { onRetry: () => void; loading: boolean }) {
  return (
    <div className="px-6 pb-6" role="complementary" aria-label="Configuração da integração Shopee">
      <div className="rounded-[28px] glass-panel glass-tint border border-amber-200/60 dark:border-amber-500/20 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-300">Ação necessária</p>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Integração Shopee pendente</h3>
          </div>
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Parece que a integração com a Shopee ainda não está configurada. Autorize o app e gere o access_token.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>1. Autorize o app Ambienta Gestor Shopee no painel da Shopee.</li>
          <li>2. Gere o código de autorização (code) e troque por access_token.</li>
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
