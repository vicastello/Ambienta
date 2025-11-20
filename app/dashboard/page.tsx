'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
};

type CanalResumo = {
  canal: string;
  totalValor: number;
  totalPedidos: number;
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
    0: 'Dados incompletos',
    1: 'Aberta',
    2: 'Aprovada',
    3: 'Preparando envio',
    4: 'Faturada',
    5: 'Pronto envio',
    6: 'Enviada',
    7: 'Entregue',
    8: 'Cancelada',
    9: 'Não entregue',
    [-1]: 'Sem situação',
  };
  return mapa[s] ?? `Situação ${s}`;
}

function isoToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
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

type ChartPreset = 'today' | '7d' | '30d' | 'month' | 'custom';

export default function DashboardPage() {
  const [preset, setPreset] = useState<DatePreset>('7d');
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const [canaisSelecionados, setCanaisSelecionados] = useState<string[]>([]);
  const [situacoesSelecionadas, setSituacoesSelecionadas] = useState<number[]>([]);

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

  // Refs para evitar chamadas simultâneas
  const isLoadingRef = useRef(false);
  const isLoadingChartRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return;
      const saved: SavedFilters = JSON.parse(raw);
      if (saved.preset) setPreset(saved.preset);
      if (saved.customStart) setCustomStart(saved.customStart);
      if (saved.customEnd) setCustomEnd(saved.customEnd);
      if (Array.isArray(saved.canaisSelecionados)) setCanaisSelecionados(saved.canaisSelecionados);
      if (Array.isArray(saved.situacoesSelecionadas)) setSituacoesSelecionadas(saved.situacoesSelecionadas);
    } catch (err) {
      console.error('Erro ao carregar filtros salvos', err);
    }
  }, []);

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

  async function carregarResumo() {
    // Evitar chamadas simultâneas
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      setLoading(true);
      setErro(null);
      const { inicio, fim } = resolverIntervalo();
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      if (canaisSelecionados.length) params.set('canais', canaisSelecionados.join(','));
      if (situacoesSelecionadas.length) params.set('situacoes', situacoesSelecionadas.join(','));
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar resumo do dashboard');
      setResumo(json as DashboardResumo);
      try {
        const { inicio, fim } = resolverIntervalo();
        const diasEsperados = 1 + diffDays(inicio, fim);
        const atualDias = (json as DashboardResumo).periodoAtual.vendasPorDia.length ?? 0;
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
      setResumo(null);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }

  useEffect(() => {
    console.log('[DEBUG] carregarResumo triggered', { preset, customStart, customEnd, canais: canaisSelecionados, situacoes: situacoesSelecionadas });
    carregarResumo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd, canaisSelecionados, situacoesSelecionadas]);

  useEffect(() => {
    fetchLastSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setLoadingChart(true);
      setErroChart(null);
      const { inicio, fim } = resolverIntervaloChart();
      const params = new URLSearchParams();
      params.set('dataInicial', inicio);
      params.set('dataFinal', fim);
      const res = await fetch(`/api/tiny/dashboard/resumo?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.message || 'Erro ao carregar resumo (gráfico)');
      setResumoChart(json as DashboardResumo);
      try {
        const { inicio, fim } = resolverIntervaloChart();
        const diasEsperados = 1 + diffDays(inicio, fim);
        const atualDias = (json as DashboardResumo).periodoAtual.vendasPorDia.length ?? 0;
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
      setResumoChart(null);
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
    return resumo.canais.map((c) => ({ name: c.canal, value: c.totalValor, pedidos: c.totalPedidos }));
  }, [resumo]);

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

  return (
    <AppLayout title="Dashboard Tiny">
      <div className="min-h-screen bg-gradient-to-br from-[var(--bg-body)] via-[var(--bg-body)] to-[var(--bg-soft-alt)]">
        <div className="mx-auto max-w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="space-y-1">
                <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-main)]">Visão Geral</h1>
                <p className="text-sm text-[var(--text-muted)]">Período de {intervaloInicio} até {intervaloFim} ({diasIntervalo} dias)</p>
                {lastSync && (
                  <p className="text-xs text-[var(--text-muted)] mt-1" suppressHydrationWarning>
                    Última sincronização: {formatDateTime(lastSync)}
                  </p>
                )}
              </div>
            </div>

            {/* Filtros */}
            {resumo && (
              <div className="app-card p-4 lg:p-6 space-y-4">
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs sm:text-sm text-[var(--text-muted)] font-medium min-w-fit">Período:</label>
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
                      singleSelect={true}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs sm:text-sm text-[var(--text-muted)] font-medium min-w-fit">Canais:</label>
                    <MultiSelectDropdown
                      label="Canais"
                      options={resumo.canaisDisponiveis.map((canal) => ({ value: canal, label: canal }))}
                      selected={canaisSelecionados}
                      onChange={(values) => setCanaisSelecionados(values as string[])}
                      onClear={() => setCanaisSelecionados([])}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs sm:text-sm text-[var(--text-muted)] font-medium min-w-fit">Situações:</label>
                    <MultiSelectDropdown
                      label="Situações"
                      options={resumo.situacoesDisponiveis.map((sit) => ({ value: sit.codigo, label: sit.descricao }))}
                      selected={situacoesSelecionadas}
                      onChange={(values) => setSituacoesSelecionadas(values as number[])}
                      onClear={() => setSituacoesSelecionadas([])}
                    />
                  </div>
                  {preset === 'custom' && (
                    <div className="flex items-center gap-1 col-span-1 sm:col-span-2 lg:col-span-1">
                      <input
                        type="date"
                        className="app-input flex-1 px-3 py-2 text-xs"
                        value={customStart ?? ''}
                        onChange={(e) => setCustomStart(e.target.value || null)}
                      />
                      <span className="text-xs text-[var(--text-muted)]">a</span>
                      <input
                        type="date"
                        className="app-input flex-1 px-3 py-2 text-xs"
                        value={customEnd ?? ''}
                        onChange={(e) => setCustomEnd(e.target.value || null)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Estados */}
          {loading && <div className="app-card p-6 text-center"><p className="text-sm text-[var(--text-muted)]">Carregando dados do Tiny…</p></div>}
          {erro && <div className="app-card p-6 bg-rose-500/10 border border-rose-500/20"><p className="text-sm text-rose-500">Erro ao carregar dashboard: {erro}</p></div>}

          {/* Conteúdo principal */}
          {!loading && !erro && resumo && resumoAtual && (
            <div className="space-y-6 lg:space-y-8">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                {/* Faturamento Bruto */}
                <div className="sm:col-span-1 lg:col-span-3">
                  <div className="app-card p-4 sm:p-6 h-full bg-gradient-to-br from-[rgba(0,157,168,0.05)] to-[rgba(0,181,195,0.05)]">
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">Faturamento Bruto</p>
                        <p className="text-2xl sm:text-3xl font-bold text-[#009DA8]">{formatBRL(resumoAtual.totalValor)}</p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-2xl bg-[#009DA8]/10"><TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-[#009DA8]" /></div>
                    </div>
                    <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center gap-2">
                      {variacaoValorCards.abs >= 0 ? (
                        <>
                          <ArrowUpRight className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-emerald-500">+{variacaoValorCards.perc.toFixed(1)}%</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="w-4 h-4 text-rose-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-rose-500">{variacaoValorCards.perc.toFixed(1)}%</span>
                        </>
                      )}
                      <span className="text-xs text-[var(--text-muted)]">vs. período anterior</span>
                    </div>
                  </div>
                </div>

                {/* Faturamento Líquido */}
                <div className="sm:col-span-1 lg:col-span-3">
                  <div className="app-card p-4 sm:p-6 h-full bg-gradient-to-br from-[rgba(59,130,246,0.05)] to-[rgba(14,165,233,0.05)]">
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">Faturamento Líquido</p>
                        <p className="text-2xl sm:text-3xl font-bold text-blue-500">{formatBRL(resumoAtual.totalValorLiquido)}</p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-2xl bg-blue-500/10"><BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" /></div>
                    </div>
                    <div className="pt-3 border-t border-[var(--border-subtle)]"><p className="text-xs text-[var(--text-muted)]">Frete: <span className="font-semibold text-[var(--text-main)]">{formatBRL(resumoAtual.totalFreteTotal)}</span></p></div>
                  </div>
                </div>

                {/* Pedidos */}
                <div className="sm:col-span-1 lg:col-span-2">
                  <div className="app-card p-4 sm:p-6 h-full">
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">Pedidos</p>
                        <p className="text-2xl sm:text-3xl font-bold" suppressHydrationWarning>
                          {resumoAtual.totalPedidos.toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-2xl bg-sky-500/10"><ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-sky-500" /></div>
                    </div>
                    <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center gap-2">
                      {resumoAtual.totalPedidos >= resumo.periodoAnteriorCards.totalPedidos ? (
                        <>
                          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-500">+{resumoAtual.totalPedidos - resumo.periodoAnteriorCards.totalPedidos}</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="w-4 h-4 text-rose-500" />
                          <span className="text-xs font-medium text-rose-500">{resumoAtual.totalPedidos - resumo.periodoAnteriorCards.totalPedidos}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ticket Médio */}
                <div className="sm:col-span-1 lg:col-span-2">
                  <div className="app-card p-4 sm:p-6 h-full">
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">Ticket Médio</p>
                        <p className="text-2xl sm:text-3xl font-bold text-sky-400">{formatBRL(resumoAtual.ticketMedio)}</p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-2xl bg-sky-400/10"><BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400" /></div>
                    </div>
                    <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center gap-2 text-xs">
                      {resumoAtual.ticketMedio >= resumo.periodoAnteriorCards.ticketMedio ? (
                        <>
                          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                          <span className="font-medium text-emerald-500">+{formatBRL(resumoAtual.ticketMedio - resumo.periodoAnteriorCards.ticketMedio)}</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="w-4 h-4 text-rose-500" />
                          <span className="font-medium text-rose-500">{formatBRL(resumoAtual.ticketMedio - resumo.periodoAnteriorCards.ticketMedio)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Variação */}
                <div className="sm:col-span-1 lg:col-span-2">
                  <div className={`app-card p-4 sm:p-6 h-full ${variacaoValorCards.abs >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">Variação</p>
                        <p className={`text-2xl sm:text-3xl font-bold ${variacaoValorCards.abs >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{variacaoValorCards.perc.toFixed(1)}%</p>
                      </div>
                      <div className={`p-2 sm:p-3 rounded-2xl ${variacaoValorCards.abs >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                        {variacaoValorCards.abs >= 0 ? <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" /> : <ArrowDownRight className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500" />}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-[var(--border-subtle)]"><p className="text-xs text-[var(--text-muted)]">{formatBRL(Math.abs(variacaoValorCards.abs))}</p></div>
                  </div>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <div className="app-card p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                      <h2 className="text-lg font-semibold text-[var(--text-main)]">Faturamento por dia</h2>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-1 flex-wrap">
                          {[['today', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['month', 'Mês']].map(([key, label]) => (
                            <button key={key} onClick={() => setChartPreset(key as ChartPreset)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${chartPreset === key ? 'bg-[#009DA8] text-white' : 'bg-[var(--bg-card-soft)] text-[var(--text-muted)] hover:bg-[var(--bg-card)]'}`}>{label}</button>
                          ))}
                        </div>
                        <button onClick={handleComplementChart} disabled={complementLoading} className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#009DA8] text-white hover:bg-[#00B5C3] disabled:opacity-60 transition-all">{complementLoading ? '...' : 'Atualizar'}</button>
                      </div>
                    </div>
                    {chartPreset === 'custom' && (
                      <div className="flex items-center gap-2 mb-4 text-xs">
                        <input type="date" className="app-input px-3 py-2 flex-1" value={chartCustomStart ?? ''} onChange={(e) => setChartCustomStart(e.target.value || null)} />
                        <span className="text-[var(--text-muted)]">até</span>
                        <input type="date" className="app-input px-3 py-2 flex-1" value={chartCustomEnd ?? ''} onChange={(e) => setChartCustomEnd(e.target.value || null)} />
                      </div>
                    )}
                    {loadingChart && <p className="text-xs text-[var(--text-muted)] mb-2">Carregando…</p>}
                    {erroChart && <p className="text-xs text-rose-500 mb-2">{erroChart}</p>}
                    {complementMsg && <p className="text-xs text-[var(--text-muted)] mb-2">{complementMsg}</p>}
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorAtual" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={AMBIENTA_PRIMARY} stopOpacity={0.4} />
                              <stop offset="100%" stopColor={AMBIENTA_PRIMARY} stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="colorAnterior" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#64748b" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#64748b" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                          <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={40} />
                          <Tooltip content={<CustomTooltip formatter={formatBRL} />} />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Area type="monotone" dataKey="anterior" name="Período anterior" stroke="#64748b" fill="url(#colorAnterior)" strokeWidth={2} strokeDasharray="4 4" />
                          <Area type="monotone" dataKey="atual" name="Período atual" stroke={AMBIENTA_PRIMARY} fill="url(#colorAtual)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="app-card p-4 sm:p-6 h-full flex flex-col">
                    <h2 className="text-lg font-semibold text-[var(--text-main)] mb-4">Faturamento por canal</h2>
                    {canaisData.length === 0 ? (
                      <div className="flex items-center justify-center flex-1"><p className="text-sm text-[var(--text-muted)]">Nenhum pedido no período.</p></div>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={canaisData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                              {canaisData.map((entry, index) => <Cell key={entry.name} fill={COLORS_PALETTE[index % COLORS_PALETTE.length]} />)}
                            </Pie>
                            <Tooltip content={<CustomPieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tables Section */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="app-card p-4 sm:p-6 flex flex-col">
                    <h2 className="text-lg font-semibold text-[var(--text-main)] mb-4">Vendas por dia</h2>
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-xs">
                        <thead className="app-table-header">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Data</th>
                            <th className="text-right px-3 py-2 font-semibold">Qtde</th>
                            <th className="text-right px-3 py-2 font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resumoAtual.vendasPorDia.map((linha) => (
                            <tr key={linha.data} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-card-soft)]/50 transition-colors">
                              <td className="px-3 py-2">{linha.data}</td>
                              <td className="text-right px-3 py-2">{linha.quantidade}</td>
                              <td className="text-right px-3 py-2 font-medium">{formatBRL(linha.totalDia)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="app-card p-4 sm:p-6 flex flex-col">
                    <h2 className="text-lg font-semibold text-[var(--text-main)] mb-4">Pedidos por situação</h2>
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-xs">
                        <thead className="app-table-header">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Situação</th>
                            <th className="text-right px-3 py-2 font-semibold">Qtde</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resumoAtual.pedidosPorSituacao.map((linha, idx) => (
                            <tr key={idx} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-card-soft)]/50 transition-colors">
                              <td className="px-3 py-2">{labelSituacao(linha.situacao)}</td>
                              <td className="text-right px-3 py-2 font-medium">{linha.quantidade}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-3 pt-3 border-t border-[var(--border-subtle)]">Mapeamento ajustável conforme configuração do Tiny.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
