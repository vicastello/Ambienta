'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import {
  ShoppingCart,
  TrendingUp,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Sparkles,
  AlertTriangle,
  Target,
  Info,
  Package,
} from 'lucide-react';

// Custom Tooltip com Blur
function CustomTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload) return null;

  return (
    <div
      className="rounded-lg p-3 border border-white/40 dark:border-slate-700/40"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        color: 'var(--text-main)',
        fontSize: '11px',
        zIndex: 9999,
      }}
    >
      <p style={{ margin: '0 0 4px 0' }}>
        {label ? `Dia ${label}` : 'Data'}
      </p>
      {payload.map((entry: any, index: number) => (
        <p key={index} style={{ margin: '2px 0', color: entry.color }}>
          <strong>{entry.name}:</strong> {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;

  return (
    <div
      className="rounded-lg p-3 border border-white/40 dark:border-slate-700/40"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        color: 'var(--text-main)',
        fontSize: '11px',
        zIndex: 9999,
      }}
    >
      <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>
        {data.name}
      </p>
      <p style={{ margin: '2px 0', color: payload[0].fill }}>
        <strong>Faturamento:</strong> {payload[0].value?.toLocaleString?.('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }) || payload[0].value}
      </p>
      <p style={{ margin: '2px 0', fontSize: '10px', color: 'var(--text-muted)' }}>
        ({data.pedidos} pedidos)
      </p>
    </div>
  );
}

// Ambienta colors
const AMBIENTA_PRIMARY = '#009DA8';
const AMBIENTA_LIGHT = '#00B5C3';
const AMBIENTA_DARK = '#006E76';
const COLORS_PALETTE = [AMBIENTA_PRIMARY, '#22c55e', '#f97316', '#0ea5e9', '#a855f7'];
const GLOBAL_INTERVAL_DAYS = 30;
const SPARK_WINDOW_DAYS = 7;
const PIE_LABEL_RAD = Math.PI / 180;

const renderChannelPercentLabel = (props: any) => {
  const { cx, cy, midAngle, outerRadius, percent: slicePercent, payload } = props ?? {};
  const resolvedPercent =
    typeof slicePercent === 'number'
      ? slicePercent
      : typeof payload?.percentage === 'number'
        ? payload.percentage / 100
        : 0;
  if (!cx || !cy || !outerRadius || resolvedPercent <= 0 || resolvedPercent * 100 < 4) {
    return null;
  }
  const radius = Number(outerRadius) * 1.12;
  const x = cx + radius * Math.cos(-midAngle * PIE_LABEL_RAD);
  const y = cy + radius * Math.sin(-midAngle * PIE_LABEL_RAD);

  return (
    <text
      x={x}
      y={y}
      fill="var(--text-main)"
      fontSize={12}
      fontWeight={600}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      opacity={resolvedPercent > 0 ? 0.9 : 0}
    >
      {(resolvedPercent * 100).toFixed(0)}%
    </text>
  );
};

type DiaResumo = {
  data: string;
  quantidade: number;
  totalDia: number;
};

type SituacaoResumo = {
  situacao: number;
  descricao: string;
  quantidade: number;
};

type PeriodoResumo = {
  dataInicial: string;
  dataFinal: string;
  dias: number;
  totalPedidos: number;
  totalValor: number;
  totalValorLiquido: number;
  totalFreteTotal: number;
  ticketMedio: number;
  vendasPorDia: DiaResumo[];
  pedidosPorSituacao: SituacaoResumo[];
  totalProdutosVendidos: number;
  percentualCancelados: number;
  topProdutos: ProdutoResumo[];
};

type CanalResumo = {
  canal: string;
  totalValor: number;
  totalPedidos: number;
};

type ProdutoResumo = {
  produtoId: number | null;
  sku?: string | null;
  descricao: string;
  quantidade: number;
  receita: number;
  imagemUrl?: string | null;
};

type SituacaoDisponivel = {
  codigo: number;
  descricao: string;
};

type DashboardResumo = {
  periodoAtual: PeriodoResumo;
  periodoAnterior: PeriodoResumo;
  periodoAnteriorCards: PeriodoResumo;
  canais: CanalResumo[];
  canaisDisponiveis: string[];
  situacoesDisponiveis: SituacaoDisponivel[];
};

type InsightTone = 'info' | 'opportunity' | 'risk' | 'action';

type InsightCard = {
  id: string;
  title: string;
  body?: string;
  tone: InsightTone;
  dismissible?: boolean;
};

type InsightThemeConfig = {
  label: string;
  icon: typeof Info;
  bg: string;
  border: string;
  iconBg: string;
  iconColor: string;
};

const INSIGHT_THEMES: Record<InsightTone, InsightThemeConfig> = {
  info: {
    label: 'Insight',
    icon: Info,
    bg: 'bg-white/80 dark:bg-slate-900/70',
    border: 'border-white/60 dark:border-slate-800/60',
    iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800/80',
    iconColor: 'text-slate-600 dark:text-slate-300',
  },
  opportunity: {
    label: 'Oportunidade',
    icon: Sparkles,
    bg: 'bg-emerald-50/80 dark:bg-emerald-500/10',
    border: 'border-emerald-200/60',
    iconBg: 'bg-emerald-100/80',
    iconColor: 'text-emerald-600',
  },
  risk: {
    label: 'Risco',
    icon: AlertTriangle,
    bg: 'bg-rose-50/80 dark:bg-rose-500/10',
    border: 'border-rose-200/60',
    iconBg: 'bg-rose-100/80',
    iconColor: 'text-rose-600',
  },
  action: {
    label: 'Ação',
    icon: Target,
    bg: 'bg-amber-50/80 dark:bg-amber-500/10',
    border: 'border-amber-200/60',
    iconBg: 'bg-amber-100/80',
    iconColor: 'text-amber-600',
  },
};

type DatePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | 'month'
  | '3m'
  | 'year'
  | 'custom';

type SavedFilters = {
  preset: DatePreset;
  customStart: string | null;
  customEnd: string | null;
  canaisSelecionados: string[];
  situacoesSelecionadas: number[];
};

const FILTERS_STORAGE_KEY = 'tiny_dash_filters_v1';
const COLORS = COLORS_PALETTE;
const DASHBOARD_CACHE_PREFIX = 'tiny_dash_state_v1';
const RESUMO_CACHE_PREFIX = `${DASHBOARD_CACHE_PREFIX}:resumo`;
const GLOBAL_CACHE_PREFIX = `${DASHBOARD_CACHE_PREFIX}:global`;
const CHART_CACHE_PREFIX = `${DASHBOARD_CACHE_PREFIX}:chart`;

const MARKETPLACE_COLORS: Record<string, string> = {
  'Mercado Livre': '#ffcc00',
  Shopee: '#ee4d2d',
  Amazon: '#232f3e',
  Magalu: '#1574ff',
  B2W: '#ff5a5f',
  Americanas: '#d6001c',
  Submarino: '#1b76ff',
  'Magazine Luiza': '#1574ff',
  'Loja Integrada': '#1bb6aa',
  Tray: '#5f6bff',
  Tiny: AMBIENTA_PRIMARY,
  Outros: '#94a3b8',
};

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

function loadSavedFilters(): SavedFilters | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedFilters;
  } catch (err) {
    console.error('Erro ao carregar filtros salvos', err);
    return null;
  }
}

function safeReadCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    return parsed?.data ?? null;
  } catch (err) {
    console.warn('Falha ao ler cache do dashboard', err);
    return null;
  }
}

