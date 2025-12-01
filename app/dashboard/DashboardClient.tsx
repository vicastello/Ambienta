'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Info,
  Package,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { BrazilSalesMap } from '@/components/BrazilSalesMap';
import { ChannelDistributionChart } from './components/charts/ChannelDistributionChart';
import { DailyRevenueChart } from './components/charts/DailyRevenueChart';
import type { CustomTooltipFormatter } from './components/charts/ChartTooltips';
import { MicroTrendChart } from './components/charts/MicroTrendChart';

// Ambienta colors
const AMBIENTA_PRIMARY = '#009DA8';
const COLORS_PALETTE = [AMBIENTA_PRIMARY, '#22c55e', '#f97316', '#0ea5e9', '#a855f7'];
const GLOBAL_INTERVAL_DAYS = 30;
const SPARK_WINDOW_DAYS = 7;
const DASHBOARD_AUTO_REFRESH_MS = 60_000; // polling leve para dados mais frescos

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
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
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
  mapaVendasUF?: Array<{ uf: string; totalValor: number; totalPedidos: number }>;
  mapaVendasCidade?: Array<{ cidade: string; uf: string | null; totalValor: number; totalPedidos: number }>;
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
    bg: 'glass-panel glass-tint insight-card-bg-info',
    border: 'border-white/60 dark:border-white/10',
    iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800/80',
    iconColor: 'text-slate-600 dark:text-slate-300',
  },
  opportunity: {
    label: 'Oportunidade',
    icon: Sparkles,
    bg: 'glass-panel glass-tint insight-card-bg-opportunity',
    border: 'border-emerald-200/60 dark:border-emerald-500/20',
    iconBg: 'bg-emerald-100/80 dark:bg-emerald-500/20',
    iconColor: 'text-emerald-600',
  },
  risk: {
    label: 'Risco',
    icon: AlertTriangle,
    bg: 'glass-panel glass-tint insight-card-bg-risk',
    border: 'border-rose-200/60 dark:border-rose-500/20',
    iconBg: 'bg-rose-100/80 dark:bg-rose-500/20',
    iconColor: 'text-rose-600',
  },
  action: {
    label: 'Ação',
    icon: Target,
    bg: 'glass-panel glass-tint insight-card-bg-action',
    border: 'border-amber-200/60 dark:border-amber-500/20',
    iconBg: 'bg-amber-100/80 dark:bg-amber-500/20',
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
const DASHBOARD_CACHE_PREFIX = 'tiny_dash_state_v1';
const RESUMO_CACHE_PREFIX = `${DASHBOARD_CACHE_PREFIX}:resumo`;
const GLOBAL_CACHE_PREFIX = `${DASHBOARD_CACHE_PREFIX}:global`;
const CHART_CACHE_PREFIX = `${DASHBOARD_CACHE_PREFIX}:chart`;
const DASHBOARD_CACHE_FRESH_MS = 90_000;
const GLOBAL_CACHE_FRESH_MS = 180_000;
const SITUACOES_CACHE_FRESH_MS = 120_000;
const CHART_CACHE_FRESH_MS = 120_000;

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

const formatTooltipCurrency: CustomTooltipFormatter = (value) =>
  typeof value === 'number' ? formatBRL(value) : String(value);

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

function readCacheEntry<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch (err) {
    console.warn('Falha ao ler cache do dashboard', err);
    return null;
  }
}

function isCacheEntryFresh(entry: CacheEntry<unknown> | null, maxAgeMs: number) {
  if (!entry) return false;
  return Date.now() - entry.timestamp < maxAgeMs;
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }
  return '';
};

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

