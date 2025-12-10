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
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  ZoomIn,
  ZoomOut,
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
const PRODUTO_CARD_PRESETS = [
  { id: '30d', label: '30 dias' },
  { id: 'month', label: 'Mês atual' },
  { id: 'year', label: 'Ano' },
] as const;
type ProdutoCardPreset = (typeof PRODUTO_CARD_PRESETS)[number]['id'];
const DASHBOARD_AUTO_REFRESH_MS = 60_000; // polling leve para dados mais frescos
const EMPTY_ZOOM_LEVELS: ProdutoZoomLevel[] = [];
const EMPTY_SERIE: ProdutoSerieDia[] = [];

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
  vendasPorHora: HoraTrend[];
};

type CanalResumo = {
  canal: string;
  totalValor: number;
  totalPedidos: number;
};

type ProdutoSerieDia = {
  data: string;
  quantidade: number;
  receita: number;
};

type HoraTrend = {
  label: string;
  hoje: number;
  ontem: number;
  quantidade?: number;
  quantidadeOntem?: number;
};

type MicroTrendHora = {
  horaIndex: number;
  faturamento: number | null;
  pedidos: number | null;
};

type MicroTrendWindow24h = {
  start: string;
  end: string;
  seriesPorHora: MicroTrendHora[];
};

type MicroTrend24h = {
  currentWindow: MicroTrendWindow24h;
  previousWindow: MicroTrendWindow24h;
};

type ProdutoZoomNivel = 'pai' | 'variacao' | 'kit' | 'simples' | 'origem' | 'desconhecido';

type ProdutoZoomLevel = {
  key: string;
  produtoId: number | null;
  sku?: string | null;
  descricao: string;
  tipo?: string | null;
  nivel: ProdutoZoomNivel;
  childSource?: 'variacoes' | 'kit' | null;
  quantidade: number;
  receita: number;
  serieDiaria?: ProdutoSerieDia[];
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
  serieDiaria?: ProdutoSerieDia[];
  zoomLevels?: ProdutoZoomLevel[];
};

type SituacaoDisponivel = {
  codigo: number;
  descricao: string;
};