function safeWriteCache<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    const payload: CacheEntry<T> = { data, timestamp: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn('Falha ao salvar cache do dashboard', err);
  }
}

function buildResumoCacheKey(
  inicio: string,
  fim: string,
  canais: string[],
  situacoes: number[]
) {
  const canaisKey = canais.length ? [...canais].sort().join('|') : 'all';
  const situacoesKey = situacoes.length ? [...situacoes].sort((a, b) => a - b).join('|') : 'all';
  return `${RESUMO_CACHE_PREFIX}:${inicio}:${fim}:${canaisKey}:${situacoesKey}`;
}

function buildGlobalCacheKey(
  inicio: string,
  fim: string,
  canais: string[],
  situacoes: number[]
) {
  const canaisKey = canais.length ? [...canais].sort().join('|') : 'all';
  const situacoesKey = situacoes.length ? [...situacoes].sort((a, b) => a - b).join('|') : 'all';
  return `${GLOBAL_CACHE_PREFIX}:${inicio}:${fim}:${canaisKey}:${situacoesKey}`;
}

function buildChartCacheKey(
  inicio: string,
  fim: string,
  preset: ChartPreset,
  customStart: string | null,
  customEnd: string | null
) {
  const customKey = `${customStart ?? 'na'}:${customEnd ?? 'na'}`;
  return `${CHART_CACHE_PREFIX}:${preset}:${customKey}:${inicio}:${fim}`;
}