export default function DashboardClient() {
  const [preset, setPreset] = useState<DatePreset>('7d');
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resumoGlobal, setResumoGlobal] = useState<DashboardResumo | null>(null);
  const [loadingGlobal, setLoadingGlobal] = useState<boolean>(true);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);

  const [canaisSelecionados, setCanaisSelecionados] = useState<string[]>([]);
  const [situacoesSelecionadas, setSituacoesSelecionadas] = useState<number[]>([]);
  const [topSituacoesMes, setTopSituacoesMes] = useState<SituacaoResumo[]>([]);
  const [situacoesMes, setSituacoesMes] = useState<SituacaoResumo[]>([]);
  const [loadingTopSituacoesMes, setLoadingTopSituacoesMes] = useState<boolean>(false);

  const [filtersLoaded, setFiltersLoaded] = useState(false);

  const [chartPreset, setChartPreset] = useState<ChartPreset>('month');
  const [chartCustomStart, setChartCustomStart] = useState<string | null>(null);
  const [chartCustomEnd, setChartCustomEnd] = useState<string | null>(null);
  const [resumoChart, setResumoChart] = useState<DashboardResumo | null>(null);
  const [loadingChart, setLoadingChart] = useState<boolean>(true);
  const [erroChart, setErroChart] = useState<string | null>(null);
  const [complementLoading, setComplementLoading] = useState<boolean>(false);
  const [complementMsg, setComplementMsg] = useState<string | null>(null);
  const [autoComplementedRanges, setAutoComplementedRanges] = useState<Record<string, boolean>>({});
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [loadingInsights, setLoadingInsights] = useState<boolean>(false);
  const [erroInsights, setErroInsights] = useState<string | null>(null);
  const [panelMaxHeight, setPanelMaxHeight] = useState<number | null>(null);
  const [insightsBaseline, setInsightsBaseline] = useState<DashboardResumo | null>(null);
  const [isFilterPending, startTransition] = useTransition();
  const deferredResumo = useDeferredValue(resumo);
  const deferredResumoGlobal = useDeferredValue(resumoGlobal);
  const deferredResumoChart = useDeferredValue(resumoChart);
  const dashboardSource = deferredResumo ?? resumo;
  const dashboardGlobalSource = deferredResumoGlobal ?? resumoGlobal;
  const dashboardChartSource = deferredResumoChart ?? resumoChart;

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

  const handlePresetChange = (value: DatePreset) => {
    startTransition(() => {
      setPreset(value);
      if (value !== 'custom') {
        setCustomStart(null);
        setCustomEnd(null);
      }
    });
  };

  const handleCustomStartChange = (value: string | null) => {
    startTransition(() => setCustomStart(value));
  };

  const handleCustomEndChange = (value: string | null) => {
    startTransition(() => setCustomEnd(value));
  };

  const handleChannelsChange = (values: string[]) => {
    startTransition(() => setCanaisSelecionados(values));
  };

  const handleSituationsChange = (values: number[]) => {
    startTransition(() => setSituacoesSelecionadas(values));
  };

  const handleChartPresetChange = (value: ChartPreset) => {
    startTransition(() => setChartPreset(value));
  };

  const handleChartCustomStartChange = (value: string | null) => {
    startTransition(() => setChartCustomStart(value));
  };

  const handleChartCustomEndChange = (value: string | null) => {
    startTransition(() => setChartCustomEnd(value));
  };

  // Refs para evitar chamadas simultâneas
  const resumoRequestId = useRef(0);
  const chartRequestId = useRef(0);
  const globalRequestId = useRef(0);
  const situacoesRequestId = useRef(0);
  const lastResumoFetchRef = useRef(0);
  const lastGlobalFetchRef = useRef(0);
  const lastSituacoesFetchRef = useRef(0);
  const isLoadingInsightsBaseRef = useRef(false);
  const insightsScrollRef = useRef<HTMLDivElement | null>(null);
  const heroCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = loadSavedFilters();
    if (saved) {
      setPreset(saved.preset ?? '7d');
      setCustomStart(saved.customStart ?? null);
      setCustomEnd(saved.customEnd ?? null);
      setCanaisSelecionados(saved.canaisSelecionados ?? []);
      setSituacoesSelecionadas(saved.situacoesSelecionadas ?? []);
    }
    setFiltersLoaded(true);
  }, []);

  useEffect(() => {
    if (!filtersLoaded || typeof window === 'undefined') return;
    const toSave: SavedFilters = { preset, customStart, customEnd, canaisSelecionados, situacoesSelecionadas };
    try {
      window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.error('Erro ao salvar filtros', err);
    }
  }, [filtersLoaded, preset, customStart, customEnd, canaisSelecionados, situacoesSelecionadas]);

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

  function resolverIntervaloMesAtual(): { inicio: string; fim: string } {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioIso = inicio.toISOString().slice(0, 10);
    return { inicio: inicioIso, fim: isoToday() };
  }

  function aplicarSituacoesResumo(resumoFonte: DashboardResumo) {
    const situacoes = resumoFonte.periodoAtual.pedidosPorSituacao ?? [];
    const top = [...situacoes].sort((a, b) => b.quantidade - a.quantidade).slice(0, 4);
    setTopSituacoesMes(top);
    setSituacoesMes(situacoes);
  }

  async function carregarResumo(options?: { force?: boolean }) {
    if (!filtersLoaded) return;
    const force = options?.force ?? false;
    const requestId = ++resumoRequestId.current;
    const { inicio, fim } = resolverIntervalo();

    try {
      const cacheKey = buildResumoCacheKey(inicio, fim, canaisSelecionados, situacoesSelecionadas);
      const cacheEntry = readCacheEntry<DashboardResumo>(cacheKey);
      const cachedResumo = cacheEntry?.data ?? null;
      const cacheFresh = isCacheEntryFresh(cacheEntry, DASHBOARD_CACHE_FRESH_MS);
      if (cachedResumo) {
        setResumo(cachedResumo);
      }
      if (requestId === resumoRequestId.current) {
        setLoading(!cachedResumo);
        setErro(null);
      }
      if (!force && cacheFresh) {
        return;
      }
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
      if (requestId === resumoRequestId.current) {
        setResumo(parsedResumo);
        lastResumoFetchRef.current = Date.now();
      }
      safeWriteCache(cacheKey, parsedResumo);
      try {
        const { inicio, fim } = resolverIntervalo();
        const diasEsperados = 1 + diffDays(inicio, fim);
        const atualDias = parsedResumo.periodoAtual.vendasPorDia.length ?? 0;
        const key = `${inicio}_${fim}`;
        const already = !!autoComplementedRanges[key];
        if (requestId === resumoRequestId.current && preset === 'month' && !already && atualDias < diasEsperados) {
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
      } catch {
        // swallow
      }
    } catch (error) {
      if (requestId === resumoRequestId.current) {
        setErro(getErrorMessage(error) || 'Erro inesperado ao carregar dashboard');
      }
    } finally {
      if (requestId === resumoRequestId.current) {
        setLoading(false);
      }
    }
  }

  async function carregarResumoGlobal(options?: { force?: boolean }) {
    if (!filtersLoaded) return;
    const force = options?.force ?? false;
    const requestId = ++globalRequestId.current;

    try {
      const { inicio, fim } = resolverIntervaloGlobal();
      const cacheKey = buildGlobalCacheKey(inicio, fim, canaisSelecionados, situacoesSelecionadas);
      const cacheEntry = readCacheEntry<DashboardResumo>(cacheKey);
      const cachedGlobal = cacheEntry?.data ?? null;
      const cacheFresh = isCacheEntryFresh(cacheEntry, GLOBAL_CACHE_FRESH_MS);
      if (cachedGlobal && requestId === globalRequestId.current) setResumoGlobal(cachedGlobal);
      if (requestId === globalRequestId.current) {
        setLoadingGlobal(!cachedGlobal);
        setErroGlobal(null);
      }
      if (!force && cacheFresh) {
        return;
      }
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar visão consolidada');
      const parsedGlobal = json as DashboardResumo;
      if (requestId === globalRequestId.current) {
        setResumoGlobal(parsedGlobal);
        lastGlobalFetchRef.current = Date.now();
      }
      safeWriteCache(cacheKey, parsedGlobal);
    } catch (error) {
      if (requestId === globalRequestId.current) {
        setErroGlobal(getErrorMessage(error) || 'Erro inesperado ao carregar visão consolidada');
      }
    } finally {
      if (requestId === globalRequestId.current) {
        setLoadingGlobal(false);
      }
    }
  }

  async function carregarTopSituacoesMes(options?: { force?: boolean }) {
    if (!filtersLoaded) return;
    const force = options?.force ?? false;
    const requestId = ++situacoesRequestId.current;
    try {
      const { inicio, fim } = resolverIntervaloMesAtual();
      const cacheKey = buildResumoCacheKey(inicio, fim, canaisSelecionados, situacoesSelecionadas);
      const cacheEntry = readCacheEntry<DashboardResumo>(cacheKey);
      const cachedResumo = cacheEntry?.data ?? null;
      const cacheFresh = isCacheEntryFresh(cacheEntry, SITUACOES_CACHE_FRESH_MS);
      if (cachedResumo && requestId === situacoesRequestId.current) {
        aplicarSituacoesResumo(cachedResumo);
      }
      if (requestId === situacoesRequestId.current) {
        setLoadingTopSituacoesMes(!cachedResumo);
      }
      if (!force && cacheFresh) {
        return;
      }
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar situações do mês');
      const parsed = json as DashboardResumo;
      if (requestId === situacoesRequestId.current) {
        aplicarSituacoesResumo(parsed);
        lastSituacoesFetchRef.current = Date.now();
      }
      safeWriteCache(cacheKey, parsed);
    } catch {
      if (requestId === situacoesRequestId.current) {
        setTopSituacoesMes([]);
        setSituacoesMes([]);
      }
    } finally {
      if (requestId === situacoesRequestId.current) {
        setLoadingTopSituacoesMes(false);
      }
    }
  }

  async function carregarResumoInsightsBase() {
    if (isLoadingInsightsBaseRef.current) return;
    isLoadingInsightsBaseRef.current = true;

    try {
      const { inicio, fim } = resolverIntervaloGlobal();
      const cacheKey = buildGlobalCacheKey(inicio, fim, [], []);
      const cacheEntry = readCacheEntry<DashboardResumo>(cacheKey);
      const cached = cacheEntry?.data ?? null;
      const cacheFresh = isCacheEntryFresh(cacheEntry, GLOBAL_CACHE_FRESH_MS);
      if (cached) setInsightsBaseline(cached);
      if (cacheFresh) {
        return;
      }
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
    if (!filtersLoaded) return;
    carregarResumo({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dependências limitadas para evitar loop com carregarResumo
  }, [filtersLoaded, preset, customStart, customEnd, canaisSelecionados, situacoesSelecionadas]);

  useEffect(() => {
    if (!filtersLoaded) return;
    carregarResumoGlobal({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- efeito depende apenas de filtros para evitar loop com carregarResumoGlobal
  }, [filtersLoaded, canaisSelecionados, situacoesSelecionadas]);

  useEffect(() => {
    if (!filtersLoaded) return;
    carregarTopSituacoesMes({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dependências limitadas para evitar loop com carregarTopSituacoesMes
  }, [filtersLoaded, canaisSelecionados, situacoesSelecionadas]);

  useEffect(() => {
    carregarResumoInsightsBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carregamento único da base de insights
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    const interval = setInterval(() => {
      carregarResumo({ force: false });
      carregarResumoGlobal({ force: false });
      carregarTopSituacoesMes({ force: false });
    }, DASHBOARD_AUTO_REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evita recriar intervalo a cada render
  }, [filtersLoaded, preset, customStart, customEnd, canaisSelecionados, situacoesSelecionadas]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evita dependência recursiva com gerarInsights
  }, [insightsBaseline]);

  const fetchRecentOrders = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchRecentOrders();
  }, [fetchRecentOrders]);

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
    const requestId = ++chartRequestId.current;

    try {
      const { inicio, fim } = resolverIntervaloChart();
      const cacheKey = buildChartCacheKey(inicio, fim, chartPreset, chartCustomStart, chartCustomEnd);
      const cacheEntry = readCacheEntry<DashboardResumo>(cacheKey);
      const cachedChart = cacheEntry?.data ?? null;
      const cacheFresh = isCacheEntryFresh(cacheEntry, CHART_CACHE_FRESH_MS);
      if (cachedChart && requestId === chartRequestId.current) setResumoChart(cachedChart);
      if (requestId === chartRequestId.current) {
        setLoadingChart(!cachedChart);
        setErroChart(null);
      }
      if (cacheFresh) {
        return;
      }
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar resumo (gráfico)');
      const parsedChart = json as DashboardResumo;
      if (requestId === chartRequestId.current) {
        setResumoChart(parsedChart);
      }
      safeWriteCache(cacheKey, parsedChart);
      try {
        const { inicio, fim } = resolverIntervaloChart();
        const diasEsperados = 1 + diffDays(inicio, fim);
        const atualDias = parsedChart.periodoAtual.vendasPorDia.length ?? 0;
        const key = `${inicio}_${fim}`;
        const already = !!autoComplementedRanges[key];
        if (requestId === chartRequestId.current && chartPreset === 'month' && !already && atualDias < diasEsperados) {
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
      } catch {
        // swallow
      }
    } catch (error) {
      if (requestId === chartRequestId.current) {
        setErroChart(getErrorMessage(error) || 'Erro inesperado ao carregar gráfico');
      }
    } finally {
      if (requestId === chartRequestId.current) {
        setLoadingChart(false);
      }
    }
  }

  useEffect(() => {
    carregarResumoChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evita recriar chart request a cada render
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
    } catch (error) {
      setComplementMsg(getErrorMessage(error) || 'Erro inesperado ao complementar.');
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
            visaoFiltrada: dashboardSource,
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
    } catch (error) {
      setErroInsights(getErrorMessage(error) || 'Erro inesperado ao gerar insights');
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
    if (!dashboardChartSource) return [];
    const source = dashboardChartSource;
    const mapaAtual = new Map<string, number>();
    const mapaAnterior = new Map<string, number>();
    source.periodoAtual.vendasPorDia.forEach((d) => mapaAtual.set(d.data, d.totalDia));
    source.periodoAnterior.vendasPorDia.forEach((d) => mapaAnterior.set(d.data, d.totalDia));
    let dates: string[] = [];
    if (chartPreset === 'month') {
      let cursor = source.periodoAnterior.dataInicial;
      const diasSet = new Set<string>();
      while (cursor <= source.periodoAnterior.dataFinal) {
        const dia = cursor.split('-')[2];
        diasSet.add(dia);
        cursor = addDays(cursor, 1);
      }
      cursor = source.periodoAtual.dataInicial;
      while (cursor <= source.periodoAtual.dataFinal) {
        const dia = cursor.split('-')[2];
        diasSet.add(dia);
        cursor = addDays(cursor, 1);
      }
      dates = Array.from(diasSet).sort((a, b) => Number(a) - Number(b));
    } else {
      let cursor = source.periodoAtual.dataInicial;
      while (cursor <= source.periodoAtual.dataFinal) {
        dates.push(cursor);
        cursor = addDays(cursor, 1);
      }
    }
    return dates.map((dateOrDay) => {
      let diaDoMes: string;
      let dataAtual: string;
      if (chartPreset === 'month') {
        diaDoMes = dateOrDay.padStart(2, '0');
        dataAtual = source.periodoAtual.dataInicial.slice(0, 8) + diaDoMes;
      } else {
        dataAtual = dateOrDay;
        diaDoMes = dateOrDay.split('-')[2];
      }
      const dataAnteriorCorrespondente = source.periodoAnterior.dataInicial.slice(0, 8) + diaDoMes;
      return {
        data: diaDoMes,
        atual: mapaAtual.get(dataAtual) ?? 0,
        anterior: mapaAnterior.get(dataAnteriorCorrespondente) ?? 0,
      };
    });
  }, [dashboardChartSource, chartPreset]);

  const chartTicks = useMemo(() => {
    if (!chartData.length) return [0, 1000];
    const valores = chartData.flatMap((d) => [d.atual ?? 0, d.anterior ?? 0]);
    const max = Math.max(0, ...valores);
    const top = Math.max(1000, Math.ceil(max / 1000) * 1000);
    const ticks: number[] = [];
    for (let v = 0; v <= top; v += 1000) ticks.push(v);
    return ticks;
  }, [chartData]);

  const canaisData = useMemo(() => {
    if (!dashboardSource) return [];
    const total = dashboardSource.canais.reduce((acc, canal) => acc + (canal.totalValor || 0), 0);
    return dashboardSource.canais
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
  }, [dashboardSource]);

  const totalCanaisValue = useMemo(() => {
    return canaisData.reduce((acc, canal) => acc + (canal.value ?? 0), 0);
  }, [canaisData]);

  const variacaoValorCards = useMemo(() => {
    if (!dashboardSource) return { abs: 0, perc: 0 };
    const atual = dashboardSource.periodoAtual.totalValor;
    const ant = dashboardSource.periodoAnteriorCards.totalValor;
    const abs = atual - ant;
    const perc = ant > 0 ? (atual / ant - 1) * 100 : 0;
    return { abs, perc };
  }, [dashboardSource]);

  const resumoAtual = dashboardSource?.periodoAtual;
  const resumoGlobalAtual = dashboardGlobalSource?.periodoAtual;

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
    if (topSituacoesMes.length) return topSituacoesMes;
    if (!resumoAtual) return [];
    return [...resumoAtual.pedidosPorSituacao]
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 4);
  }, [resumoAtual, topSituacoesMes]);

  const situacoesLista = useMemo(() => {
    if (situacoesMes.length) return situacoesMes;
    if (!resumoAtual) return [];
    return resumoAtual.pedidosPorSituacao;
  }, [resumoAtual, situacoesMes]);

  const vendasPorDiaFonte = useMemo(() => resumoGlobalAtual?.vendasPorDia ?? [], [resumoGlobalAtual]);
  const vendasPorDiaOrdenadas = useMemo(() => {
    return [...vendasPorDiaFonte]
      .sort((a, b) => {
        const da = new Date(`${a.data}T00:00:00`).getTime();
        const db = new Date(`${b.data}T00:00:00`).getTime();
        return db - da;
      })
      .slice(0, 30);
  }, [vendasPorDiaFonte]);

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
    const melhorCanal = [...(dashboardSource?.canais ?? [])].sort((a, b) => b.totalValor - a.totalValor)[0];

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
  }, [resumoGlobalAtual, dashboardSource]);

  const cancelamentoPerc = resumoAtual?.percentualCancelados ?? 0;
  const totalProdutosVendidos = resumoAtual?.totalProdutosVendidos ?? 0;
  const topProdutos = resumoAtual?.topProdutos?.slice(0, 10) ?? [];

  return (
    <>
      <div className="space-y-8">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div
            ref={heroCardRef}
            className="rounded-[36px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-6 sm:p-8 space-y-6 min-w-0"
          >
            <div className="space-y-4">
              <div>
                <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white">Dashboard</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 w-full min-w-0 max-w-full md:flex md:flex-nowrap md:justify-end md:overflow-visible">
                <div className="min-w-0 w-full md:w-[220px] md:max-w-[240px] rounded-[18px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-3">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 truncate">Período</p>
                    <MultiSelectDropdown
                      label="Período"
                      options={[
                        { value: 'today', label: 'Hoje' },
                        { value: 'yesterday', label: 'Ontem' },
                        { value: '7d', label: '7 dias' },
                        { value: 'month', label: 'Mês atual' },
                        { value: '3m', label: '3 meses' },
                        { value: 'year', label: 'Ano' },
                        { value: 'custom', label: 'Personalizado' },
                      ]}
                      selected={[preset]}
                      onChange={(values) => handlePresetChange(values[0] as DatePreset)}
                      onClear={() => handlePresetChange('month')}
                      singleSelect
                      displayFormatter={(values, options) => {
                        if (!values.length) return 'Selecione...';
                      const option = options.find((opt) => opt.value === values[0]);
                      return option?.label ?? 'Selecione...';
                    }}
                    />
                    {preset === 'custom' && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                        <input
                          type="date"
                          className="app-input min-w-0"
                          value={customStart ?? ''}
                          onChange={(e) => handleCustomStartChange(e.target.value || null)}
                        />
                        <span className="text-slate-400 text-center">a</span>
                        <input
                          type="date"
                          className="app-input min-w-0"
                          value={customEnd ?? ''}
                          onChange={(e) => handleCustomEndChange(e.target.value || null)}
                        />
                      </div>
                    )}
                  </div>

                <div className="min-w-0 w-full md:w-[220px] md:max-w-[240px] rounded-[18px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 truncate">Canais</p>
                    {dashboardSource ? (
                      <MultiSelectDropdown
                        label="Canais"
                        options={dashboardSource.canaisDisponiveis.map((canal) => ({ value: canal, label: canal }))}
                        selected={canaisSelecionados}
                        onChange={(values) => handleChannelsChange(values as string[])}
                        onClear={() => handleChannelsChange([])}
                      />
                    ) : (
                      <p className="text-xs text-slate-400">Carregando…</p>
                    )}
                  </div>

                <div className="min-w-0 w-full md:w-[220px] md:max-w-[240px] rounded-[18px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 truncate">Situações</p>
                    {dashboardSource ? (
                      <MultiSelectDropdown
                        label="Situações"
                        options={dashboardSource.situacoesDisponiveis.map((sit) => ({ value: sit.codigo, label: sit.descricao }))}
                        selected={situacoesSelecionadas}
                        onChange={(values) => handleSituationsChange(values as number[])}
                        onClear={() => handleSituationsChange([])}
                      />
                    ) : (
                      <p className="text-xs text-slate-400">Carregando…</p>
                    )}
                  </div>
              </div>
              {isFilterPending && (
                <p className="text-xs text-slate-400 mt-1">Aplicando filtros…</p>
              )}

              <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 space-y-5 sm:space-y-6">
                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400 mb-2 truncate">
                      <span className="sm:hidden">Líquido</span>
                      <span className="hidden sm:inline">Faturamento líquido</span>
                    </p>
                    <p className="text-2xl sm:text-3xl font-semibold text-[#5b21b6] dark:text-[#a78bfa] break-words">{formatBRL(resumoAtual?.totalValorLiquido ?? 0)}</p>
                    <div className="mt-3 min-h-[32px] flex flex-wrap items-center gap-2 text-xs sm:text-sm min-w-0">
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
                          <div className="flex items-center gap-1 rounded-full bg-rose-100/80 dark:bg-[rgba(255,107,125,0.12)] px-2 py-1 text-rose-500 dark:text-[#ff7b8a] shrink-0">
                            <ArrowDownRight className="w-4 h-4" />
                            <span>{variacaoValorCards.perc.toFixed(1)}%</span>
                          </div>
                          <span className="text-slate-500 truncate min-w-0">Precisa de atenção</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400 mb-2 truncate">
                      <span className="sm:hidden">Bruto</span>
                      <span className="hidden sm:inline">Faturamento bruto</span>
                    </p>
                    <p className="text-2xl sm:text-3xl font-semibold text-[#009DA8] dark:text-[#6fe8ff] break-words">{formatBRL(resumoAtual?.totalValor ?? 0)}</p>
                    <div className="mt-3 min-h-[32px] flex items-center min-w-0">
                      <p className="text-xs sm:text-sm text-slate-500 truncate">Após frete {formatBRL(resumoAtual?.totalFreteTotal ?? 0)}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 text-sm text-slate-500">
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

              <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Microtrend</p>
                    <p className="text-sm text-slate-500">Últimos {sparkData.length} dias</p>
                  </div>
                  <span className="text-xs text-slate-400">{resumoAtual ? 'Atualizado em tempo real' : 'Aguardando dados'}</span>
                </div>
                <MicroTrendChart data={sparkData} formatter={formatTooltipCurrency} />
              </div>
            </div>


            <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {quickHighlights.length ? (
                quickHighlights.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 flex flex-col gap-1"
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{item.label}</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
                    <p className="text-xs text-slate-400">{item.helper}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 text-sm text-slate-400 col-span-2 xl:col-span-4">
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
              <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 space-y-5 sm:space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Situações em destaque</h3>
                  <span className="text-xs text-slate-400">Fluxo Tiny</span>
                </div>
                <div className="space-y-3">
                  {loadingTopSituacoesMes ? (
                    <p className="text-sm text-slate-400">Carregando situações do mês…</p>
                  ) : topSituacoes.length ? (
                    topSituacoes.map((sit) => (
                      <div key={sit.situacao} className="flex items-center justify-between rounded-2xl glass-row border border-white/60 dark:border-white/10 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{labelSituacao(sit.situacao)}</p>
                          <p className="text-[11px] text-slate-400">{sit.quantidade.toLocaleString('pt-BR')} pedidos</p>
                        </div>
                        <span className="text-sm font-semibold text-[#009DA8] dark:text-[#6fe8ff]">{sit.quantidade}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">Aguardando dados…</p>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5 sm:p-6 space-y-5 sm:space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Últimos dias</h3>
                  <span className="text-xs text-slate-400">Base consolidada</span>
                </div>
                <div className="space-y-3">
                  {trendingDias.length ? (
                    trendingDias.map((dia) => {
                      const parts = dia.data.split('-');
                      const dataFormatada =
                        parts.length === 3
                          ? `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}`
                          : dia.data;
                      return (
                        <div
                          key={dia.data}
                          className="flex items-center justify-between rounded-2xl glass-row border border-white/60 dark:border-white/10 px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{dataFormatada}</p>
                            <p className="text-[11px] text-slate-400">{dia.quantidade} pedidos</p>
                          </div>
                          <span className="text-sm font-semibold text-[#0f172a] dark:text-slate-200">{formatBRL(dia.totalDia)}</span>
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
        </div>

          <aside
            className="hidden xl:flex rounded-[36px] glass-panel glass-tint border border-white/50 dark:border-white/10 p-6 flex-col gap-6 self-start overflow-hidden"
            style={panelMaxHeight ? { height: panelMaxHeight, maxHeight: panelMaxHeight } : undefined}
          >
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Insights de IA</p>
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mt-2">Ambienta Copilot</h3>
              <p className="text-sm text-slate-500">Análises automáticas geradas com Gemini.</p>
            </div>
            <button
              onClick={() => gerarInsights(false)}
              className="w-full rounded-2xl bg-gradient-to-r from-[#009DA8] to-[#38c5cf] text-white text-sm font-semibold py-2.5 disabled:opacity-60"
              disabled={loadingInsights || !insightsBaseline}
            >
              {loadingInsights ? 'Gerando insights…' : 'Atualizar com Gemini'}
            </button>
              <div className="relative flex-1 min-h-0 overflow-hidden">
              <div
                ref={insightsScrollRef}
              className="insights-scroll space-y-3 h-full min-h-0 overflow-y-auto pr-2 pb-10"
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
                        className={`rounded-2xl border px-4 py-3 text-sm flex items-start gap-3 ${theme.bg} ${theme.border} dark:border-transparent`}
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
            </div>
          </aside>
        </section>

        {loading && (
          <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6 text-sm text-slate-500">
            Carregando dados do Tiny…
          </div>
        )}
        {erro && (
          <div className="rounded-[32px] border border-rose-200/70 bg-rose-50/80 p-6 text-sm text-rose-600">
            Erro ao carregar dashboard: {erro}
          </div>
        )}

        {!loading && !erro && dashboardSource && resumoAtual && (
          <div className="space-y-8">
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Faturamento líquido</p>
                  <TrendingUp className="w-5 h-5 text-[#5b21b6] dark:text-[#a78bfa] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-[#5b21b6] dark:text-[#a78bfa] truncate">{formatBRL(resumoAtual.totalValorLiquido)}</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Após frete {formatBRL(resumoAtual.totalFreteTotal)}</p>
              </div>

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Faturamento bruto</p>
                  <TrendingUp className="w-5 h-5 text-[#009DA8] dark:text-[#6fe8ff] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-[#009DA8] dark:text-[#6fe8ff] truncate">{formatBRL(resumoAtual.totalValor)}</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Frete incluso {formatBRL(resumoAtual.totalFreteTotal)}</p>
              </div>

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 truncate">Pedidos</p>
                  <ShoppingCart className="w-5 h-5 text-emerald-500 dark:text-[#33e2a7] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-emerald-500 dark:text-[#33e2a7] truncate" suppressHydrationWarning>
                  {resumoAtual.totalPedidos.toLocaleString('pt-BR')}
                </p>
                  <p className="text-xs text-slate-500 mt-2 truncate">Diferença: {resumoAtual.totalPedidos - dashboardSource.periodoAnteriorCards.totalPedidos}</p>
              </div>

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 truncate">Produtos vendidos</p>
                  <Package className="w-5 h-5 text-purple-500 dark:text-[#b794f4] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-purple-500 dark:text-[#b794f4] truncate" suppressHydrationWarning>
                  {totalProdutosVendidos.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500 mt-2 truncate">Total de itens</p>
              </div>

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 truncate">Ticket médio</p>
                  <BarChart3 className="w-5 h-5 text-amber-500 dark:text-[#f7b84a] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-amber-500 dark:text-[#f7b84a] truncate">{formatBRL(resumoAtual.ticketMedio)}</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Variação {formatBRL(resumoAtual.ticketMedio - dashboardSource.periodoAnteriorCards.ticketMedio)}</p>
              </div>

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 truncate">Variação</p>
                  {variacaoValorCards.abs >= 0 ? <ArrowUpRight className="w-5 h-5 text-emerald-500 dark:text-[#33e2a7] shrink-0" /> : <ArrowDownRight className="w-5 h-5 text-rose-500 dark:text-[#ff6b7d] shrink-0" />}
                </div>
                <p className={`text-3xl font-semibold truncate ${variacaoValorCards.abs >= 0 ? 'text-emerald-500 dark:text-[#33e2a7]' : 'text-rose-500 dark:text-[#ff6b7d]'}`}>{variacaoValorCards.perc.toFixed(1)}%</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Impacto {formatBRL(Math.abs(variacaoValorCards.abs))}</p>
              </div>
            </div>

              <div className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Faturamento por dia</h2>
                  <p className="text-sm text-slate-500">Compare o período atual com o anterior</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[['today', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['month', 'Mês']].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => handleChartPresetChange(key as ChartPreset)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        chartPreset === key ? 'bg-[#009DA8] text-white' : 'bg-white/60 text-slate-500'
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
                    <input
                      type="date"
                      className="app-input flex-1"
                      value={chartCustomStart ?? ''}
                      onChange={(e) => handleChartCustomStartChange(e.target.value || null)}
                    />
                    <span className="text-slate-400">até</span>
                    <input
                      type="date"
                      className="app-input flex-1"
                      value={chartCustomEnd ?? ''}
                      onChange={(e) => handleChartCustomEndChange(e.target.value || null)}
                    />
                  </div>
                )}
              {loadingChart && <p className="text-xs text-slate-400 mb-2">Carregando…</p>}
              {erroChart && <p className="text-xs text-rose-500 mb-2">{erroChart}</p>}
              {complementMsg && <p className="text-xs text-slate-400 mb-2">{complementMsg}</p>}
              <DailyRevenueChart data={chartData} ticks={chartTicks} formatter={formatTooltipCurrency} />
            </div>

              <div className="grid gap-6">
              <div className="grid gap-6 lg:grid-cols-2 w-full min-w-0">
                <div className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-6 flex flex-col w-full min-w-0 overflow-hidden">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Faturamento por canal</h2>
                      <p className="text-sm text-slate-500">Distribuição percentual do período</p>
                    </div>
                  </div>
                  {canaisData.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Nenhum pedido no período.</div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <ChannelDistributionChart data={canaisData} totalLabel={formatBRL(totalCanaisValue)} />
                      <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium text-slate-600 dark:text-slate-200">
                        {canaisData.map((canal) => (
                          <div key={canal.name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: canal.color }} />
                            <span>{canal.name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-100">
                              {formatPercent(canal.percentage)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-6 flex flex-col w-full min-w-0 overflow-hidden">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Mapa de vendas (Brasil)</h2>
                      <p className="text-sm text-slate-500">Calor por estado e ranking por cidade</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] w-full min-w-0">
                    <div className="min-w-0">
                      {(() => {
                        const vendasUF = dashboardSource?.mapaVendasUF ?? [];
                        const vendasCidade = dashboardSource?.mapaVendasCidade ?? [];
                        if (!vendasUF.length) return <p className="text-sm text-slate-400">Sem dados suficientes para o mapa neste período.</p>;
                        return (
                          <BrazilSalesMap dataUF={vendasUF} topCidades={vendasCidade.slice(0, 10)} />
                        );
                      })()}
                    </div>
                      <div className="min-w-0 flex flex-col gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2">Estados</p>
                          <div className="space-y-2">
                            {((dashboardSource?.mapaVendasUF ?? []).slice(0, 6)).map((uf) => (
                              <div key={uf.uf} className="flex items-center justify-between rounded-xl glass-panel glass-tint border border-white/60 dark:border-white/10 px-3 py-2">
                                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{uf.uf}</div>
                                <div className="text-right text-xs">
                                  <div className="font-semibold text-slate-900 dark:text-white">{formatBRL(uf.totalValor)}</div>
                                  <div className="text-slate-500">{uf.totalPedidos.toLocaleString('pt-BR')} pedidos</div>
                                </div>
                              </div>
                            ))}
                            {(!dashboardSource?.mapaVendasUF || dashboardSource.mapaVendasUF.length === 0) && (
                              <p className="text-xs text-slate-400">Nenhum estado com vendas.</p>
                            )}
                          </div>
                        </div>
                      </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2 w-full min-w-0">
                <div className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-6 w-full min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Top 10</p>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Produtos mais vendidos</h2>
                    </div>
                    <span className="text-xs text-slate-400">Atual: {topProdutos.length}</span>
                  </div>
                  {topProdutos.length ? (
                    <>
                      {/* Desktop / tablet: lista vertical com 5 visíveis e scroll suave */}
                      <div className="relative hidden md:block">
                        <div className="grid grid-cols-2 gap-4 pr-2 max-h-[820px] overflow-y-auto scrollbar-hide">
                          {topProdutos.map((produto, idx) => (
                            <div
                              key={`${produto.produtoId ?? produto.descricao}`}
                              className="product-card rounded-3xl p-4 flex gap-4 items-stretch"
                            >
                              <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden flex-shrink-0 border border-white/60 dark:border-white/10">
                                {produto.imagemUrl ? (
                                  <>
                                    {/* Tiny envia URLs fora do domínio permitido pelo next/image */}
                                    {/* eslint-disable-next-line @next/next/no-img-element -- Tiny image URLs não estão na allowlist do Next Image ainda */}
                                    <img
                                      src={produto.imagemUrl}
                                      alt={produto.descricao}
                                      className="absolute inset-0 w-full h-full object-cover"
                                    />
                                  </>
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white bg-slate-800/90">
                                    {getInitials(produto.descricao)}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-base font-semibold text-slate-900 dark:text-white leading-tight truncate">{produto.descricao}</p>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 truncate">{produto.sku ? `SKU ${produto.sku}` : 'Sem SKU'}</p>
                                  </div>
                                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/60 dark:border-white/15 bg-white/80 dark:bg-white/10 text-[#009DA8] text-xs font-extrabold">
                                    {idx + 1}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <div className="space-y-1 text-[10px] text-slate-600 dark:text-slate-300">
                                    <p className="font-semibold text-slate-800 dark:text-slate-200">Estoque: <span className="font-normal">{produto.saldo ?? '—'}</span></p>
                                    <p>Reservado: {produto.reservado ?? '—'}</p>
                                    <p>Disponível: {produto.disponivel ?? '—'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{produto.quantidade.toLocaleString('pt-BR')} un</p>
                                    <p className="text-xs text-slate-500 font-medium">{formatBRL(produto.receita)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="fade-bottom" />
                      </div>

                      {/* Mobile: carrossel horizontal com snap */}
                      <div className="relative md:hidden -mx-4 px-4">
                        <div className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-3">
                          {topProdutos.map((produto, idx) => (
                            <div
                              key={`${produto.produtoId ?? produto.descricao}`}
                              className="product-card rounded-3xl p-4 flex gap-4 min-w-[86vw] snap-center items-stretch"
                            >
                              <div className="relative w-32 h-32 rounded-2xl overflow-hidden flex-shrink-0 border border-white/60 dark:border-white/10">
                                {produto.imagemUrl ? (
                                  <>
                                    {/* Tiny envia URLs fora do domínio permitido pelo next/image */}
                                    {/* eslint-disable-next-line @next/next/no-img-element -- Tiny image URLs não estão na allowlist do Next Image ainda */}
                                    <img
                                      src={produto.imagemUrl}
                                      alt={produto.descricao}
                                      className="absolute inset-0 w-full h-full object-cover"
                                    />
                                  </>
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white bg-slate-800/90">
                                    {getInitials(produto.descricao)}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{produto.descricao}</p>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 truncate">{produto.sku ? `SKU ${produto.sku}` : 'Sem SKU'}</p>
                                  </div>
                                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/60 dark:border-white/15 bg-white/80 dark:bg-white/10 text-[#009DA8] text-xs font-extrabold">
                                    {idx + 1}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <div className="space-y-1 text-[10px] text-slate-600 dark:text-slate-300">
                                    <p className="font-semibold text-slate-800 dark:text-slate-200">Estoque: <span className="font-normal">{produto.saldo ?? '—'}</span></p>
                                    <p>Reservado: {produto.reservado ?? '—'}</p>
                                    <p>Disponível: {produto.disponivel ?? '—'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{produto.quantidade.toLocaleString('pt-BR')} un</p>
                                    <p className="text-xs text-slate-500 font-medium">{formatBRL(produto.receita)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="fade-side fade-left" />
                        <div className="fade-side fade-right" />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Sincronize pedidos com itens para ver os produtos líderes.</p>
                  )}
                </div>

                <div className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-6 w-full min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Últimos pedidos</h2>
                    <span className="text-xs text-slate-400">{recentOrders.length} recentes</span>
                  </div>
                  {loadingRecentOrders ? (
                    <p className="text-sm text-slate-400">Carregando...</p>
                  ) : recentOrders.length > 0 ? (
                    <div className="space-y-3">
                      {recentOrders.map((pedido) => {
                        const situacaoLabel = labelSituacao(pedido.situacao ?? -1);
                        const dataCriacao = pedido.dataCriacao
                          ? (() => {
                              const [y, m, d] = pedido.dataCriacao.split('-');
                              return `${d}/${m}/${y.slice(2)}`;
                            })()
                          : '';
                        return (
                          <div
                            key={pedido.tinyId}
                            className="flex items-center justify-between gap-3 rounded-2xl glass-row border border-white/60 dark:border-white/10 px-4 py-3 min-h-[78px]"
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-white/70 dark:border-slate-700 flex items-center justify-center">
                                {pedido.primeiraImagem ? (
                                  <>
                                    <div className="w-full h-full rounded-2xl overflow-hidden">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={pedido.primeiraImagem} alt="Produto" className="w-full h-full object-cover" />
                                    </div>
                                    {(pedido.itensQuantidade ?? 0) > 1 && (
                                      <span className="absolute top-0 right-0 translate-x-2 -translate-y-1/2 bg-white text-[var(--accent)] border border-[var(--accent)] rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{zIndex:50}}>
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
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">#{pedido.numeroPedido || pedido.tinyId}</p>
                                {pedido.canal && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#009DA8]/10 dark:bg-[#7de8ff]/15 text-[#009DA8] dark:text-[#7de8ff] font-medium">{pedido.canal}</span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 truncate">{pedido.cliente || 'Cliente'} • {dataCriacao}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{situacaoLabel}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-[#009DA8] dark:text-[#6fe8ff]">{formatBRL(pedido.valor ?? 0)}</p>
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
              <div className="relative overflow-hidden rounded-[32px] glass-panel glass-tint border border-white/70 dark:border-white/10 p-6">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0  from-white/80  dark:via-[#121626]/40 dark:to-[#0c111f] opacity-80" />
                  <div className="absolute -top-16 -left-10 h-40 w-40 rounded-full bg-white/30 blur-3xl" />
                  <div className="absolute -bottom-10 -right-6 h-52 w-52  blur-3xl" />
                </div>
                <div className="relative flex items-center justify-between mb-5">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Vendas por dia</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Base consolidada ({GLOBAL_INTERVAL_DAYS} dias) • filtros de canal/situação aplicados
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">{vendasPorDiaOrdenadas.length} registros</span>
                </div>
                <div className="relative overflow-hidden rounded-3xl glass-row border border-white/50 dark:border-white/10">
                  <div className="grid grid-cols-3 glass-row text-slate-500 dark:text-slate-300 uppercase tracking-[0.08em] text-xs font-semibold px-4 py-3">
                    <span className="text-left">Data</span>
                    <span className="text-right">Qtde</span>
                    <span className="text-right">Total</span>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto divide-y divide-white/40 dark:divide-white/10">
                    {vendasPorDiaOrdenadas.map((linha, idx) => {
                      const [, m, d] = linha.data.split('-');
                      const dataBR = d && m ? `${d}/${m}` : linha.data;
                      const weekday = (() => {
                        const dt = new Date(`${linha.data}T00:00:00`);
                        return dt.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase();
                      })();
                      return (
                        <div
                          key={linha.data}
                          className={`grid grid-cols-3 px-4 py-3 text-xs sm:text-sm ${
                            idx % 2 === 0 ? ' dark:bg-white/5' : 'dark:bg-white/[0.02]'
                          } hover:bg-white/70 dark:hover:bg-white/10 transition-colors`}
                        >
                          <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold">
                            <span className="text-[10px] sm:text-[11px] uppercase text-slate-400">{weekday}</span>
                            <span>{dataBR}</span>
                          </div>
                          <div className="flex items-center justify-end text-slate-600 dark:text-slate-300">{linha.quantidade}</div>
                          <div className="flex items-center justify-end font-semibold text-slate-900 dark:text-white">{formatBRL(linha.totalDia)}</div>
                        </div>
                      );
                    })}
                    {!vendasPorDiaOrdenadas.length && (
                      <div className="px-4 py-6 text-center text-slate-400 text-xs">Nenhum registro consolidado ainda.</div>
                    )}
                  </div>
                </div>
              </div>

            <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Pedidos por situação</h2>
                  <span className="text-xs text-slate-400">Fluxo Tiny</span>
                </div>
                <div className="space-y-3">
                  {loadingTopSituacoesMes ? (
                    <p className="text-sm text-slate-400">Carregando situações do mês…</p>
                  ) : situacoesLista.length ? (
                    situacoesLista.map((linha, idx) => (
                      <div key={idx} className="flex items-center justify-between glass-row rounded-2xl border border-white/50 dark:bg-slate-900/60 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{labelSituacao(linha.situacao)}</p>
                          <p className="text-[11px] text-slate-400">Status operacional</p>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{linha.quantidade}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">Aguardando dados…</p>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-4">
                  Mapeamento ajustável conforme configuração do Tiny.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Copilot mobile-only (rendered no final do app) */}
      <div className="xl:hidden pb-12 mt-8">
        <aside
          className="w-full min-w-0 mx-auto rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6 flex flex-col gap-5 overflow-hidden"
        >
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Insights de IA</p>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Ambienta Copilot</h3>
            <p className="text-sm text-slate-500 leading-relaxed">Análises automáticas geradas com Gemini.</p>
          </div>
          <button
            onClick={() => gerarInsights(false)}
            className="w-full rounded-2xl bg-gradient-to-r from-[#009DA8] to-[#38c5cf] text-white text-sm font-semibold py-2.5 disabled:opacity-60"
            disabled={loadingInsights || !insightsBaseline}
          >
            {loadingInsights ? 'Gerando insights…' : 'Atualizar com Gemini'}
          </button>
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <div
              ref={insightsScrollRef}
              className="insights-scroll space-y-3 h-full min-h-0 overflow-y-auto pr-2 pb-6"
              style={{ maxHeight: '50vh' }}
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
                      className={`rounded-2xl border px-4 py-3 text-sm flex items-start gap-3 ${theme.bg} ${theme.border} dark:border-transparent`}
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
        </aside>
      </div>
    </>
  );
}