type MetricDiff = {
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

type DashboardDiffs = {
  faturamento: MetricDiff;
  pedidos: MetricDiff;
  ticketMedio: MetricDiff;
  // campos legados para compatibilidade com caches antigos
  faturamentoDelta: number;
  faturamentoDeltaPercent: number | null;
  faturamentoHasComparison: boolean;
  pedidosDelta: number;
  pedidosDeltaPercent: number | null;
  pedidosHasComparison: boolean;
  ticketMedioDelta: number;
  ticketMedioDeltaPercent: number | null;
  ticketMedioHasComparison: boolean;
};

type DashboardResumo = {
  current: PeriodoResumo;
  previous: PeriodoResumo;
  diffs: DashboardDiffs;
  // aliases legados para compatibilidade com caches pré-existentes
  periodoAtual: PeriodoResumo;
  periodoAnterior: PeriodoResumo;
  periodoAnteriorCards: PeriodoResumo;
  microTrend24h?: MicroTrend24h;
  canais: CanalResumo[];
  canaisDisponiveis: string[];
  situacoesDisponiveis: SituacaoDisponivel[];
  mapaVendasUF?: Array<{ uf: string; totalValor: number; totalPedidos: number }>;
  mapaVendasCidade?: Array<{ cidade: string; uf: string | null; totalValor: number; totalPedidos: number }>;
  lastUpdatedAt?: string | null;
  diffsFromPayload?: boolean;
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
const ZOOM_NIVEL_LABELS: Record<ProdutoZoomNivel, string> = {
  pai: 'Kit pai',
  variacao: 'Variação',
  kit: 'Kit',
  simples: 'Simples',
  origem: 'Origem',
  desconhecido: 'Outro',
};

const buildProdutoKey = (produto: ProdutoResumo): string => {
  if (typeof produto.produtoId === 'number' && Number.isFinite(produto.produtoId)) {
    return `id:${produto.produtoId}`;
  }
  if (produto.sku) {
    return `sku:${produto.sku}`;
  }
  return `desc:${produto.descricao.toLowerCase()}`;
};

const formatSerieLabel = (isoDate: string): string => {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
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
  customEnd: string | null,
  canais: string[],
  situacoes: number[]
) {
  const canaisKey = canais.length ? [...canais].sort().join('|') : 'all';
  const situacoesKey = situacoes.length ? [...situacoes].sort((a, b) => a - b).join('|') : 'all';
  const customKey = `${customStart ?? 'na'}:${customEnd ?? 'na'}`;
  return `${CHART_CACHE_PREFIX}:${preset}:${customKey}:${inicio}:${fim}:${canaisKey}:${situacoesKey}`;
}

function intervaloIncluiHoje(inicio: string, fim: string) {
  const hoje = isoToday();
  return inicio <= hoje && fim >= hoje;
}

function formatBRL(valor: number | null | undefined) {
  const n =
    typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function normalizeProdutoNome(nome: string): string {
  const trimmed = nome.trim();
  if (!trimmed) return 'Produto sem nome';
  const marker = '– ';
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex >= 0) {
    const afterMarker = trimmed.slice(markerIndex + marker.length).trim();
    if (afterMarker) return afterMarker;
  }
  return trimmed;
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

function nowInTimeZone(timeZone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
}

function endOfMonthFrom(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function diffDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00`);
  const b = new Date(`${endIso}T00:00:00`);
  const diff = b.getTime() - a.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function buildDiff(currentValue: number | null | undefined, previousValue: number | null | undefined): MetricDiff {
  const current = Number.isFinite(currentValue) ? Number(currentValue) : 0;
  const previous = Number.isFinite(previousValue) ? Number(previousValue) : 0;
  const delta = current - previous;
  const deltaPercent = previous > 0 ? (delta / previous) * 100 : null;
  return { current, previous, delta, deltaPercent };
}

function computeDashboardDiffs(current: PeriodoResumo, previous: PeriodoResumo): DashboardDiffs {
  const faturamento = buildDiff(current.totalValor, previous.totalValor);
  const pedidos = buildDiff(current.totalPedidos, previous.totalPedidos);
  const ticket = buildDiff(current.ticketMedio, previous.ticketMedio);

  return {
    faturamento,
    pedidos,
    ticketMedio: ticket,
    // legados
    faturamentoDelta: faturamento.delta,
    faturamentoDeltaPercent: faturamento.deltaPercent,
    faturamentoHasComparison: faturamento.previous > 0,
    pedidosDelta: pedidos.delta,
    pedidosDeltaPercent: pedidos.deltaPercent,
    pedidosHasComparison: pedidos.previous > 0,
    ticketMedioDelta: ticket.delta,
    ticketMedioDeltaPercent: ticket.deltaPercent,
    ticketMedioHasComparison: ticket.previous > 0,
  };
}

const isMetricDiff = (value: unknown): value is MetricDiff => {
  if (!value || typeof value !== 'object') return false;
  const v = value as MetricDiff;
  return (
    typeof v.current === 'number' &&
    typeof v.previous === 'number' &&
    typeof v.delta === 'number' &&
    ('deltaPercent' in v)
  );
};

function normalizeDashboardResumo(raw: unknown, previousState?: DashboardResumo | null): DashboardResumo {
  if (!raw || typeof raw !== 'object') throw new Error('Resumo do dashboard indisponível');
  const data = raw as Partial<DashboardResumo> & Record<string, unknown>;
  const hydrateMicroTrend24h = (value?: MicroTrend24h | null, fallback?: MicroTrend24h | null): MicroTrend24h | null => {
    const base = value ?? fallback;
    if (!base) return null;
    const current = base.currentWindow ?? { start: '', end: '', seriesPorHora: [] };
    const previous = base.previousWindow ?? { start: '', end: '', seriesPorHora: [] };
    return {
      currentWindow: {
        start: current.start ?? '',
        end: current.end ?? '',
        seriesPorHora: Array.isArray(current.seriesPorHora) ? current.seriesPorHora : [],
      },
      previousWindow: {
        start: previous.start ?? '',
        end: previous.end ?? '',
        seriesPorHora: Array.isArray(previous.seriesPorHora) ? previous.seriesPorHora : [],
      },
    };
  };
  const hydratePeriodo = (value?: PeriodoResumo | null, fallback?: PeriodoResumo | null): PeriodoResumo | null => {
    const base = value ?? fallback;
    if (!base) return null;
    return {
      dataInicial: base.dataInicial,
      dataFinal: base.dataFinal ?? base.dataInicial,
      dias: Number.isFinite(base.dias as number) ? Number(base.dias) : 0,
      totalPedidos: Number.isFinite(base.totalPedidos as number) ? Number(base.totalPedidos) : 0,
      totalValor: Number.isFinite(base.totalValor as number) ? Number(base.totalValor) : 0,
      totalValorLiquido: Number.isFinite(base.totalValorLiquido as number) ? Number(base.totalValorLiquido) : 0,
      totalFreteTotal: Number.isFinite(base.totalFreteTotal as number) ? Number(base.totalFreteTotal) : 0,
      ticketMedio: Number.isFinite(base.ticketMedio as number) ? Number(base.ticketMedio) : 0,
      vendasPorDia: base.vendasPorDia ?? [],
      pedidosPorSituacao: base.pedidosPorSituacao ?? [],
      totalProdutosVendidos: Number.isFinite(base.totalProdutosVendidos as number)
        ? Number(base.totalProdutosVendidos)
        : 0,
      percentualCancelados: Number.isFinite(base.percentualCancelados as number)
        ? Number(base.percentualCancelados)
        : 0,
      topProdutos: base.topProdutos ?? [],
      vendasPorHora: base.vendasPorHora ?? [],
    };
  };

  const buildEmptyPeriodoFromCurrent = (curr: PeriodoResumo): PeriodoResumo => ({
    dataInicial: curr.dataInicial,
    dataFinal: curr.dataFinal ?? curr.dataInicial,
    dias: curr.dias ?? 0,
    totalPedidos: 0,
    totalValor: 0,
    totalValorLiquido: 0,
    totalFreteTotal: 0,
    ticketMedio: 0,
    vendasPorDia: [],
    pedidosPorSituacao: [],
    totalProdutosVendidos: 0,
    percentualCancelados: 0,
    topProdutos: [],
    vendasPorHora: [],
  });

  const currentCandidate = (
    data.current ?? data.periodoAtual ?? data.periodo ?? data.periodoAnterior ?? data.periodoAnteriorCards
  ) as PeriodoResumo | undefined;
  const previousCandidate = (data.previous ?? data.periodoAnterior ?? data.periodoAnteriorCards ?? currentCandidate) as
    | PeriodoResumo
    | undefined;

  const resolvedCurrent =
    hydratePeriodo(currentCandidate, previousState?.current ?? previousState?.periodoAtual) ??
    hydratePeriodo(previousState?.periodoAtual) ??
    null;

  if (!resolvedCurrent) throw new Error('Resumo do dashboard incompleto: período atual ausente');

  const resolvedPrevious =
    hydratePeriodo(
      previousCandidate,
      previousState?.previous ?? previousState?.periodoAnterior ?? previousState?.periodoAnteriorCards
    ) ?? buildEmptyPeriodoFromCurrent(resolvedCurrent);

  const fallbackDiffs = computeDashboardDiffs(resolvedCurrent, resolvedPrevious);
  const incomingDiffs = (data.diffs ?? {}) as Partial<DashboardDiffs>;
  const diffsFromPayload = Boolean(data.diffs);
  const faturamentoMetric = isMetricDiff(incomingDiffs.faturamento)
    ? incomingDiffs.faturamento
    : fallbackDiffs.faturamento;
  const pedidosMetric = isMetricDiff(incomingDiffs.pedidos)
    ? incomingDiffs.pedidos
    : fallbackDiffs.pedidos;
  const ticketMetric = isMetricDiff(incomingDiffs.ticketMedio)
    ? incomingDiffs.ticketMedio
    : fallbackDiffs.ticketMedio;

  const diffs: DashboardDiffs = {
    faturamento: faturamentoMetric,
    pedidos: pedidosMetric,
    ticketMedio: ticketMetric,
    faturamentoDelta: Number.isFinite(incomingDiffs.faturamentoDelta as number)
      ? Number(incomingDiffs.faturamentoDelta)
      : faturamentoMetric.delta,
    faturamentoDeltaPercent:
      typeof incomingDiffs.faturamentoDeltaPercent === 'number' && Number.isFinite(incomingDiffs.faturamentoDeltaPercent)
        ? incomingDiffs.faturamentoDeltaPercent
        : faturamentoMetric.deltaPercent,
    faturamentoHasComparison:
      typeof incomingDiffs.faturamentoHasComparison === 'boolean'
        ? incomingDiffs.faturamentoHasComparison
        : faturamentoMetric.previous > 0,
    pedidosDelta: Number.isFinite(incomingDiffs.pedidosDelta as number)
      ? Number(incomingDiffs.pedidosDelta)
      : pedidosMetric.delta,
    pedidosDeltaPercent:
      typeof incomingDiffs.pedidosDeltaPercent === 'number' && Number.isFinite(incomingDiffs.pedidosDeltaPercent)
        ? incomingDiffs.pedidosDeltaPercent
        : pedidosMetric.deltaPercent,
    pedidosHasComparison:
      typeof incomingDiffs.pedidosHasComparison === 'boolean'
        ? incomingDiffs.pedidosHasComparison
        : pedidosMetric.previous > 0,
    ticketMedioDelta: Number.isFinite(incomingDiffs.ticketMedioDelta as number)
      ? Number(incomingDiffs.ticketMedioDelta)
      : ticketMetric.delta,
    ticketMedioDeltaPercent:
      typeof incomingDiffs.ticketMedioDeltaPercent === 'number' && Number.isFinite(incomingDiffs.ticketMedioDeltaPercent)
        ? incomingDiffs.ticketMedioDeltaPercent
        : ticketMetric.deltaPercent,
    ticketMedioHasComparison:
      typeof incomingDiffs.ticketMedioHasComparison === 'boolean'
        ? incomingDiffs.ticketMedioHasComparison
        : ticketMetric.previous > 0,
  };
  const canais = data.canais ?? previousState?.canais ?? [];
  const canaisDisponiveis = data.canaisDisponiveis ?? previousState?.canaisDisponiveis ?? [];
  const situacoesDisponiveis = data.situacoesDisponiveis ?? previousState?.situacoesDisponiveis ?? [];
  const mapaVendasUF = data.mapaVendasUF ?? previousState?.mapaVendasUF ?? [];
  const mapaVendasCidade = data.mapaVendasCidade ?? previousState?.mapaVendasCidade ?? [];
  const lastUpdatedAt = data.lastUpdatedAt ?? previousState?.lastUpdatedAt ?? null;
  const resolvedMicroTrend24h =
    hydrateMicroTrend24h((data.microTrend24h as MicroTrend24h | undefined) ?? null, previousState?.microTrend24h) ?? {
      currentWindow: { start: '', end: '', seriesPorHora: [] },
      previousWindow: { start: '', end: '', seriesPorHora: [] },
    };

  return {
    ...data,
    current: resolvedCurrent,
    previous: resolvedPrevious,
    diffs,
    canais,
    canaisDisponiveis,
    situacoesDisponiveis,
    mapaVendasUF,
    mapaVendasCidade,
    lastUpdatedAt,
    microTrend24h: resolvedMicroTrend24h,
    diffsFromPayload,
    periodoAtual: resolvedCurrent,
    periodoAnterior: resolvedPrevious,
    periodoAnteriorCards: resolvedPrevious,
  };
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
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [resumoGlobal, setResumoGlobal] = useState<DashboardResumo | null>(null);
  const [loadingGlobal, setLoadingGlobal] = useState<boolean>(true);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);

  const [canaisSelecionados, setCanaisSelecionados] = useState<string[]>([]);
  const [situacoesSelecionadas, setSituacoesSelecionadas] = useState<number[]>([]);
  const [topSituacoesMes, setTopSituacoesMes] = useState<SituacaoResumo[]>([]);
  const [situacoesMes, setSituacoesMes] = useState<SituacaoResumo[]>([]);
  const [loadingTopSituacoesMes, setLoadingTopSituacoesMes] = useState<boolean>(false);

  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [selectedProdutoKey, setSelectedProdutoKey] = useState<string | null>(null);
  const [selectedZoomLevelKey, setSelectedZoomLevelKey] = useState<string | null>(null);
  const [produtoCardPreset, setProdutoCardPreset] = useState<ProdutoCardPreset>('30d');

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
  const [nowTick, setNowTick] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return null;
    const parsed = Date.parse(lastUpdatedAt);
    if (!Number.isFinite(parsed)) return null;
    const diffMs = Math.max(0, nowTick - parsed);
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.floor(hours / 24);
    return `há ${days} d`;
  }, [lastUpdatedAt, nowTick]);

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

  function monthRange(referenceIso: string, startMonthOffset: number, lengthMonths: number) {
    const base = new Date(`${referenceIso}T00:00:00`);
    base.setMonth(base.getMonth() + startMonthOffset);
    base.setDate(1);
    const start = base.toISOString().slice(0, 10);

    const endDate = new Date(base.getTime());
    endDate.setMonth(endDate.getMonth() + lengthMonths);
    endDate.setDate(0);
    const end = endDate.toISOString().slice(0, 10);

    return { start, end };
  }

  function resolverIntervalo(): { inicio: string; fim: string; previousInicio?: string; previousFim?: string } {
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
      // Últimos 2 meses completos (ex.: hoje=2025-12-09 => 2025-10-01 a 2025-11-30)
      const { start: inicio, end: fim } = monthRange(hojeIso, -2, 2);
      const { start: previousInicio, end: previousFim } = monthRange(hojeIso, -4, 2);
      return { inicio, fim, previousInicio, previousFim };
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

  const MICROTREND_WINDOW_MS = 24 * 60 * 60 * 1000;

  function appendMicrotrendWindows(params: URLSearchParams) {
    const timeZone = 'America/Sao_Paulo';
    const alignToHour = (date: Date) => new Date(Math.floor(date.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000);
    const nowTz = nowInTimeZone(timeZone);
    const currentEnd = alignToHour(nowTz);
    const currentStart = new Date(currentEnd.getTime() - MICROTREND_WINDOW_MS);
    const previousEnd = currentStart;
    const previousStart = new Date(previousEnd.getTime() - MICROTREND_WINDOW_MS);

    params.set('microCurrentStart', currentStart.toISOString());
    params.set('microCurrentEnd', currentEnd.toISOString());
    params.set('microPrevStart', previousStart.toISOString());
    params.set('microPrevEnd', previousEnd.toISOString());
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

  async function carregarResumo(options?: { force?: boolean; background?: boolean }) {
    if (!filtersLoaded) return;
    const force = options?.force ?? false;
    const background = options?.background ?? false;
    const requestId = ++resumoRequestId.current;
    const { inicio, fim, previousInicio, previousFim } = resolverIntervalo();
    const incluiHoje = intervaloIncluiHoje(inicio, fim);
    const isHojeCard = preset === 'today';
    try {
      const cacheKey = buildResumoCacheKey(inicio, fim, canaisSelecionados, situacoesSelecionadas);
      const cacheEntry = incluiHoje ? null : readCacheEntry<DashboardResumo>(cacheKey);
      const cachedResumo = cacheEntry?.data ? normalizeDashboardResumo(cacheEntry.data, resumo) : null;
      const cacheFresh = incluiHoje ? false : isCacheEntryFresh(cacheEntry, DASHBOARD_CACHE_FRESH_MS);
      const shouldFetch = force || !cacheFresh;
      if (cachedResumo && requestId === resumoRequestId.current) {
        setResumo(cachedResumo);
        setLastUpdatedAt(cachedResumo.lastUpdatedAt ?? null);
      }
      if (requestId === resumoRequestId.current) {
        if (!resumo && !cachedResumo) {
          setIsInitialLoading(true);
        } else if (shouldFetch || background) {
          setIsRefreshing(true);
        } else {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
        setErro(null);
      }
      if (!shouldFetch) {
        if (requestId === resumoRequestId.current) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
        return;
      }
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      params.set('context', isHojeCard ? 'cards-hoje' : 'ultimos-dias');
      if (previousInicio) params.set('previousStart', previousInicio);
      if (previousFim) params.set('previousEnd', previousFim);
      if (!isHojeCard) params.set('noCutoff', '1');
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      appendMicrotrendWindows(params);
      const url = `/api/tiny/dashboard/resumo?${params.toString()}`;
      console.log(isHojeCard ? '[debug-front] resumo-hoje-url' : '[debug-front] url-ultimos-dias', url);
      console.log('[debug-front] microtrend-url', url);
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar resumo do dashboard');
      const parsedResumo = normalizeDashboardResumo(json, resumo);
      if (requestId === resumoRequestId.current) {
        setResumo(parsedResumo);
        setLastUpdatedAt(parsedResumo.lastUpdatedAt ?? null);
        lastResumoFetchRef.current = Date.now();
      }
      if (!incluiHoje) {
        safeWriteCache(cacheKey, parsedResumo);
      }
      try {
        const { inicio, fim, previousInicio, previousFim } = resolverIntervalo();
        const diasEsperados = 1 + diffDays(inicio, fim);
        const atualDias = parsedResumo.periodoAtual.vendasPorDia.length ?? 0;
        const key = `${inicio}_${fim}`;
        const already = !!autoComplementedRanges[key];
        if (requestId === resumoRequestId.current && preset === 'month' && !already && atualDias < diasEsperados) {
          setAutoComplementedRanges((prev) => ({ ...prev, [key]: true }));
          setComplementLoading(true);
          const urlComplement = new URLSearchParams();
          urlComplement.set('dataInicial', inicio);
          urlComplement.set('dataFinal', fim);
          urlComplement.set('complement', '1');
          urlComplement.set('noCutoff', '1');
          urlComplement.set('context', isHojeCard ? 'cards-hoje' : 'ultimos-dias');
          appendMicrotrendWindows(urlComplement);
          const complementUrl = `/api/tiny/dashboard/resumo?${urlComplement.toString()}`;
          console.log('[debug-front] url-ultimos-dias', complementUrl);
          console.log('[debug-front] microtrend-url', complementUrl);
          const resC = await fetch(complementUrl, { cache: 'no-store' });
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
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function carregarResumoGlobal(options?: { force?: boolean }) {
    if (!filtersLoaded) return;
    const force = options?.force ?? false;
    const requestId = ++globalRequestId.current;

    try {
      const { inicio, fim } = resolverIntervaloGlobal();
      const incluiHoje = intervaloIncluiHoje(inicio, fim);
      const cacheKey = buildGlobalCacheKey(inicio, fim, canaisSelecionados, situacoesSelecionadas);
      const cacheEntry = incluiHoje ? null : readCacheEntry<DashboardResumo>(cacheKey);
      const cachedGlobal = cacheEntry?.data ? normalizeDashboardResumo(cacheEntry.data, resumoGlobal) : null;
      const cacheFresh = incluiHoje ? false : isCacheEntryFresh(cacheEntry, GLOBAL_CACHE_FRESH_MS);
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
      params.set('noCutoff', '1');
      params.set('context', 'grafico-diario');
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      appendMicrotrendWindows(params);
      const url = `/api/tiny/dashboard/resumo?${params.toString()}`;
      console.log('[debug-front] resumo-grafico-diario-url', url);
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar visão consolidada');
      const parsedGlobal = normalizeDashboardResumo(json, resumoGlobal);
      if (requestId === globalRequestId.current) {
        setResumoGlobal(parsedGlobal);
        lastGlobalFetchRef.current = Date.now();
      }
      if (!incluiHoje) {
        safeWriteCache(cacheKey, parsedGlobal);
      }
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
      const incluiHoje = intervaloIncluiHoje(inicio, fim);
      const cacheKey = buildResumoCacheKey(inicio, fim, canaisSelecionados, situacoesSelecionadas);
      const cacheEntry = incluiHoje ? null : readCacheEntry<DashboardResumo>(cacheKey);
      const cachedResumo = cacheEntry?.data ? normalizeDashboardResumo(cacheEntry.data, resumo) : null;
      const cacheFresh = incluiHoje ? false : isCacheEntryFresh(cacheEntry, SITUACOES_CACHE_FRESH_MS);
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
      params.set('noCutoff', '1');
      params.set('context', 'top-situacoes');
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      appendMicrotrendWindows(params);
      const url = `/api/tiny/dashboard/resumo?${params.toString()}`;
      console.log('[debug-front] resumo-ultimos-dias-url', url);
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar situações do mês');
      const parsed = normalizeDashboardResumo(json, resumo);
      if (requestId === situacoesRequestId.current) {
        aplicarSituacoesResumo(parsed);
        lastSituacoesFetchRef.current = Date.now();
      }
      if (!incluiHoje) {
        safeWriteCache(cacheKey, parsed);
      }
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
      const incluiHoje = intervaloIncluiHoje(inicio, fim);
      const cacheKey = buildGlobalCacheKey(inicio, fim, [], []);
      const cacheEntry = incluiHoje ? null : readCacheEntry<DashboardResumo>(cacheKey);
      const cached = cacheEntry?.data ? normalizeDashboardResumo(cacheEntry.data, insightsBaseline) : null;
      const cacheFresh = incluiHoje ? false : isCacheEntryFresh(cacheEntry, GLOBAL_CACHE_FRESH_MS);
      if (cached) setInsightsBaseline(cached);
      if (cacheFresh) {
        return;
      }
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      params.set('noCutoff', '1');
      params.set('context', 'insights-base');
      appendMicrotrendWindows(params);
      const url = `/api/tiny/dashboard/resumo?${params.toString()}`;
      console.log('[debug-front] resumo-grafico-diario-url', url);
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar base de insights');
      const parsed = normalizeDashboardResumo(json, insightsBaseline);
      setInsightsBaseline(parsed);
      if (!incluiHoje) {
        safeWriteCache(cacheKey, parsed);
      }
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
      carregarResumo({ force: false, background: true });
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
        pageSize: '16',
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

  function resolverIntervaloChart(): {
    start: string;
    end: string;
    previousStart: string;
    previousEnd: string;
  } {
    const hojeIso = isoToday();

    let start: string;
    let end: string;

    switch (chartPreset) {
      case 'today':
        start = hojeIso;
        end = hojeIso;
        break;
      case '7d':
        end = hojeIso;
        start = addDays(end, -6);
        break;
      case '30d':
        end = hojeIso;
        start = addDays(end, -29);
        break;
      case 'month': {
        const inicioMes = startOfMonthFrom(hojeIso);
        start = inicioMes;
        end = hojeIso; // mês atual do dia 1 até hoje

        const diaAntesDoMesAtual = addDays(inicioMes, -1);
        const previousStart = startOfMonthFrom(diaAntesDoMesAtual);
        const previousEnd = endOfMonthFrom(previousStart);

        return { start, end, previousStart, previousEnd };
      }
      default:
        if (chartCustomStart && chartCustomEnd) {
          start = chartCustomStart;
          end = chartCustomEnd;
        } else {
          const inicioMes = startOfMonthFrom(hojeIso);
          start = inicioMes;
          end = hojeIso;
        }
        break;
    }

    const daysSpan = 1 + diffDays(start, end);
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -1 * (daysSpan - 1));

    return { start, end, previousStart, previousEnd };
  }

  async function carregarResumoChart() {
    const requestId = ++chartRequestId.current;

    try {
      const { start, end, previousStart, previousEnd } = resolverIntervaloChart();
      const incluiHoje = intervaloIncluiHoje(start, end);
      const cacheKey = buildChartCacheKey(
        start,
        end,
        chartPreset,
        chartCustomStart,
        chartCustomEnd,
        canaisSelecionados,
        situacoesSelecionadas
      );
      const cacheEntry = incluiHoje ? null : readCacheEntry<DashboardResumo>(cacheKey);
      const cachedChart = cacheEntry?.data ? normalizeDashboardResumo(cacheEntry.data, resumoChart) : null;
      const cacheFresh = incluiHoje ? false : isCacheEntryFresh(cacheEntry, CHART_CACHE_FRESH_MS);
      if (cachedChart && requestId === chartRequestId.current) setResumoChart(cachedChart);
      if (requestId === chartRequestId.current) {
        setLoadingChart(!cachedChart);
        setErroChart(null);
      }
      if (cacheFresh) {
        return;
      }
      const params = new URLSearchParams();
      params.set('dataInicial', start);
      params.set('dataFinal', end);
      params.set('noCutoff', '1');
      params.set('context', 'grafico-diario');
      params.set('previousStart', previousStart);
      params.set('previousEnd', previousEnd);
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      appendMicrotrendWindows(params);
      const url = `/api/tiny/dashboard/resumo?${params.toString()}`;
      console.log('[debug-front] resumo-grafico-diario-url', url);
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar resumo (gráfico)');
      const parsedChart = normalizeDashboardResumo(json, resumoChart);
      console.log('[debug-front] resumoChart', {
        periodoAtual: parsedChart?.periodoAtual,
        periodoAnterior: parsedChart?.periodoAnterior,
      });
      if (requestId === chartRequestId.current) {
        setResumoChart(parsedChart);
      }
      if (!incluiHoje) {
        safeWriteCache(cacheKey, parsedChart);
      }
      try {
        const { start: inicio, end: fim } = resolverIntervaloChart();
        const diasEsperados = 1 + diffDays(inicio, fim);
        const atualDias = parsedChart.periodoAtual.vendasPorDia.length ?? 0;
        const key = `${inicio}_${fim}`;
        const already = !!autoComplementedRanges[key];
        if (requestId === chartRequestId.current && chartPreset === 'month' && !already && atualDias < diasEsperados) {
          setAutoComplementedRanges((prev) => ({ ...prev, [key]: true }));
          setComplementLoading(true);
          const urlParams = new URLSearchParams();
          urlParams.set('dataInicial', inicio);
          urlParams.set('dataFinal', fim);
          urlParams.set('complement', '1');
          urlParams.set('noCutoff', '1');
          urlParams.set('context', 'grafico-diario');
          appendMicrotrendWindows(urlParams);
          const complementUrl = `/api/tiny/dashboard/resumo?${urlParams.toString()}`;
          console.log('[debug-front] resumo-grafico-diario-url', complementUrl);
          const resC = await fetch(complementUrl, { cache: 'no-store' });
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
  }, [chartPreset, chartCustomStart, chartCustomEnd, canaisSelecionados, situacoesSelecionadas]);

  async function handleComplementChart() {
    try {
      setComplementLoading(true);
      setComplementMsg(null);
      const { start, end, previousStart, previousEnd } = resolverIntervaloChart();
      const params = new URLSearchParams();
      params.set('dataInicial', start);
      params.set('dataFinal', end);
      params.set('previousStart', previousStart);
      params.set('previousEnd', previousEnd);
      params.set('complement', '1');
      params.set('noCutoff', '1');
      params.set('context', 'grafico-diario');
      appendMicrotrendWindows(params);
      const url = `/api/tiny/dashboard/resumo?${params.toString()}`;
      console.log('[debug-front] resumo-grafico-diario-url', url);
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
    const current = source.current ?? source.periodoAtual;
    const previous = source.previous ?? source.periodoAnterior;
    if (!current || !previous) return [];

    const mapaAtualValor = new Map<string, number>();
    const mapaAnteriorValor = new Map<string, number>();
    const mapaAtualPedidos = new Map<string, number>();
    const mapaAnteriorPedidos = new Map<string, number>();
    current.vendasPorDia.forEach((d) => {
      mapaAtualValor.set(d.data, d.totalDia);
      mapaAtualPedidos.set(d.data, d.quantidade ?? 0);
    });
    previous.vendasPorDia.forEach((d) => {
      mapaAnteriorValor.set(d.data, d.totalDia);
      mapaAnteriorPedidos.set(d.data, d.quantidade ?? 0);
    });

    // Exibe sempre 31 dias no preset de mês.
    // - Série atual: dias futuros ficam null para parar a linha.
    // - Série anterior: usa o mês anterior completo (até o último dia do mês), não corta pela janela atual.
    if (chartPreset === 'month') {
      const pontos: Array<{
        data: string;
        atual: number | null;
        anterior: number | null;
        pedidosAtual: number | null;
        pedidosAnterior: number | null;
      }> = [];
      const totalDias = 31;
      for (let i = 0; i < totalDias; i += 1) {
        const label = String(i + 1).padStart(2, '0');
        const dataAtual = addDays(current.dataInicial, i);
        const dataAnterior = addDays(previous.dataInicial, i);
        const dentroJanelaAtual = dataAtual <= current.dataFinal;
        const dentroJanelaAnterior = dataAnterior <= previous.dataFinal;

        const valorAtual = dentroJanelaAtual ? mapaAtualValor.get(dataAtual) ?? 0 : null;
        const valorAnterior = dentroJanelaAnterior ? mapaAnteriorValor.get(dataAnterior) ?? 0 : null;
        const pedidosAtual = dentroJanelaAtual ? mapaAtualPedidos.get(dataAtual) ?? 0 : null;
        const pedidosAnterior = dentroJanelaAnterior ? mapaAnteriorPedidos.get(dataAnterior) ?? 0 : null;

        pontos.push({ data: label, atual: valorAtual, anterior: valorAnterior, pedidosAtual, pedidosAnterior });
      }
      return pontos;
    }

    const pontos: Array<{ data: string; atual: number; anterior: number; pedidosAtual: number; pedidosAnterior: number }> = [];
    let cursorAtual = current.dataInicial;
    let cursorAnterior = previous.dataInicial;
    while (cursorAtual <= current.dataFinal && cursorAnterior <= previous.dataFinal) {
      pontos.push({
        data: cursorAtual,
        atual: mapaAtualValor.get(cursorAtual) ?? 0,
        anterior: mapaAnteriorValor.get(cursorAnterior) ?? 0,
        pedidosAtual: mapaAtualPedidos.get(cursorAtual) ?? 0,
        pedidosAnterior: mapaAnteriorPedidos.get(cursorAnterior) ?? 0,
      });
      cursorAtual = addDays(cursorAtual, 1);
      cursorAnterior = addDays(cursorAnterior, 1);
    }
    return pontos;
  }, [dashboardChartSource, chartPreset]);

  const chartTicks = useMemo(() => {
    if (!chartData.length) return [0, 1000];
    const valores = chartData
      .flatMap((d) => [d.atual, d.anterior])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (!valores.length) return [0, 1000];
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
    if (!dashboardSource?.diffs)
      return { abs: 0, perc: null as number | null, hasComparison: false };
    const fat = dashboardSource.diffs.faturamento ?? buildDiff(0, 0);
    return {
      abs: fat.delta,
      perc: fat.deltaPercent,
      hasComparison: fat.previous > 0,
    };
  }, [dashboardSource]);

  const diffsDisponiveis = !!dashboardSource && dashboardSource.diffsFromPayload !== false;
  const hasComparacaoValor = diffsDisponiveis && !!variacaoValorCards.hasComparison;
  const variacaoValorPercNumber =
    typeof variacaoValorCards.perc === 'number' && Number.isFinite(variacaoValorCards.perc)
      ? variacaoValorCards.perc
      : null;
  const variacaoValorPercStr = !diffsDisponiveis
    ? 'Aguardando dados do período anterior'
    : hasComparacaoValor
      ? variacaoValorPercNumber !== null
        ? `${variacaoValorPercNumber >= 0 ? '+' : ''}${variacaoValorPercNumber.toFixed(1)}%`
        : 'Sem base de comparação'
      : 'Sem base de comparação';

  const resumoAtual = dashboardSource?.periodoAtual;
  const resumoGlobalAtual = dashboardGlobalSource?.periodoAtual;
  const diffs = dashboardSource?.diffs;
  const faturamentoDiff = diffs?.faturamento ?? buildDiff(0, 0);
  const faturamentoDelta = faturamentoDiff.delta;
  const faturamentoDeltaPercent = faturamentoDiff.deltaPercent;
  const pedidosDiff = diffs?.pedidos ?? buildDiff(0, 0);
  const pedidosDelta = pedidosDiff.delta;
  const pedidosDeltaPercent = pedidosDiff.deltaPercent;
  const ticketDiff = diffs?.ticketMedio ?? buildDiff(0, 0);
  const ticketDelta = ticketDiff.delta;
  const ticketDeltaPercent = ticketDiff.deltaPercent;

  const microTrend24h = dashboardSource?.microTrend24h;

  const microTrendChartData = useMemo(() => {
    const currentSeries = microTrend24h?.currentWindow?.seriesPorHora ?? [];
    const previousSeries = microTrend24h?.previousWindow?.seriesPorHora ?? [];
    const length = Math.max(currentSeries.length, previousSeries.length);
    if (!length) return [];
    return Array.from({ length }, (_, idx) => {
      const currentPoint = currentSeries[idx];
      const previousPoint = previousSeries[idx];
      const horaIndex = currentPoint?.horaIndex ?? previousPoint?.horaIndex ?? idx;
      return {
        label: `${horaIndex}h`,
        horaIndex,
        hoje: currentPoint?.faturamento ?? undefined,
        ontem: previousPoint?.faturamento ?? 0,
        quantidade: currentPoint?.pedidos ?? undefined,
        quantidadeOntem: previousPoint?.pedidos ?? 0,
      };
    });
  }, [microTrend24h?.currentWindow?.seriesPorHora, microTrend24h?.previousWindow?.seriesPorHora]);

  const microTrendHasData = useMemo(
    () =>
      microTrendChartData.some(
        (point) =>
          (point.hoje ?? 0) > 0 ||
          (point.ontem ?? 0) > 0 ||
          (point.quantidade ?? 0) > 0 ||
          (point.quantidadeOntem ?? 0) > 0
      ),
    [microTrendChartData]
  );

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

  // Calcula o mês baseado na data final do filtro global
  const resumoMesAtual = useMemo(() => {
    if (!resumoGlobalAtual) return null;

    // Pega a data final do filtro global
    const { fim } = resolverIntervalo();
    const dataFim = new Date(`${fim}T00:00:00`);
    const mesAtual = dataFim.getMonth(); // 0-11
    const anoAtual = dataFim.getFullYear();

    // Filtra vendas por dia do mês específico
    const vendasDoMes = resumoGlobalAtual.vendasPorDia.filter((dia) => {
      const [ano, mes] = dia.data.split('-').map(Number);
      return ano === anoAtual && mes === mesAtual + 1; // mes vem como 1-12 no string
    });

    // Calcula totais do mês
    const totalValor = vendasDoMes.reduce((acc, dia) => acc + dia.totalDia, 0);
    const totalQuantidade = vendasDoMes.reduce((acc, dia) => acc + dia.quantidade, 0);

    // Calcula frete proporcional ao valor do mês vs total global
    const totalGlobal = resumoGlobalAtual.totalValor;
    const totalFrete = totalGlobal > 0
      ? (totalValor / totalGlobal) * resumoGlobalAtual.totalFreteTotal
      : 0;

    // Filtra canais do mês (precisa verificar se há dados por período)
    // Por enquanto, vamos usar os canais globais como aproximação
    const canaisDoMes = dashboardGlobalSource?.canais ?? [];

    return {
      vendasPorDia: vendasDoMes,
      totalValor,
      totalFrete,
      totalQuantidade,
      canais: canaisDoMes,
      dias: vendasDoMes.length,
    };
  }, [resumoGlobalAtual, dashboardGlobalSource, preset, customStart, customEnd]);

  const trendingDias = useMemo(() => {
    if (!resumoMesAtual || !resumoMesAtual.vendasPorDia.length) return [];
    return resumoMesAtual.vendasPorDia.slice(-4).reverse();
  }, [resumoMesAtual]);

  const quickHighlights = useMemo(() => {
    if (!resumoMesAtual) return [];
    const diasMonitorados = resumoMesAtual.dias || 1;
    const mediaDiaria = diasMonitorados > 0 ? resumoMesAtual.totalValor / diasMonitorados : 0;
    const fretePerc = resumoMesAtual.totalValor > 0 ? (resumoMesAtual.totalFrete / resumoMesAtual.totalValor) * 100 : 0;
    const melhorDia = [...resumoMesAtual.vendasPorDia].sort((a, b) => b.totalDia - a.totalDia)[0];
    const melhorCanal = [...resumoMesAtual.canais].sort((a, b) => b.totalValor - a.totalValor)[0];

    return [
      {
        label: 'Média diária',
        value: formatBRL(mediaDiaria),
        helper: `${diasMonitorados} dias monitorados`,
      },
      {
        label: 'Frete total',
        value: formatBRL(resumoMesAtual.totalFrete),
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
  }, [resumoMesAtual]);

  const cancelamentoPerc = resumoAtual?.percentualCancelados ?? 0;
  const totalProdutosVendidos = resumoAtual?.totalProdutosVendidos ?? 0;
  const topProdutos = useMemo(() => {
    // Usa resumoAtual que respeita o filtro de data global do app
    const origem = resumoAtual?.topProdutos ?? [];
    // Simplesmente pega os top 12 sem recalcular (já vem filtrado pelo filtro global)
    return origem.slice(0, 12);
  }, [resumoAtual?.topProdutos]);

  useEffect(() => {
    if (!topProdutos.length) {
      setSelectedProdutoKey(null);
      return;
    }
    setSelectedProdutoKey((prev) => {
      if (prev && topProdutos.some((produto) => buildProdutoKey(produto) === prev)) {
        return prev;
      }
      return buildProdutoKey(topProdutos[0]);
    });
  }, [topProdutos]);

  const produtoEmFoco = useMemo(() => {
    if (!topProdutos.length) return null;
    if (!selectedProdutoKey) return topProdutos[0];
    return topProdutos.find((produto) => buildProdutoKey(produto) === selectedProdutoKey) ?? topProdutos[0];
  }, [selectedProdutoKey, topProdutos]);

  const produtoEmFocoKey = produtoEmFoco ? buildProdutoKey(produtoEmFoco) : null;

  useEffect(() => {
    if (!produtoEmFoco || !produtoEmFoco.zoomLevels?.length) {
      setSelectedZoomLevelKey(null);
      return;
    }
    setSelectedZoomLevelKey((prev) => {
      if (prev && produtoEmFoco.zoomLevels?.some((level) => level.key === prev)) {
        return prev;
      }
      return produtoEmFoco.zoomLevels?.[0]?.key ?? null;
    });
  }, [produtoEmFoco]);

  const zoomLevelsDisponiveis = produtoEmFoco?.zoomLevels ?? EMPTY_ZOOM_LEVELS;
  const zoomLevelAtual = useMemo(() => {
    if (!zoomLevelsDisponiveis.length) return null;
    if (!selectedZoomLevelKey) return zoomLevelsDisponiveis[0];
    return (
      zoomLevelsDisponiveis.find((nivel) => nivel.key === selectedZoomLevelKey) ?? zoomLevelsDisponiveis[0]
    );
  }, [selectedZoomLevelKey, zoomLevelsDisponiveis]);

  const zoomIndexAtual = zoomLevelAtual
    ? zoomLevelsDisponiveis.findIndex((nivel) => nivel.key === zoomLevelAtual.key)
    : zoomLevelsDisponiveis.length ? 0 : -1;
  const podeDarZoomOut = zoomLevelsDisponiveis.length > 1 && zoomIndexAtual > 0;
  const podeDarZoomIn =
    zoomLevelsDisponiveis.length > 1 &&
    zoomIndexAtual >= 0 &&
    zoomIndexAtual < zoomLevelsDisponiveis.length - 1;

  const alterarZoom = useCallback(
    (direcao: 'in' | 'out') => {
      if (!zoomLevelsDisponiveis.length) return;
      const fallbackIndex = Math.max(0, zoomLevelsDisponiveis.findIndex((nivel) => nivel.key === (zoomLevelAtual?.key ?? selectedZoomLevelKey ?? '')));
      const indexAtual = fallbackIndex >= 0 ? fallbackIndex : 0;
      const delta = direcao === 'in' ? 1 : -1;
      const proximoIndex = Math.min(
        Math.max(0, indexAtual + delta),
        zoomLevelsDisponiveis.length - 1
      );
      setSelectedZoomLevelKey(zoomLevelsDisponiveis[proximoIndex]?.key ?? null);
    },
    [zoomLevelAtual?.key, selectedZoomLevelKey, zoomLevelsDisponiveis]
  );

  const handleZoomIn = useCallback(() => alterarZoom('in'), [alterarZoom]);
  const handleZoomOut = useCallback(() => alterarZoom('out'), [alterarZoom]);

  const produtoDisplayDescricao = normalizeProdutoNome(
    zoomLevelAtual?.descricao ?? produtoEmFoco?.descricao ?? 'Produto sem nome'
  );
  const produtoDisplaySku = zoomLevelAtual?.sku ?? produtoEmFoco?.sku ?? null;
  const produtoDisplayQuantidade = zoomLevelAtual?.quantidade ?? produtoEmFoco?.quantidade ?? 0;
  const produtoDisplayReceita = zoomLevelAtual?.receita ?? produtoEmFoco?.receita ?? 0;
  const zoomNivelLabel = zoomLevelAtual ? ZOOM_NIVEL_LABELS[zoomLevelAtual.nivel] ?? 'Nível atual' : 'Resumo';

  // Buscar o produto correspondente no resumoGlobalAtual para ter a série completa (30 dias)
  const produtoGlobalCorrespondente = useMemo(() => {
    if (!produtoEmFoco || !resumoGlobalAtual?.topProdutos) return null;
    return resumoGlobalAtual.topProdutos.find(
      (p) => p.produtoId === produtoEmFoco.produtoId && p.sku === produtoEmFoco.sku
    );
  }, [produtoEmFoco, resumoGlobalAtual?.topProdutos]);

  // Série base para o gráfico (usa dados globais de 30 dias)
  const produtoSerieBaseGrafico = produtoGlobalCorrespondente?.serieDiaria ?? EMPTY_SERIE;

  // Série base para os cards de estatísticas (usa dados do filtro global do app)
  const produtoSerieBase = zoomLevelAtual?.serieDiaria ?? produtoEmFoco?.serieDiaria ?? EMPTY_SERIE;

  // Série filtrada pelo filtro GLOBAL do app (para os cards de estatísticas)
  const produtoSerieGlobal = useMemo(() => {
    if (!produtoSerieBase.length) return [];
    const { inicio, fim } = resolverIntervalo();
    const dataInicio = new Date(`${inicio}T00:00:00`);
    const dataFim = new Date(`${fim}T23:59:59`);

    const filtrada = produtoSerieBase.filter((dia) => {
      const parsed = new Date(`${dia.data}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed >= dataInicio && parsed <= dataFim;
    });
    return filtrada.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }, [produtoSerieBase, preset, customStart, customEnd]);

  // Série filtrada pelo filtro PRÓPRIO do card (para o gráfico)
  const produtoSerieFiltrada = useMemo(() => {
    if (!produtoSerieBaseGrafico.length) return [];
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const cutoff = produtoCardPreset === '30d'
      ? (() => {
          const date = new Date();
          date.setDate(date.getDate() - 29);
          return date;
        })()
      : produtoCardPreset === 'month'
        ? startOfMonth
        : startOfYear;

    const filtrada = produtoSerieBaseGrafico.filter((dia) => {
      const parsed = new Date(`${dia.data}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed >= cutoff;
    });
    return filtrada.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }, [produtoCardPreset, produtoSerieBaseGrafico]);

  const produtoSparkData = useMemo(() => {
    if (!produtoSerieFiltrada.length) return [];
    if (produtoCardPreset === 'year') {
      const porMes = new Map<string, { receita: number; quantidade: number }>();
      for (const dia of produtoSerieFiltrada) {
        const [ano, mes] = dia.data.split('-');
        const key = `${ano}-${mes}`;
        const atual = porMes.get(key) ?? { receita: 0, quantidade: 0 };
        atual.receita += dia.receita;
        atual.quantidade += dia.quantidade;
        porMes.set(key, atual);
      }
      return Array.from(porMes.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, info]) => ({
          label: key.split('-').reverse().join('/'),
          valor: info.receita,
          hoje: info.receita,
          quantidade: info.quantidade,
        }));
    }
    return produtoSerieFiltrada.map((dia, idx) => ({
      label: formatSerieLabel(dia.data),
      horaIndex: idx,
      valor: dia.receita,
      hoje: dia.receita,
      quantidade: dia.quantidade,
    }));
  }, [produtoCardPreset, produtoSerieFiltrada]);

  const produtoMelhorDia = useMemo(() => {
    if (!produtoSerieFiltrada.length) return null;
    return produtoSerieFiltrada.reduce((acc, dia) => {
      if (!acc) return dia;
      return dia.receita > acc.receita ? dia : acc;
    }, produtoSerieFiltrada[0]);
  }, [produtoSerieFiltrada]);

  // Valores baseados no filtro GLOBAL para os cards de estatísticas
  const produtoGlobalQuantidade = useMemo(() => {
    return produtoSerieGlobal.reduce((acc, dia) => acc + dia.quantidade, 0);
  }, [produtoSerieGlobal]);

  const produtoGlobalReceita = useMemo(() => {
    return produtoSerieGlobal.reduce((acc, dia) => acc + dia.receita, 0);
  }, [produtoSerieGlobal]);

  const produtoGlobalMelhorDia = useMemo(() => {
    if (!produtoSerieGlobal.length) return null;
    return produtoSerieGlobal.reduce((acc, dia) => {
      if (!acc) return dia;
      return dia.receita > acc.receita ? dia : acc;
    }, produtoSerieGlobal[0]);
  }, [produtoSerieGlobal]);

  const produtoGlobalTicketMedio = produtoGlobalQuantidade > 0
    ? produtoGlobalReceita / produtoGlobalQuantidade
    : 0;

  const produtoTicketMedio = produtoDisplayQuantidade > 0
    ? produtoDisplayReceita / produtoDisplayQuantidade
    : 0;
  const produtoEstoqueDisponivel = produtoEmFoco?.disponivel ?? produtoEmFoco?.saldo ?? null;
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
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {isRefreshing && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50/80 dark:bg-amber-500/15 px-3 py-1 text-amber-700 dark:text-amber-200">
                    <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                    Atualizando…
                  </span>
                )}
                {lastUpdatedLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/5 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                    Atualizado {lastUpdatedLabel}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 w-full min-w-0 max-w-full md:flex md:flex-nowrap md:justify-end md:overflow-visible">
                <div className="min-w-0 w-full md:w-[220px] md:max-w-[240px] rounded-[18px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-3">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 truncate">Período</p>
                    <MultiSelectDropdown
                      label="Período"
                      showLabel={false}
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
                        showLabel={false}
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
                        showLabel={false}
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
                      {hasComparacaoValor ? (
                        variacaoValorCards.abs >= 0 ? (
                          <>
                            <div className="flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-1 text-emerald-600 shrink-0">
                              <ArrowUpRight className="w-4 h-4" />
                              <span>{variacaoValorPercStr}</span>
                            </div>
                            <span className="text-slate-500 truncate min-w-0">vs período anterior</span>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1 rounded-full bg-rose-100/80 dark:bg-[rgba(255,107,125,0.12)] px-2 py-1 text-rose-500 dark:text-[#ff7b8a] shrink-0">
                              <ArrowDownRight className="w-4 h-4" />
                              <span>{variacaoValorPercStr}</span>
                            </div>
                            <span className="text-slate-500 truncate min-w-0">Precisa de atenção</span>
                          </>
                        )
                      ) : (
                        <>
                          <div className="flex items-center gap-1 rounded-full bg-slate-100/80 dark:bg-slate-800/60 px-2 py-1 text-slate-600 dark:text-slate-300 shrink-0">
                            <Info className="w-4 h-4" />
                            <span>{variacaoValorPercStr}</span>
                          </div>
                          <span className="text-slate-500 truncate min-w-0">Sem base de comparação</span>
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

              <div className="rounded-[28px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Microtrend</p>
                    <p className="text-sm text-slate-500">Últimas 24h vs 24h anteriores</p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {microTrendHasData ? 'Atualizado em tempo real' : 'Sem dados nas últimas 48h'}
                  </span>
                </div>
                {microTrendHasData ? (
                  <MicroTrendChart data={microTrendChartData} formatter={formatTooltipCurrency} />
                ) : (
                  <div className="h-32 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm text-slate-400">
                    Sem dados para hoje e ontem
                  </div>
                )}
              </div>
            </div>


            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickHighlights.length ? (
                quickHighlights.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10 p-3 sm:p-4 flex flex-col gap-0.5"
                  >
                    <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-medium">{item.label}</p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{item.value}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{item.helper}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10 p-4 text-sm text-slate-400 col-span-2 xl:col-span-4">
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

        {isInitialLoading && !dashboardSource && (
          <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-6 text-sm text-slate-500">
            Carregando dados do Tiny…
          </div>
        )}
        {erro && (
          <div className="rounded-[32px] border border-rose-200/70 bg-rose-50/80 p-6 text-sm text-rose-600">
            Erro ao carregar dashboard: {erro}
          </div>
        )}

        {dashboardSource && resumoAtual && (
          <div className="space-y-8">
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 overflow-visible">
              <div
                className="rounded-[28px] glass-panel glass-tint p-5 min-w-0"
                title={diffsDisponiveis ? `vs período anterior: ${formatPercent(faturamentoDeltaPercent)} (${faturamentoDelta >= 0 ? '+' : ''}${formatBRL(Math.abs(faturamentoDelta))})` : 'Aguardando dados do período anterior'}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Faturamento líquido</p>
                  <TrendingUp className="w-5 h-5 text-[#5b21b6] dark:text-[#a78bfa] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-[#5b21b6] dark:text-[#a78bfa] truncate">{formatBRL(resumoAtual.totalValorLiquido)}</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Após frete {formatBRL(resumoAtual.totalFreteTotal)}</p>
              </div>

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0 relative group overflow-visible">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">Faturamento bruto</p>
                  <TrendingUp className="w-5 h-5 text-[#009DA8] dark:text-[#6fe8ff] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-[#009DA8] dark:text-[#6fe8ff] truncate">{formatBRL(resumoAtual.totalValor)}</p>
                <p className="text-xs text-slate-500 mt-2 truncate">Frete incluso {formatBRL(resumoAtual.totalFreteTotal)}</p>

                {/* Tooltip ao hover */}
                {diffsDisponiveis && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs whitespace-nowrap scale-0 group-hover:scale-100 transition-transform duration-200 origin-bottom pointer-events-none z-[9999] shadow-xl">
                    <div className="flex items-center gap-2">
                      <span className={faturamentoDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatPercent(faturamentoDeltaPercent)}
                      </span>
                      <span className="text-slate-300">vs período anterior</span>
                      <span className={faturamentoDelta >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {`${faturamentoDelta >= 0 ? '+' : '-'}`}{formatBRL(Math.abs(faturamentoDelta))}
                      </span>
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800"></div>
                  </div>
                )}
              </div>

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0 relative group overflow-visible">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 truncate">Pedidos</p>
                  <ShoppingCart className="w-5 h-5 text-emerald-500 dark:text-[#33e2a7] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-emerald-500 dark:text-[#33e2a7] truncate" suppressHydrationWarning>
                  {resumoAtual.totalPedidos.toLocaleString('pt-BR')}
                </p>

                {/* Tooltip ao hover */}
                {diffsDisponiveis && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs whitespace-nowrap scale-0 group-hover:scale-100 transition-transform duration-200 origin-bottom pointer-events-none z-[9999] shadow-xl">
                    <div className="flex items-center gap-2">
                      <span className={pedidosDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatPercent(pedidosDeltaPercent)}
                      </span>
                      <span className="text-slate-300">vs período anterior</span>
                      <span className={pedidosDelta >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {pedidosDelta >= 0 ? '+' : ''}{pedidosDelta.toLocaleString('pt-BR')} pedidos
                      </span>
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800"></div>
                  </div>
                )}
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

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0 relative group overflow-visible">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 truncate">Ticket médio</p>
                  <BarChart3 className="w-5 h-5 text-amber-500 dark:text-[#f7b84a] shrink-0" />
                </div>
                <p className="text-3xl font-semibold text-amber-500 dark:text-[#f7b84a] truncate">{formatBRL(resumoAtual.ticketMedio)}</p>

                {/* Tooltip ao hover */}
                {diffsDisponiveis && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs whitespace-nowrap scale-0 group-hover:scale-100 transition-transform duration-200 origin-bottom pointer-events-none z-[9999] shadow-xl">
                    <div className="flex items-center gap-2">
                      <span className={ticketDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatPercent(ticketDeltaPercent)}
                      </span>
                      <span className="text-slate-300">vs período anterior</span>
                      <span className={ticketDelta >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {ticketDelta >= 0 ? '+' : '-'}{formatBRL(Math.abs(ticketDelta))}
                      </span>
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800"></div>
                  </div>
                )}
              </div>

              <div className="rounded-[28px] glass-panel glass-tint p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 truncate">Variação</p>
                  {hasComparacaoValor ? (
                    variacaoValorCards.abs >= 0 ? (
                      <ArrowUpRight className="w-5 h-5 text-emerald-500 dark:text-[#33e2a7] shrink-0" />
                    ) : (
                      <ArrowDownRight className="w-5 h-5 text-rose-500 dark:text-[#ff6b7d] shrink-0" />
                    )
                  ) : (
                    <Info className="w-5 h-5 text-slate-500 dark:text-slate-300 shrink-0" />
                  )}
                </div>
                <p
                  className={`text-3xl font-semibold truncate ${
                    !diffsDisponiveis || !hasComparacaoValor
                      ? 'text-slate-500 dark:text-slate-300'
                      : variacaoValorCards.abs >= 0
                        ? 'text-emerald-500 dark:text-[#33e2a7]'
                        : 'text-rose-500 dark:text-[#ff6b7d]'
                  }`}
                >
                  {!diffsDisponiveis
                    ? 'Aguardando dados do período anterior'
                    : hasComparacaoValor
                      ? variacaoValorPercStr
                      : 'Sem base de comparação'}
                </p>
                <p className="text-xs text-slate-500 mt-2 truncate">
                  Impacto {formatBRL(Math.abs(variacaoValorCards.abs))}
                </p>
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
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Top 12</p>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Produtos mais vendidos</h2>
                    </div>
                    <span className="text-xs text-slate-400">Atual: {topProdutos.length}</span>
                  </div>
                  {topProdutos.length ? (
                    <>
                      {produtoEmFoco && (
                        <div className="space-y-4 mb-6">
                          <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 p-4 sm:p-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex flex-col gap-4 lg:flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-3">
                                    <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Produto em foco</p>
                                    <h3 className="text-2xl font-semibold text-slate-900 dark:text-white leading-snug">
                                      {produtoDisplayDescricao}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                      <span className="font-semibold tracking-[0.3em] uppercase">
                                        {produtoDisplaySku ?? 'Sem SKU'}
                                      </span>
                                      <div className="hidden h-4 w-px bg-slate-200/70 dark:bg-white/10 sm:block" />
                                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 dark:bg-white/10 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
                                          Saldo:
                                          <strong className="text-slate-900 dark:text-white">{produtoEmFoco.saldo ?? '—'}</strong>
                                        </span>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 dark:bg-white/10 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
                                          Reservado:
                                          <strong className="text-slate-900 dark:text-white">{produtoEmFoco.reservado ?? '—'}</strong>
                                        </span>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 dark:bg-white/10 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
                                          Disponível:
                                          <strong className="text-slate-900 dark:text-white">{produtoEstoqueDisponivel ?? '—'}</strong>
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {produtoEmFoco.imagemUrl ? (
                                <div className="relative w-32 h-32 rounded-2xl overflow-hidden border border-white/60 dark:border-white/10 flex-shrink-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={produtoEmFoco.imagemUrl} alt={produtoDisplayDescricao} className="w-full h-full object-cover" />
                                </div>
                              ) : null}
                            </div>
                            <div className="mt-3">
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                                <div className="rounded-xl bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1">Receita</p>
                                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatBRL(produtoGlobalReceita)}</p>
                                </div>
                                <div className="rounded-xl bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1">Unidades</p>
                                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                                    {produtoGlobalQuantidade.toLocaleString('pt-BR')} un
                                  </p>
                                </div>
                                <div className="rounded-xl bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1">Ticket médio</p>
                                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatBRL(produtoGlobalTicketMedio)}</p>
                                </div>
                                <div className="rounded-xl bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1">Melhor dia</p>
                                  {produtoGlobalMelhorDia ? (
                                    <div className="text-slate-700 dark:text-slate-200">
                                      <p className="text-sm font-semibold leading-tight">{formatSerieLabel(produtoGlobalMelhorDia.data)}</p>
                                      <p className="text-[10px] mt-0.5">{formatBRL(produtoGlobalMelhorDia.receita)} · {produtoGlobalMelhorDia.quantidade.toLocaleString('pt-BR')} un</p>
                                    </div>
                                  ) : (
                                    <p className="text-lg font-semibold text-slate-400">—</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-6 rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/5 p-4 sm:p-5 shadow-sm">
                              {produtoSparkData.length ? (
                                <MicroTrendChart data={produtoSparkData} formatter={formatTooltipCurrency} />
                              ) : (
                                <div className="py-8 text-center text-xs text-slate-400">
                                  Sem registros no período selecionado.
                                </div>
                              )}
                              <div className="mt-4 flex flex-wrap justify-end gap-4 text-xs uppercase tracking-wide">
                                {PRODUTO_CARD_PRESETS.map((presetOption) => (
                                  <span
                                    key={presetOption.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setProdutoCardPreset(presetOption.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        setProdutoCardPreset(presetOption.id);
                                      }
                                    }}
                                    className={`cursor-pointer select-none transition ${
                                      produtoCardPreset === presetOption.id
                                        ? 'text-slate-900 dark:text-white font-semibold'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {presetOption.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Desktop / tablet: lista vertical com 5 visíveis e scroll suave */}
                      <div className="hidden md:block">
                        <div className="grid grid-cols-2 gap-4 pr-2">
                          {topProdutos.map((produto, idx) => {
                            const key = buildProdutoKey(produto);
                            const ativo = produtoEmFocoKey ? produtoEmFocoKey === key : idx === 0;
                            const nomeProdutoCard = normalizeProdutoNome(produto.descricao);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setSelectedProdutoKey(key)}
                                aria-pressed={ativo}
                                className={`product-card rounded-3xl p-4 flex gap-4 items-stretch text-left transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009DA8] focus-visible:ring-offset-2 focus-visible:ring-offset-white/70 dark:focus-visible:ring-offset-slate-900/70 ${
                                  ativo
                                    ? 'ring-2 ring-[#009DA8] shadow-xl shadow-[#009DA8]/20'
                                    : 'hover:ring-1 hover:ring-slate-200/80 dark:hover:ring-white/20'
                                }`}
                              >
                                <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden flex-shrink-0 border border-white/60 dark:border-white/10">
                                  {produto.imagemUrl ? (
                                    <>
                                      {/* Tiny envia URLs fora do domínio permitido pelo next/image */}
                                      {/* eslint-disable-next-line @next/next/no-img-element -- Tiny image URLs não estão na allowlist do Next Image ainda */}
                                      <img
                                        src={produto.imagemUrl}
                                          alt={nomeProdutoCard}
                                        className="absolute inset-0 w-full h-full object-cover"
                                      />
                                    </>
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white bg-slate-800/90">
                                        {getInitials(nomeProdutoCard)}
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-base font-semibold text-slate-900 dark:text-white leading-tight truncate">{nomeProdutoCard}</p>
                                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 truncate">{produto.sku ?? 'Sem SKU'}</p>
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
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Mobile: carrossel horizontal com snap */}
                      <div className="relative md:hidden -mx-4 px-4">
                        <div className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-3">
                          {topProdutos.map((produto, idx) => {
                            const key = buildProdutoKey(produto);
                            const ativo = produtoEmFocoKey ? produtoEmFocoKey === key : idx === 0;
                            const nomeProdutoCard = normalizeProdutoNome(produto.descricao);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setSelectedProdutoKey(key)}
                                aria-pressed={ativo}
                                className={`product-card rounded-3xl p-4 flex gap-4 min-w-[86vw] snap-center items-stretch text-left transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009DA8] ${
                                  ativo
                                    ? 'ring-2 ring-[#009DA8] shadow-xl shadow-[#009DA8]/20'
                                    : 'hover:ring-1 hover:ring-slate-200/80 dark:hover:ring-white/20'
                                }`}
                              >
                                <div className="relative w-32 h-32 rounded-2xl overflow-hidden flex-shrink-0 border border-white/60 dark:border-white/10">
                                  {produto.imagemUrl ? (
                                    <>
                                      {/* Tiny envia URLs fora do domínio permitido pelo next/image */}
                                      {/* eslint-disable-next-line @next/next/no-img-element -- Tiny image URLs não estão na allowlist do Next Image ainda */}
                                      <img
                                        src={produto.imagemUrl}
                                          alt={nomeProdutoCard}
                                        className="absolute inset-0 w-full h-full object-cover"
                                      />
                                    </>
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white bg-slate-800/90">
                                        {getInitials(nomeProdutoCard)}
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{nomeProdutoCard}</p>
                                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 truncate">{produto.sku ?? 'Sem SKU'}</p>
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
                              </button>
                            );
                          })}
                        </div>
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