function formatBRL(valor: number | null | undefined) {
  const n =
    typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function labelSituacao(s: number) {
  const mapa: Record<number, string> = {
    8: 'Dados incompletos',
    0: 'Aberta',
    3: 'Aprovada',
    4: 'Preparando envio',
    1: 'Faturada',
    7: 'Pronto para envio',
    5: 'Enviada',
    6: 'Entregue',
    2: 'Cancelada',
    9: 'Não entregue',
    [-1]: 'Sem situação',
  };
  return mapa[s] ?? `Situação ${s}`;
}

function isoToday() {
  const now = new Date();
  // Corrige o shift de timezone causado por toISOString (sempre UTC)
  // garantindo que "hoje" reflita o dia local do usuário.
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDays(baseIso: string, offset: number) {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function startOfMonthFrom(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function startOfYearFrom(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setMonth(0);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function diffDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00`);
  const b = new Date(`${endIso}T00:00:00`);
  const diff = b.getTime() - a.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function formatDateTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getInitials(text?: string | null) {
  if (!text) return 'A';
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  const initials = parts.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '');
  return initials.join('') || 'A';
}

type ChartPreset = 'today' | '7d' | '30d' | 'month' | 'custom';

export default function DashboardPage() {
  const [initialFilters] = useState<SavedFilters | null>(() => loadSavedFilters());
  const [preset, setPreset] = useState<DatePreset>(initialFilters?.preset ?? '7d');
  const [customStart, setCustomStart] = useState<string | null>(initialFilters?.customStart ?? null);
  const [customEnd, setCustomEnd] = useState<string | null>(initialFilters?.customEnd ?? null);

  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resumoGlobal, setResumoGlobal] = useState<DashboardResumo | null>(null);
  const [loadingGlobal, setLoadingGlobal] = useState<boolean>(true);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);

  const [canaisSelecionados, setCanaisSelecionados] = useState<string[]>(
    initialFilters?.canaisSelecionados ?? []
  );
  const [situacoesSelecionadas, setSituacoesSelecionadas] = useState<number[]>(
    initialFilters?.situacoesSelecionadas ?? []
  );

  const [chartPreset, setChartPreset] = useState<ChartPreset>('month');
  const [chartCustomStart, setChartCustomStart] = useState<string | null>(null);
  const [chartCustomEnd, setChartCustomEnd] = useState<string | null>(null);
  const [resumoChart, setResumoChart] = useState<DashboardResumo | null>(null);
  const [loadingChart, setLoadingChart] = useState<boolean>(true);
  const [erroChart, setErroChart] = useState<string | null>(null);
  const [complementLoading, setComplementLoading] = useState<boolean>(false);
  const [complementMsg, setComplementMsg] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [autoComplementedRanges, setAutoComplementedRanges] = useState<Record<string, boolean>>({});
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [loadingInsights, setLoadingInsights] = useState<boolean>(false);
  const [erroInsights, setErroInsights] = useState<string | null>(null);
  const [panelMaxHeight, setPanelMaxHeight] = useState<number | null>(null);
  const [insightsBaseline, setInsightsBaseline] = useState<DashboardResumo | null>(null);

  type RecentOrder = {
    tinyId: number;
    numeroPedido: number | null;
    dataCriacao: string;
    valor: number;
    situacao: number;
    canal: string | null;
    cliente: string | null;
    primeiraImagem?: string | null;
    itensQuantidade?: number;
  };
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loadingRecentOrders, setLoadingRecentOrders] = useState<boolean>(false);

  // Refs para evitar chamadas simultâneas
  const isLoadingRef = useRef(false);
  const isLoadingChartRef = useRef(false);
  const isLoadingGlobalRef = useRef(false);
  const isLoadingInsightsBaseRef = useRef(false);
  const insightsScrollRef = useRef<HTMLDivElement | null>(null);
  const heroCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const toSave: SavedFilters = { preset, customStart, customEnd, canaisSelecionados, situacoesSelecionadas };
    try {
      window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.error('Erro ao salvar filtros', err);
    }
  }, [preset, customStart, customEnd, canaisSelecionados, situacoesSelecionadas]);

  function resolverIntervalo(): { inicio: string; fim: string } {
    const hojeIso = isoToday();
    if (preset === 'today') return { inicio: hojeIso, fim: hojeIso };
    if (preset === 'yesterday') {
      const ontem = addDays(hojeIso, -1);
      return { inicio: ontem, fim: ontem };
    }
    if (preset === '7d') {
      const fim = hojeIso;
      const inicio = addDays(fim, -6);
      return { inicio, fim };
    }
    if (preset === 'month') {
      const inicio = startOfMonthFrom(hojeIso);
      return { inicio, fim: hojeIso };
    }
    if (preset === '3m') {
      const fim = hojeIso;
      const dFim = new Date(`${fim}T00:00:00`);
      dFim.setMonth(dFim.getMonth() - 2);
      const inicio = startOfMonthFrom(dFim.toISOString().slice(0, 10));
      return { inicio, fim };
    }
    if (preset === 'year') {
      const fim = hojeIso;
      const inicio = startOfYearFrom(fim);
      return { inicio, fim };
    }
    if (customStart && customEnd) return { inicio: customStart, fim: customEnd };
    const fim = hojeIso;
    const inicio = addDays(fim, -29);
    return { inicio, fim };
  }

  function resolverIntervaloGlobal(): { inicio: string; fim: string } {
    const fim = isoToday();
    const inicio = addDays(fim, -(GLOBAL_INTERVAL_DAYS - 1));
    return { inicio, fim };
  }

  async function carregarResumo() {
    // Evitar chamadas simultâneas
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      const { inicio, fim } = resolverIntervalo();
      const cacheKey = buildResumoCacheKey(inicio, fim, canaisSelecionados, situacoesSelecionadas);
      const cachedResumo = safeReadCache<DashboardResumo>(cacheKey);
      if (cachedResumo) {
        setResumo(cachedResumo);
      }
      setLoading(!cachedResumo);
      setErro(null);
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      const hojeIso = isoToday();
      if (fim === hojeIso) {
        const now = new Date();
        const minutos = now.getHours() * 60 + now.getMinutes();
        params.set('horaComparacaoMinutos', String(minutos));
      }
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar resumo do dashboard');
      const parsedResumo = json as DashboardResumo;
      setResumo(parsedResumo);
      safeWriteCache(cacheKey, parsedResumo);
      try {
        const { inicio, fim } = resolverIntervalo();
        const diasEsperados = 1 + diffDays(inicio, fim);
        const atualDias = parsedResumo.periodoAtual.vendasPorDia.length ?? 0;
        const key = `${inicio}_${fim}`;
        const already = !!autoComplementedRanges[key];
        if (preset === 'month' && !already && atualDias < diasEsperados) {
          setAutoComplementedRanges((prev) => ({ ...prev, [key]: true }));
          setComplementLoading(true);
          const url = `/api/tiny/dashboard/resumo?dataInicial=${inicio}&dataFinal=${fim}&complement=1`;
          const resC = await fetch(url, { cache: 'no-store' });
          if (resC.ok) {
            setComplementMsg('Dados completados automaticamente');
            setTimeout(() => setComplementMsg(null), 5000);
          } else {
            const j = await resC.json().catch(() => ({}));
            setComplementMsg(j?.message || 'Erro ao complementar automaticamente');
            setTimeout(() => setComplementMsg(null), 5000);
          }
          setComplementLoading(false);
        }
      } catch (e) {
        // swallow
      }
    } catch (e: any) {
      setErro(e?.message ?? 'Erro inesperado ao carregar dashboard');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }

  async function carregarResumoGlobal() {
    if (isLoadingGlobalRef.current) return;
    isLoadingGlobalRef.current = true;

    try {
      const { inicio, fim } = resolverIntervaloGlobal();
      const cacheKey = buildGlobalCacheKey(inicio, fim, canaisSelecionados, situacoesSelecionadas);
      const cachedGlobal = safeReadCache<DashboardResumo>(cacheKey);
      if (cachedGlobal) setResumoGlobal(cachedGlobal);
      setLoadingGlobal(!cachedGlobal);
      setErroGlobal(null);
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar visão consolidada');
      const parsedGlobal = json as DashboardResumo;
      setResumoGlobal(parsedGlobal);
      safeWriteCache(cacheKey, parsedGlobal);
    } catch (e: any) {
      setErroGlobal(e?.message ?? 'Erro inesperado ao carregar visão consolidada');
    } finally {
      setLoadingGlobal(false);
      isLoadingGlobalRef.current = false;
    }
  }

  async function carregarResumoInsightsBase() {
    if (isLoadingInsightsBaseRef.current) return;
    isLoadingInsightsBaseRef.current = true;

    try {
      const { inicio, fim } = resolverIntervaloGlobal();
      const cacheKey = buildGlobalCacheKey(inicio, fim, [], []);
      const cached = safeReadCache<DashboardResumo>(cacheKey);
      if (cached) setInsightsBaseline(cached);
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar base de insights');
      const parsed = json as DashboardResumo;
      setInsightsBaseline(parsed);
      safeWriteCache(cacheKey, parsed);
    } catch (e) {
      console.error('Erro ao carregar base de insights', e);
    } finally {
      isLoadingInsightsBaseRef.current = false;
    }
  }

  useEffect(() => {
    console.log('[DEBUG] carregarResumo triggered', { preset, customStart, customEnd, canais: canaisSelecionados, situacoes: situacoesSelecionadas });
    carregarResumo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd, canaisSelecionados, situacoesSelecionadas]);

  useEffect(() => {
    carregarResumoGlobal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canaisSelecionados, situacoesSelecionadas]);

  useEffect(() => {
    carregarResumoInsightsBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLastSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchRecentOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateHeight = () => {
      if (!heroCardRef.current) return;
      setPanelMaxHeight(heroCardRef.current.offsetHeight);
    };
    updateHeight();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && heroCardRef.current) {
      observer = new ResizeObserver(() => updateHeight());
      observer.observe(heroCardRef.current);
    }
    window.addEventListener('resize', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!insightsBaseline) return;
    gerarInsights(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightsBaseline]);

  // Removed auto-refresh - only refresh on page reload or manual action

  async function fetchLastSync() {
    try {
      const res = await fetch('/api/tiny/sync/last-updated', { cache: 'no-store' });
      const j = await res.json();
      if (res.ok && j?.lastUpdated) setLastSync(j.lastUpdated);
      else setLastSync(null);
    } catch (e) {
      setLastSync(null);
    }
  }

  async function fetchRecentOrders() {
    try {
      setLoadingRecentOrders(true);
      const today = new Date();
      const end = today.toISOString().slice(0, 10);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 89);
      const start = startDate.toISOString().slice(0, 10);
      const params = new URLSearchParams({
        page: '1',
        pageSize: '10',
        sortBy: 'numero_pedido',
        sortDir: 'desc',
        dataInicial: start,
        dataFinal: end,
      });
      const res = await fetch(`/api/orders?${params.toString()}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.orders)) {
        setRecentOrders(json.orders);
      }
    } catch (e) {
      console.error('Erro ao carregar pedidos recentes:', e);
    } finally {
      setLoadingRecentOrders(false);
    }
  }

  function resolverIntervaloChart(): { inicio: string; fim: string } {
    const hojeIso = isoToday();
    if (chartPreset === 'today') return { inicio: hojeIso, fim: hojeIso };
    if (chartPreset === '7d') {
      const fim = hojeIso;
      const inicio = addDays(fim, -6);
      return { inicio, fim };
    }
    if (chartPreset === '30d') {
      const fim = hojeIso;
      const inicio = addDays(fim, -29);
      return { inicio, fim };
    }
    if (chartPreset === 'month') {
      const hoje = new Date(`${hojeIso}T00:00:00`);
      const inicio = startOfMonthFrom(hojeIso);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
      return { inicio, fim };
    }
    if (chartCustomStart && chartCustomEnd) return { inicio: chartCustomStart, fim: chartCustomEnd };
    const hoje = new Date(`${hojeIso}T00:00:00`);
    const inicio = startOfMonthFrom(hojeIso);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { inicio, fim };
  }

  async function carregarResumoChart() {
    // Evitar chamadas simultâneas
    if (isLoadingChartRef.current) return;
    isLoadingChartRef.current = true;

    try {
      const { inicio, fim } = resolverIntervaloChart();
      const cacheKey = buildChartCacheKey(inicio, fim, chartPreset, chartCustomStart, chartCustomEnd);
      const cachedChart = safeReadCache<DashboardResumo>(cacheKey);
      if (cachedChart) setResumoChart(cachedChart);
      setLoadingChart(!cachedChart);
      setErroChart(null);
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar resumo (gráfico)');
      const parsedChart = json as DashboardResumo;
      setResumoChart(parsedChart);
      safeWriteCache(cacheKey, parsedChart);
      try {
        const { inicio, fim } = resolverIntervaloChart();
        const diasEsperados = 1 + diffDays(inicio, fim);
        const atualDias = parsedChart.periodoAtual.vendasPorDia.length ?? 0;
        const key = `${inicio}_${fim}`;
        const already = !!autoComplementedRanges[key];
        if (chartPreset === 'month' && !already && atualDias < diasEsperados) {
          setAutoComplementedRanges((prev) => ({ ...prev, [key]: true }));
          setComplementLoading(true);
          const url = `/api/tiny/dashboard/resumo?dataInicial=${inicio}&dataFinal=${fim}&complement=1`;
          const resC = await fetch(url, { cache: 'no-store' });
          if (resC.ok) {
            setComplementMsg('Dados completados automaticamente');
            setTimeout(() => setComplementMsg(null), 5000);
          } else {
            const j = await resC.json().catch(() => ({}));
            setComplementMsg(j?.message || 'Erro ao complementar automaticamente');
            setTimeout(() => setComplementMsg(null), 5000);
          }
          setComplementLoading(false);
        }
      } catch (e) {
        // swallow
      }
    } catch (e: any) {
      setErroChart(e?.message ?? 'Erro inesperado ao carregar gráfico');
    } finally {
      setLoadingChart(false);
      isLoadingChartRef.current = false;
    }
  }

  useEffect(() => {
    console.log('[DEBUG] carregarResumoChart triggered', { chartPreset, chartCustomStart, chartCustomEnd });
    carregarResumoChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPreset, chartCustomStart, chartCustomEnd]);

  async function handleComplementChart() {
    try {
      setComplementLoading(true);
      setComplementMsg(null);
      const { inicio, fim } = resolverIntervaloChart();
      const url = `/api/tiny/dashboard/resumo?dataInicial=${inicio}&dataFinal=${fim}&complement=1`;
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.details || json?.message || `Erro ao complementar: ${res.status}`;
        setComplementMsg(msg);
        return;
      }
      setComplementMsg('Complemento realizado.');
      setTimeout(() => setComplementMsg(null), 6_000);
    } catch (e: any) {
      setComplementMsg(e?.message ?? 'Erro inesperado ao complementar.');
    } finally {
      setComplementLoading(false);
      setTimeout(() => setComplementMsg(null), 6_000);
    }
  }

  async function gerarInsights(autoTrigger = false) {
    if (!insightsBaseline) return;
    if (loadingInsights && autoTrigger) return;
    try {
      if (!autoTrigger) setInsights([]);
      setLoadingInsights(true);
      setErroInsights(null);
      const payload = {
        resumoAtual: insightsBaseline,
        resumoGlobal: null,
        visaoFiltrada: resumo,
        filtrosVisuais: {
          preset,
          customStart,
          customEnd,
          canaisSelecionados,
          situacoesSelecionadas,
        },
        contexto: 'Dashboard Ambienta · Insights consolidados (30 dias, sem filtros)',
      };
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || json?.details || 'Erro ao gerar insights');
      const text: string = json?.insights ?? '';
      const linhas = text
        .split('\n')
        .map((linha: string) => linha.replace(/^[\u2212\-•\s]+/, '').trim())
        .filter(Boolean);
      const timestamp = Date.now();
      if (!linhas.length) {
        setInsights([
          {
            id: `${timestamp}-fallback`,
            title: 'Sem insights no momento',
            body: 'Assim que o Gemini gerar novas recomendações elas aparecerão aqui.',
            dismissible: false,
            tone: 'info',
          },
        ]);
      } else {
        setInsights(
          linhas.map((linha, index) =>
            buildInsightCardFromLine(linha, `${timestamp}-${index}`)
          )
        );
      }
    } catch (e: any) {
      setErroInsights(e?.message ?? 'Erro inesperado ao gerar insights');
    } finally {
      setLoadingInsights(false);
    }
  }

  function dismissInsightCard(id: string) {
    setInsights((prev) => prev.filter((item) => item.id !== id));
  }

  function removeDiacritics(texto: string) {
    try {
      return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch {
      return texto;
    }
  }

  function classifyTone(title: string, body: string): InsightTone {
    const normalized = removeDiacritics(`${title} ${body}`.toLowerCase());
    if (normalized.includes('oportunidade')) return 'opportunity';
    if (normalized.includes('risco') || normalized.includes('queda')) return 'risk';
    if (normalized.includes('acao') || normalized.includes('plano') || normalized.includes('investir')) return 'action';
    return 'info';
  }

  function buildInsightCardFromLine(linha: string, id: string): InsightCard {
    const headingMatch = linha.match(/^#{1,3}\s*(.+)$/i);
    if (headingMatch) {
      const heading = headingMatch[1].trim();
      return {
        id,
        title: heading,
        tone: 'info',
        dismissible: true,
      };
    }

    const boldMatch = linha.match(/^\*?\s*\*\*(.+?)\*\*\s*(.*)$/);
    let title = 'Insight';
    let body = linha;
    if (boldMatch) {
      title = boldMatch[1].trim();
      body = boldMatch[2].replace(/^[:\-\s]+/, '').trim();
    }

    const tone = classifyTone(title, body);
    return {
      id,
      title: title || 'Insight',
      body,
      tone,
      dismissible: true,
    };
  }

  const chartData = useMemo(() => {
    if (!resumoChart) return [];
    const mapaAtual = new Map<string, number>();
    const mapaAnterior = new Map<string, number>();
    resumoChart.periodoAtual.vendasPorDia.forEach((d) => mapaAtual.set(d.data, d.totalDia));
    resumoChart.periodoAnterior.vendasPorDia.forEach((d) => mapaAnterior.set(d.data, d.totalDia));
    let dates: string[] = [];
    if (chartPreset === 'month') {
      let cursor = resumoChart.periodoAnterior.dataInicial;
      const diasSet = new Set<string>();
      while (cursor <= resumoChart.periodoAnterior.dataFinal) {
        const dia = cursor.split('-')[2];
        diasSet.add(dia);
        cursor = addDays(cursor, 1);
      }
      cursor = resumoChart.periodoAtual.dataInicial;
      while (cursor <= resumoChart.periodoAtual.dataFinal) {
        const dia = cursor.split('-')[2];
        diasSet.add(dia);
        cursor = addDays(cursor, 1);
      }
      dates = Array.from(diasSet).sort((a, b) => Number(a) - Number(b));
    } else {
      let cursor = resumoChart.periodoAtual.dataInicial;
      while (cursor <= resumoChart.periodoAtual.dataFinal) {
        dates.push(cursor);
        cursor = addDays(cursor, 1);
      }
    }
    return dates.map((dateOrDay) => {
      let diaDoMes: string;
      let dataAtual: string;
      if (chartPreset === 'month') {
        diaDoMes = dateOrDay.padStart(2, '0');
        dataAtual = resumoChart.periodoAtual.dataInicial.slice(0, 8) + diaDoMes;
      } else {
        dataAtual = dateOrDay;
        diaDoMes = dateOrDay.split('-')[2];
      }
      const dataAnteriorCorrespondente = resumoChart.periodoAnterior.dataInicial.slice(0, 8) + diaDoMes;
      return {
        data: diaDoMes,
        atual: mapaAtual.get(dataAtual) ?? 0,
        anterior: mapaAnterior.get(dataAnteriorCorrespondente) ?? 0,
      };
    });
  }, [resumoChart, chartPreset]);

  const canaisData = useMemo(() => {
    if (!resumo) return [];
    const total = resumo.canais.reduce((acc, canal) => acc + (canal.totalValor || 0), 0);
    return resumo.canais
      .map((c, idx) => {
        const name = c.canal || 'Outros';
        const baseColor = MARKETPLACE_COLORS[name] ?? COLORS_PALETTE[idx % COLORS_PALETTE.length];
        return {
          name,
          value: c.totalValor,
          pedidos: c.totalPedidos,
          percentage: total > 0 ? (c.totalValor / total) * 100 : 0,
          color: baseColor,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [resumo]);

  const totalCanaisValue = useMemo(() => {
    return canaisData.reduce((acc, canal) => acc + (canal.value ?? 0), 0);
  }, [canaisData]);

  const variacaoValorCards = useMemo(() => {
    if (!resumo) return { abs: 0, perc: 0 };
    const atual = resumo.periodoAtual.totalValor;
    const ant = resumo.periodoAnteriorCards.totalValor;
    const abs = atual - ant;
    const perc = ant > 0 ? (atual / ant - 1) * 100 : 0;
    return { abs, perc };
  }, [resumo]);

  const { inicio: intervaloInicio, fim: intervaloFim } = resolverIntervalo();
  const diasIntervalo = 1 + Math.max(diffDays(intervaloInicio, intervaloFim), 0);
  const resumoAtual = resumo?.periodoAtual;
  const resumoGlobalAtual = resumoGlobal?.periodoAtual;

  const sparkData = useMemo(() => {
    if (!resumoGlobalAtual) return [];
    return resumoGlobalAtual.vendasPorDia
      .slice(-SPARK_WINDOW_DAYS)
      .map((dia) => ({
        label: dia.data.split('-')[2],
        value: dia.totalDia,
      }));
  }, [resumoGlobalAtual]);

  const topSituacoes = useMemo(() => {
    if (!resumoAtual) return [];
    return [...resumoAtual.pedidosPorSituacao]
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 4);
  }, [resumoAtual]);

  const trendingDias = useMemo(() => {
    if (!resumoGlobalAtual) return [];
    return resumoGlobalAtual.vendasPorDia.slice(-4).reverse();
  }, [resumoGlobalAtual]);

  const quickHighlights = useMemo(() => {
    if (!resumoGlobalAtual) return [];
    const diasMonitorados = resumoGlobalAtual.dias || resumoGlobalAtual.vendasPorDia.length || 1;
    const mediaDiaria = diasMonitorados > 0 ? resumoGlobalAtual.totalValor / diasMonitorados : 0;
    const fretePerc = resumoGlobalAtual.totalValor > 0 ? (resumoGlobalAtual.totalFreteTotal / resumoGlobalAtual.totalValor) * 100 : 0;
    const melhorDia = [...resumoGlobalAtual.vendasPorDia].sort((a, b) => b.totalDia - a.totalDia)[0];
    const melhorCanal = [...(resumo?.canais ?? [])].sort((a, b) => b.totalValor - a.totalValor)[0];

    return [
      {
        label: 'Média diária',
        value: formatBRL(mediaDiaria),
        helper: `${diasMonitorados} dias monitorados`,
      },
      {
        label: 'Frete total',
        value: formatBRL(resumoGlobalAtual.totalFreteTotal),
        helper: `${fretePerc.toFixed(1)}% do bruto`,
      },
      melhorDia && {
        label: 'Melhor dia',
        value: formatBRL(melhorDia.totalDia),
        helper: melhorDia.data,
      },
      melhorCanal && {
        label: 'Maior canal',
        value: formatBRL(melhorCanal.totalValor),
        helper: `${melhorCanal.canal} · ${melhorCanal.totalPedidos} pedidos`,
      },
    ].filter(Boolean) as Array<{ label: string; value: string; helper: string }>;
  }, [resumoGlobalAtual, resumo]);

  const cancelamentoPerc = resumoAtual?.percentualCancelados ?? 0;
  const totalProdutosVendidos = resumoAtual?.totalProdutosVendidos ?? 0;
  const topProdutos = resumoAtual?.topProdutos?.slice(0, 5) ?? [];

  return (
    <AppLayout title="Dashboard Ambienta">
      <div className="space-y-8">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div
            ref={heroCardRef}
            className="rounded-[36px] border border-white/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/70 backdrop-blur-2xl shadow-[0_25px_90px_rgba(15,23,42,0.12)] p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500/80">Bem-vindo de volta</p>
                <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white">Visão geral do Tiny</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{intervaloInicio} • {intervaloFim} · {diasIntervalo} dias monitorados</p>
                {lastSync && (
                  <p className="text-xs text-slate-400 mt-2" suppressHydrationWarning>
                    Última sincronização {formatDateTime(lastSync)}
                  </p>
                )}
              </div>
              <div className="flex flex-1 justify-end flex-wrap gap-3">
                <div className="rounded-[20px] border border-white/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-4 min-w-[200px] max-w-[260px]">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Período</p>
                  <MultiSelectDropdown
                    label="Período"
                    options={[
                      { value: 'today', label: 'Hoje' },
                      { value: 'yesterday', label: 'Ontem' },
                      { value: '7d', label: '7 dias' },
                      { value: 'month', label: 'Mês' },
                      { value: '3m', label: '3 meses' },
                      { value: 'year', label: 'Ano' },
                      { value: 'custom', label: 'Personalizado' },
                    ]}
                    selected={[preset]}
                    onChange={(values) => setPreset(values[0] as DatePreset)}
                    onClear={() => setPreset('month')}
                    singleSelect
                    displayFormatter={(values, options) => {
                      if (!values.length) return 'Selecione...';
                      const option = options.find((opt) => opt.value === values[0]);
                      return option?.label ?? 'Selecione...';
                    }}
                  />
                  {preset === 'custom' && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <input type="date" className="app-input flex-1" value={customStart ?? ''} onChange={(e) => setCustomStart(e.target.value || null)} />
                      <span className="text-slate-400">a</span>
                      <input type="date" className="app-input flex-1" value={customEnd ?? ''} onChange={(e) => setCustomEnd(e.target.value || null)} />
                    </div>
                  )}
                </div>

                <div className="rounded-[20px] border border-white/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-4 min-w-[200px] max-w-[260px]">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Canais</p>
                  {resumo ? (
                    <MultiSelectDropdown
                      label="Canais"
                      options={resumo.canaisDisponiveis.map((canal) => ({ value: canal, label: canal }))}
                      selected={canaisSelecionados}
                      onChange={(values) => setCanaisSelecionados(values as string[])}
                      onClear={() => setCanaisSelecionados([])}
                    />
                  ) : (
                    <p className="text-xs text-slate-400">Carregando…</p>
                  )}
                </div>

                <div className="rounded-[20px] border border-white/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-4 min-w-[200px] max-w-[260px]">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Situações</p>
                  {resumo ? (
                    <MultiSelectDropdown
                      label="Situações"
                      options={resumo.situacoesDisponiveis.map((sit) => ({ value: sit.codigo, label: sit.descricao }))}
                      selected={situacoesSelecionadas}
                      onChange={(values) => setSituacoesSelecionadas(values as number[])}
                      onClear={() => setSituacoesSelecionadas([])}
                    />
                  ) : (
                    <p className="text-xs text-slate-400">Carregando…</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[28px] border border-white/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl p-6 shadow-inner shadow-white/40 space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2 truncate">Faturamento líquido</p>
                    <p className="text-3xl font-semibold text-[#5b21b6] break-words">{formatBRL(resumoAtual?.totalValorLiquido ?? 0)}</p>
                    <div className="mt-3 min-h-[32px] flex items-center gap-2 text-sm min-w-0">
                      {variacaoValorCards.abs >= 0 ? (
                        <>
                          <div className="flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-1 text-emerald-600 shrink-0">
                            <ArrowUpRight className="w-4 h-4" />
                            <span>+{variacaoValorCards.perc.toFixed(1)}%</span>
                          </div>
                          <span className="text-slate-500 truncate min-w-0">vs período anterior</span>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 rounded-full bg-rose-100/80 px-2 py-1 text-rose-500 shrink-0">
                            <ArrowDownRight className="w-4 h-4" />
                            <span>{variacaoValorCards.perc.toFixed(1)}%</span>
                          </div>
                          <span className="text-slate-500 truncate min-w-0">Precisa de atenção</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2 truncate">Faturamento bruto</p>
                    <p className="text-3xl font-semibold text-[#009DA8] break-words">{formatBRL(resumoAtual?.totalValor ?? 0)}</p>
                    <div className="mt-3 min-h-[32px] flex items-center min-w-0">
                      <p className="text-sm text-slate-500 truncate">Após frete {formatBRL(resumoAtual?.totalFreteTotal ?? 0)}</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 text-sm text-slate-500">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-400 truncate">Pedidos</p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white truncate" suppressHydrationWarning>
                      {resumoAtual?.totalPedidos.toLocaleString('pt-BR') ?? '0'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-400 truncate">Ticket médio</p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white truncate">{formatBRL(resumoAtual?.ticketMedio ?? 0)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-400 truncate">% cancelamentos</p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white truncate">{formatPercent(cancelamentoPerc)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-400 truncate">Produtos vendidos</p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white truncate" suppressHydrationWarning>
                      {totalProdutosVendidos.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/60 bg-gradient-to-br from-[#ede9fe]/80 to-[#fff5f5]/70 backdrop-blur-xl p-6 shadow-inner shadow-white/30">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Microtrend</p>
                    <p className="text-sm text-slate-500">Últimos {sparkData.length} registros</p>
                  </div>
                  <span className="text-xs text-slate-400">{resumoAtual ? 'Atualizado em tempo real' : 'Aguardando dados'}</span>
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData}>
                      <defs>
                        <linearGradient id="microSpark" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="rgba(148,163,184,0.3)" />
                      <XAxis dataKey="label" hide />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip formatter={formatBRL} />} />
                      <Area type="monotone" dataKey="value" stroke="#a855f7" fill="url(#microSpark)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>


            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {quickHighlights.length ? (
                quickHighlights.map((item, idx) => (
                  <div
                    key={item.label}
                    className={`rounded-[24px] border border-white/60 ${
                      idx % 2 === 0 ? 'bg-white/80 dark:bg-slate-900/70' : 'bg-gradient-to-br from-white/70 to-[#f7f3ff]/80 dark:bg-slate-900/60'
                    } backdrop-blur-xl p-5 shadow-inner shadow-white/40 flex flex-col gap-1`}
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{item.label}</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
                    <p className="text-xs text-slate-400">{item.helper}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-white/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-5 text-sm text-slate-400 sm:col-span-2 xl:col-span-4">
                  {loadingGlobal ? 'Carregando indicadores consolidados…' : 'Aguardando dados para destaques.'}
                </div>
              )}
            </div>

            {erroGlobal && (
              <div className="rounded-[24px] border border-rose-200/60 bg-rose-50/80 p-4 text-sm text-rose-600">
                {erroGlobal}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-white/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Situações em destaque</h3>
                  <span className="text-xs text-slate-400">Fluxo Tiny</span>
                </div>
                <div className="space-y-3">
                  {topSituacoes.length ? (
                    topSituacoes.map((sit) => (
                      <div key={sit.situacao} className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/80 dark:bg-slate-900/70 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{labelSituacao(sit.situacao)}</p>
                          <p className="text-[11px] text-slate-400">{sit.quantidade.toLocaleString('pt-BR')} pedidos</p>
                        </div>
                        <span className="text-sm font-semibold text-[#009DA8]">{sit.quantidade}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">Aguardando dados…</p>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Últimos dias</h3>
                  <span className="text-xs text-slate-400">Base consolidada</span>
                </div>
                <div className="space-y-3">
                  {trendingDias.length ? (
                    trendingDias.map((dia) => {
                      let dataFormatada = dia.data;
                      try {
                        dataFormatada = new Date(dia.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                      } catch {
                        // ignore
                      }
                      return (
                        <div key={dia.data} className="flex items-center justify-between rounded-2xl border border-white/60 bg-gradient-to-r from-white/80 to-[#ecfeff]/80 px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{dataFormatada}</p>
                            <p className="text-[11px] text-slate-400">{dia.quantidade} pedidos</p>
                          </div>
                          <span className="text-sm font-semibold text-[#0f172a]">{formatBRL(dia.totalDia)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-400">Ainda sem histórico suficiente.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside
            className="rounded-[36px] border border-white/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl p-6 shadow-[0_10px_50px_rgba(15,23,42,0.12)] flex flex-col gap-6 self-start overflow-hidden"
            style={panelMaxHeight ? { height: panelMaxHeight, maxHeight: panelMaxHeight } : undefined}
          >
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Insights de IA</p>
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mt-2">Ambienta Copilot</h3>
              <p className="text-sm text-slate-500">Análises automáticas geradas com Gemini.</p>
            </div>
            <button
              onClick={() => gerarInsights(false)}
              className="w-full rounded-2xl bg-gradient-to-r from-[#009DA8] to-[#38c5cf] text-white text-sm font-semibold py-2.5 shadow-lg shadow-[#009DA8]/30 disabled:opacity-60"
              disabled={loadingInsights || !insightsBaseline}
            >
              {loadingInsights ? 'Gerando insights…' : 'Atualizar com Gemini'}
            </button>
              <div className="relative flex-1 min-h-0 overflow-hidden">
              <div
                ref={insightsScrollRef}
                  className="insights-scroll space-y-3 h-full min-h-0 overflow-y-auto pr-2 pb-10"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(15,23,42,0.2) transparent' }}
              >
                {erroInsights && <p className="text-xs text-rose-500">{erroInsights}</p>}
                {!erroInsights && insights.length === 0 && !loadingInsights && (
                  <p className="text-sm text-slate-400">Carregue o dashboard para receber recomendações inteligentes.</p>
                )}
                {loadingInsights && (
                  <div className="space-y-2 text-sm text-slate-400">
                    <div className="h-2 rounded-full bg-slate-100/60" />
                    <div className="h-2 rounded-full bg-slate-100/60 w-3/4" />
                    <div className="h-2 rounded-full bg-slate-100/60 w-1/2" />
                  </div>
                )}
                {!loadingInsights &&
                  insights.map((card) => {
                    const theme = INSIGHT_THEMES[card.tone] ?? INSIGHT_THEMES.info;
                    const Icon = theme.icon;
                    return (
                      <div
                        key={card.id}
                        className={`rounded-2xl border px-4 py-3 text-sm flex items-start gap-3 ${theme.bg} ${theme.border}`}
                      >
                        <div className={`mt-0.5 rounded-xl p-2 ${theme.iconBg} ${theme.iconColor}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 leading-relaxed">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {card.title || theme.label}
                          </p>
                          {card.body && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{card.body}</p>
                          )}
                        </div>
                        {card.dismissible !== false && (
                          <button
                            type="button"
                            onClick={() => dismissInsightCard(card.id)}
                            className="rounded-full p-1 text-slate-400 hover:text-slate-600 hover:bg-white/60 dark:hover:bg-slate-800/80 transition"
                            aria-label="Fechar insight"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-white/90 via-white/60 to-transparent dark:from-slate-900/90 dark:via-slate-900/60" />
            </div>
            <p className="text-[11px] text-slate-400">Fonte: Gemini · Considera visão consolidada de {GLOBAL_INTERVAL_DAYS} dias sem aplicar filtros de canal ou período.</p>
          </aside>
        </section>

        {loading && (
          <div className="rounded-[32px] border border-white/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl p-6 text-sm text-slate-500">
            Carregando dados do Tiny…
          </div>
        )}
        {erro && (
          <div className="rounded-[32px] border border-rose-200/70 bg-rose-50/80 p-6 text-sm text-rose-600">
            Erro ao carregar dashboard: {erro}
          </div>
        )}

        {!loading && !erro && resumo && resumoAtual && (
          <div className="space-y-8">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-[28px] bg-gradient-to-br from-[#e8e0ff] to-white shadow-inner shadow-white/60 p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Faturamento líquido</p>
                  <TrendingUp className="w-5 h-5 text-[#5b21b6] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-[#5b21b6] truncate">{formatBRL(resumoAtual.totalValorLiquido)}</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Após frete {formatBRL(resumoAtual.totalFreteTotal)}</p>
              </div>

              <div className="rounded-[28px] bg-gradient-to-br from-[#e0ecff] to-white shadow-inner shadow-white/60 p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Faturamento bruto</p>
                  <TrendingUp className="w-5 h-5 text-[#009DA8] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-[#009DA8] truncate">{formatBRL(resumoAtual.totalValor)}</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Frete incluso {formatBRL(resumoAtual.totalFreteTotal)}</p>
              </div>

              <div className="rounded-[28px] bg-gradient-to-br from-[#d1fae5] to-white shadow-inner shadow-white/60 p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Pedidos</p>
                  <ShoppingCart className="w-5 h-5 text-emerald-500 shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-emerald-500 truncate" suppressHydrationWarning>
                  {resumoAtual.totalPedidos.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500 mt-2 truncate">Diferença: {resumoAtual.totalPedidos - resumo.periodoAnteriorCards.totalPedidos}</p>
              </div>

              <div className="rounded-[28px] bg-gradient-to-br from-[#ddd6fe] to-white shadow-inner shadow-white/60 p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Produtos vendidos</p>
                  <Package className="w-5 h-5 text-purple-500 shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-purple-500 truncate" suppressHydrationWarning>
                  {totalProdutosVendidos.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500 mt-2 truncate">Total de itens</p>
              </div>

              <div className="rounded-[28px] bg-gradient-to-br from-[#fef3c7] to-white shadow-inner shadow-white/60 p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Ticket médio</p>
                  <BarChart3 className="w-5 h-5 text-amber-500 shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-amber-500 truncate">{formatBRL(resumoAtual.ticketMedio)}</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Variação {formatBRL(resumoAtual.ticketMedio - resumo.periodoAnteriorCards.ticketMedio)}</p>
              </div>

              <div className="rounded-[28px] bg-gradient-to-br from-[#fee2e2] to-white shadow-inner shadow-white/60 p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Variação</p>
                  {variacaoValorCards.abs >= 0 ? <ArrowUpRight className="w-5 h-5 text-emerald-500 shrink-0" /> : <ArrowDownRight className="w-5 h-5 text-rose-500 shrink-0" />}
                </div>
                <p className={`text-3xl font-semibold truncate ${variacaoValorCards.abs >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{variacaoValorCards.perc.toFixed(1)}%</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Impacto {formatBRL(Math.abs(variacaoValorCards.abs))}</p>
              </div>
            </div>

            <div className="rounded-[36px] border border-white/60 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-6 shadow-[0_25px_70px_rgba(15,23,42,0.12)]">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Faturamento por dia</h2>
                  <p className="text-sm text-slate-500">Compare o período atual com o anterior</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[['today', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['month', 'Mês']].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setChartPreset(key as ChartPreset)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        chartPreset === key ? 'bg-[#009DA8] text-white shadow-lg shadow-[#009DA8]/30' : 'bg-white/60 text-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={handleComplementChart}
                    disabled={complementLoading}
                    className="px-4 py-1.5 rounded-full text-xs font-semibold bg-slate-900 text-white disabled:opacity-50"
                  >
                    {complementLoading ? 'Atualizando…' : 'Atualizar'}
                  </button>
                </div>
              </div>
              {chartPreset === 'custom' && (
                <div className="flex items-center gap-2 mb-4 text-xs">
                  <input type="date" className="app-input flex-1" value={chartCustomStart ?? ''} onChange={(e) => setChartCustomStart(e.target.value || null)} />
                  <span className="text-slate-400">até</span>
                  <input type="date" className="app-input flex-1" value={chartCustomEnd ?? ''} onChange={(e) => setChartCustomEnd(e.target.value || null)} />
                </div>
              )}
              {loadingChart && <p className="text-xs text-slate-400 mb-2">Carregando…</p>}
              {erroChart && <p className="text-xs text-rose-500 mb-2">{erroChart}</p>}
              {complementMsg && <p className="text-xs text-slate-400 mb-2">{complementMsg}</p>}
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorAtual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={AMBIENTA_PRIMARY} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={AMBIENTA_PRIMARY} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorAnterior" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a5b4fc" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#a5b4fc" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.4)" />
                    <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} />
                    <Tooltip content={<CustomTooltip formatter={formatBRL} />} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="anterior" name="Período anterior" stroke="#a5b4fc" fill="url(#colorAnterior)" strokeWidth={3} strokeDasharray="6 6" />
                    <Area type="monotone" dataKey="atual" name="Período atual" stroke={AMBIENTA_PRIMARY} fill="url(#colorAtual)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="flex flex-col gap-6">
                <div className="rounded-[36px] border border-white/60 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-6 flex flex-col shadow-[0_25px_70px_rgba(15,23,42,0.12)]">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Faturamento por canal</h2>
                      <p className="text-sm text-slate-500">Distribuição percentual do período</p>
                    </div>
                  </div>
                  {canaisData.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Nenhum pedido no período.</div>
                  ) : (
                    <div className="flex flex-col items-center gap-6">
                      <div className="relative w-full" style={{ aspectRatio: '1/1', maxWidth: '280px', margin: '0 auto' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={canaisData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius="72%"
                              outerRadius="88%"
                              paddingAngle={3}
                              cornerRadius={18}
                              stroke="transparent"
                              labelLine={false}
                              label={renderChannelPercentLabel}
                            >
                              {canaisData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} stroke={entry.color} />
                              ))}
                              <Label
                                position="center"
                                content={({ viewBox }) => {
                                  if (!viewBox) return null;
                                  const { cx, cy } = viewBox as { cx: number; cy: number };
                                  return (
                                    <g>
                                      <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-muted)" fontSize={12} fontWeight={500}>
                                        Total
                                      </text>
                                      <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-main)" fontSize={18} fontWeight={700}>
                                        {formatBRL(totalCanaisValue)}
                                      </text>
                                    </g>
                                  );
                                }}
                              />
                            </Pie>
                            <Tooltip content={<CustomPieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium text-slate-600 dark:text-slate-200">
                        {canaisData.map((canal) => (
                          <div key={canal.name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: canal.color }} />
                            <span>{canal.name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-100 shadow-sm">
                              {formatPercent(canal.percentage)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[36px] border border-white/60 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-6 shadow-[0_25px_70px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Produtos mais vendidos</h2>
                    <span className="text-xs text-slate-400">Top {topProdutos.length}</span>
                  </div>
                  {topProdutos.length ? (
                    <div className="space-y-4">
                      {topProdutos.map((produto) => (
                        <div key={`${produto.produtoId ?? produto.descricao}`} className="flex items-center justify-between gap-4 rounded-2xl border border-white/60 bg-white/80 dark:bg-slate-900/70 px-4 py-3">
                          <div className="flex items-center gap-3">
                            {produto.imagemUrl ? (
                              <img
                                src={produto.imagemUrl}
                                alt={produto.descricao}
                                className="w-12 h-12 rounded-2xl object-cover border border-white/60 shadow-sm"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#009DA8] to-[#5eead4] text-white flex items-center justify-center text-sm font-semibold">
                                {getInitials(produto.descricao)}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">{produto.descricao}</p>
                              <p className="text-[11px] text-slate-400">{produto.sku ? `SKU ${produto.sku}` : 'Sem SKU'}</p>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-semibold text-slate-900 dark:text-white">{produto.quantidade.toLocaleString('pt-BR')} un</p>
                            <p className="text-slate-500">{formatBRL(produto.receita)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">Sincronize pedidos com itens para ver os produtos líderes.</p>
                  )}
                </div>

                <div className="rounded-[36px] border border-white/60 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-6 shadow-[0_25px_70px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Últimos pedidos</h2>
                    <span className="text-xs text-slate-400">{recentOrders.length} recentes</span>
                  </div>
                  {loadingRecentOrders ? (
                    <p className="text-sm text-slate-400">Carregando...</p>
                  ) : recentOrders.length > 0 ? (
                    <div className="space-y-2">
                      {recentOrders.map((pedido) => {
                        const situacaoLabel = labelSituacao(pedido.situacao ?? -1);
                        // Exibe a data exatamente como vem da API (YYYY-MM-DD -> DD/MM/YY)
                        const dataCriacao = pedido.dataCriacao
                          ? (() => {
                              const [y, m, d] = pedido.dataCriacao.split('-');
                              return `${d}/${m}/${y.slice(2)}`;
                            })()
                          : '';
                        return (
                          <div
                            key={pedido.tinyId}
                            className="flex items-start justify-between gap-3 rounded-2xl border border-white/60 bg-white/80 dark:bg-slate-900/70 px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-white/70 dark:border-slate-700 flex items-center justify-center overflow-visible">
                                {pedido.primeiraImagem ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={pedido.primeiraImagem} alt="Produto" className="w-full h-full object-cover" />
                                    {(pedido.itensQuantidade ?? 0) > 1 && (
                                      <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 bg-white text-[var(--accent)] border border-[var(--accent)] rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold" style={{zIndex:50}}>
                                        +{(pedido.itensQuantidade ?? 0) - 1}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-muted">{pedido.itensQuantidade ?? 0} itens</span>
                                )}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  #{pedido.numeroPedido || pedido.tinyId}
                                </p>
                                {pedido.canal && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#009DA8]/10 text-[#009DA8] font-medium">
                                    {pedido.canal}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 truncate">
                                {pedido.cliente || 'Cliente'} • {dataCriacao}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{situacaoLabel}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-[#009DA8]">
                                {formatBRL(pedido.valor ?? 0)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">Nenhum pedido disponível.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[32px] border border-white/60 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-6 shadow-[0_25px_70px_rgba(15,23,42,0.12)]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Vendas por dia</h2>
                  <span className="text-xs text-slate-400">{resumoAtual.vendasPorDia.length} registros</span>
                </div>
                <div className="overflow-hidden rounded-3xl border border-white/40">
                  <table className="w-full text-xs">
                    <thead className="bg-white/60 text-slate-500">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Data</th>
                        <th className="text-right px-4 py-3 font-semibold">Qtde</th>
                        <th className="text-right px-4 py-3 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumoAtual.vendasPorDia.map((linha) => (
                        <tr key={linha.data} className="border-t border-white/40 odd:bg-white/30">
                          <td className="px-4 py-3 text-slate-700 dark:text-white">{linha.data}</td>
                          <td className="text-right px-4 py-3 text-slate-500">{linha.quantidade}</td>
                          <td className="text-right px-4 py-3 font-semibold text-slate-900 dark:text-white">{formatBRL(linha.totalDia)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-[32px] border border-white/60 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-6 shadow-[0_25px_70px_rgba(15,23,42,0.12)]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Pedidos por situação</h2>
                  <span className="text-xs text-slate-400">Fluxo Tiny</span>
                </div>
                <div className="space-y-3">
                  {resumoAtual.pedidosPorSituacao.map((linha, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/70 dark:bg-slate-900/60 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{labelSituacao(linha.situacao)}</p>
                        <p className="text-[11px] text-slate-400">Status operacional</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{linha.quantidade}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-4">
                  Mapeamento ajustável conforme configuração do Tiny.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
