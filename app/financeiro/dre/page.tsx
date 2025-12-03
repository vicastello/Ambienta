'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppLayout } from '@/components/layout/AppLayout';
import { getErrorMessage } from '@/lib/errors';

type DrePeriod = {
  id: string;
  year: number;
  month: number;
  label: string;
  status: string;
  target_net_margin: number | null;
  reserve_percent: number | null;
};

type DreMetrics = {
  vendas: number;
  reembolsos: number;
  ressarcimentos: number;
  receitaLiquida: number;
  custosVariaveis: number;
  despesasFixas: number;
  despesasOperacionais: number;
  lucroBruto: number;
  lucroLiquido: number;
  margemBruta: number;
  margemContribuicao: number;
  margemLiquida: number;
  targetNetMargin: number | null;
  metaAtingida: boolean | null;
  breakEven: number | null;
  reservePercent: number;
  reserva: number;
  divisao: number;
  saque: {
    nelson: number;
    vitor: number;
    gabriela: number;
  };
};

type DrePeriodSummary = {
  period: DrePeriod;
  metrics: DreMetrics;
};

type DreCategory = {
  id: string;
  code: string;
  name: string;
  group_type: string;
  sign: string;
  is_default: boolean;
  is_editable: boolean;
  order_index: number;
  channel: string | null;
  parent_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DreCategoryValue = {
  category: DreCategory;
  value: {
    amount_auto: number | null;
    amount_manual: number | null;
    final_amount: number;
  } | null;
  amountAuto: number | null;
  amountManual: number | null;
  finalAmount: number;
};

type DreChannelSummary = {
  canal: string;
  totalBruto: number;
  totalFrete: number;
};

type DreDetail = {
  period: DrePeriod;
  categories: DreCategoryValue[];
  metrics: DreMetrics;
  channels: DreChannelSummary[];
};

type GroupKey =
  | 'RECEITA'
  | 'CUSTO_VARIAVEL'
  | 'DESPESA_FIXA'
  | 'DESPESA_OPERACIONAL'
  | 'OUTROS';

const GROUP_LABELS: Record<GroupKey, string> = {
  RECEITA: 'Receita / Operação',
  CUSTO_VARIAVEL: 'Custos Variáveis',
  DESPESA_FIXA: 'Despesas Fixas',
  DESPESA_OPERACIONAL: 'Despesas Operacionais',
  OUTROS: 'Outros',
};

const GROUP_ORDER: GroupKey[] = [
  'RECEITA',
  'CUSTO_VARIAVEL',
  'DESPESA_FIXA',
  'DESPESA_OPERACIONAL',
  'OUTROS',
];

const HELP_TEXTS: Record<string, string> = {
  VENDAS: 'Vendas brutas do Tiny (orders_metrics.total_bruto).',
  FRETES: 'Fretes cobrados/pagos (orders_metrics.total_frete).',
  REEMBOLSOS_DEVOLUCOES: 'Devoluções/Reembolsos (informar valor positivo que será subtraído).',
  RESSARCIMENTO_DEVOLUCOES: 'Valores devolvidos pela plataforma referentes às devoluções.',
  CMV_IMPOSTOS: 'Custo da mercadoria vendida + impostos vinculados.',
  MARKETING_PUBLICIDADE: 'Investimento em anúncios; separar por canal futuramente.',
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const formatPercent = (value: number) =>
  `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const monthName = (month: number) =>
  [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ][month - 1] ?? `${month}`;

export default function DrePage() {
  const now = new Date();
  const [periods, setPeriods] = useState<DrePeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [yearInput, setYearInput] = useState(now.getUTCFullYear());
  const [monthInput, setMonthInput] = useState(now.getUTCMonth() + 1);
  const [valuesDraft, setValuesDraft] = useState<Record<string, number | null>>({});
  const [targetMargin, setTargetMargin] = useState<number | null>(null);
  const [reservePercent, setReservePercent] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({
    RECEITA: false,
    CUSTO_VARIAVEL: false,
    DESPESA_FIXA: false,
    DESPESA_OPERACIONAL: false,
    OUTROS: false,
  });
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: '',
    sign: 'SAIDA',
    group_type: 'OUTROS',
    channel: '',
  });
  const [errorMessage, setErrorMessage] = useState('');

  const vendasDoPeriodo = detail?.metrics.vendas ?? 0;

  const chartData = useMemo(() => {
    const slice = periods.slice(0, 12).reverse();
    return slice.map((item) => ({
      name: `${monthName(item.period.month)}/${item.period.year}`,
      vendas: item.metrics.vendas,
      lucroBruto: item.metrics.lucroBruto,
      lucroLiquido: item.metrics.lucroLiquido,
      margemLiquida: Number((item.metrics.margemLiquida * 100).toFixed(2)),
    }));
  }, [periods]);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/dre/periods', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao buscar períodos');
      setPeriods(data.periods || []);
      if (!selectedPeriodId && data.periods?.length) {
        setSelectedPeriodId(data.periods[0].period.id);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao carregar períodos.');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId]);

  const loadDetail = async (id: string | null) => {
    if (!id) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/dre/periods/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao carregar período');
      setDetail(data);
      setTargetMargin(data.period.target_net_margin ?? null);
      setReservePercent(data.period.reserve_percent ?? 0.1);
      const nextDraft: Record<string, number | null> = {};
      data.categories.forEach((item: DreCategoryValue) => {
        nextDraft[item.category.id] =
          item.amountManual ?? item.amountAuto ?? item.finalAmount ?? 0;
      });
      setValuesDraft(nextDraft);
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao carregar detalhes.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    if (selectedPeriodId) {
      loadDetail(selectedPeriodId);
    }
  }, [selectedPeriodId]);

  const handleCreatePeriod = async () => {
    setCreating(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/dre/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: yearInput,
          month: monthInput,
          target_net_margin: targetMargin,
          reserve_percent: reservePercent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao criar período');
      await loadPeriods();
      setSelectedPeriodId(data.period.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao criar período.');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (status?: 'draft' | 'closed') => {
    if (!detail) return;
    setSaving(true);
      setErrorMessage('');
      try {
        const valuesPayload = Object.entries(valuesDraft).map(([categoryId, amountManual]) => ({
          categoryId,
          amountManual: amountManual === null ? null : amountManual,
        }));

      const res = await fetch(`/api/dre/periods/${detail.period.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status ?? detail.period.status,
          target_net_margin: targetMargin,
          reserve_percent: reservePercent,
          values: valuesPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao salvar DRE');
      setDetail(data);
      await loadPeriods();
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao salvar DRE.');
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestAuto = async () => {
    if (!detail) return;
    setSuggesting(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/dre/periods/${detail.period.id}/suggest-auto`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao sugerir valores');
      setDetail(data);
      const nextDraft: Record<string, number | null> = {};
      data.categories.forEach((item: DreCategoryValue) => {
        nextDraft[item.category.id] =
          item.amountManual ?? item.amountAuto ?? item.finalAmount ?? 0;
      });
      setValuesDraft(nextDraft);
      await loadPeriods();
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao sugerir valores.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleAddCategory = async () => {
    try {
      const res = await fetch('/api/dre/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategory.name,
          sign: newCategory.sign,
          group_type: newCategory.group_type,
          channel: newCategory.channel || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao criar categoria');
      setAddCategoryOpen(false);
      setNewCategory({ name: '', sign: 'SAIDA', group_type: 'OUTROS', channel: '' });
      if (selectedPeriodId) {
        await loadDetail(selectedPeriodId);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao criar categoria.');
    }
  };

  const groupedCategories = useMemo<Record<GroupKey, DreCategoryValue[]>>(() => {
    const base: Record<GroupKey, DreCategoryValue[]> = {
      RECEITA: [],
      CUSTO_VARIAVEL: [],
      DESPESA_FIXA: [],
      DESPESA_OPERACIONAL: [],
      OUTROS: [],
    };
    if (!detail) return base;
    return detail.categories.reduce((acc, item) => {
      const group = (item.category.group_type as GroupKey) || 'OUTROS';
      acc[group].push(item);
      return acc;
    }, base);
  }, [detail]);

  const statusBadge =
    detail?.period.status === 'closed' ? (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 text-emerald-700 px-3 py-1 text-xs font-semibold">
        <CheckCircle className="w-4 h-4" /> Fechado
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 text-amber-700 px-3 py-1 text-xs font-semibold">
        <Sparkles className="w-4 h-4" /> Rascunho
      </span>
    );

  const renderInputRow = (item: DreCategoryValue) => {
    const percent = vendasDoPeriodo > 0 ? (item.finalAmount / vendasDoPeriodo) * 100 : 0;
    const disabled = detail?.period.status === 'closed';
    return (
      <div
        key={item.category.id}
        className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/15 py-3 last:border-0"
      >
        <div className="flex items-start gap-3 flex-1">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {item.category.name}
              </p>
              {HELP_TEXTS[item.category.code] && (
                <span title={HELP_TEXTS[item.category.code]}>
                  <Info className="w-4 h-4 text-slate-400" />
                </span>
              )}
              {item.category.channel && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700">
                  {item.category.channel}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {item.amountAuto !== null
                ? `Sugerido: ${formatCurrency(item.amountAuto)}`
                : 'Sem sugestão automática'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 w-20 text-right">
            {percent ? `${percent.toFixed(1)}%` : '-'}
          </div>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            disabled={disabled}
            className="w-32 rounded-2xl border border-white/40 bg-white/70 dark:bg-white/5 px-3 py-2 text-right text-sm font-semibold text-slate-900 dark:text-white shadow-sm"
            value={valuesDraft[item.category.id] ?? 0}
            onChange={(e) => {
              const value = e.target.value === '' ? null : Number(e.target.value);
              setValuesDraft((prev) => ({ ...prev, [item.category.id]: value }));
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <AppLayout title="DRE">
      <div className="space-y-6">
        <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Financeiro</p>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
                  Demonstração de Resultado (DRE)
                </h1>
                {statusBadge}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                Crie o mês, preencha valores, veja margens, ponto de equilíbrio e saque recomendado.
                A maioria dos campos aceita sugestão automática a partir do Tiny/Supabase.
              </p>
              {errorMessage && (
                <p className="text-sm text-rose-600 font-semibold">{errorMessage}</p>
              )}
              {loading && !errorMessage && (
                <p className="text-xs text-slate-500">Carregando períodos...</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <select
                  className="rounded-2xl bg-white/80 dark:bg-white/5 px-3 py-2 text-sm border border-white/40 shadow-sm"
                  value={monthInput}
                  onChange={(e) => setMonthInput(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {monthName(idx + 1)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="w-24 rounded-2xl bg-white/80 dark:bg-white/5 px-3 py-2 text-sm border border-white/40 shadow-sm"
                  value={yearInput}
                  onChange={(e) => setYearInput(Number(e.target.value))}
                />
                <button
                  onClick={handleCreatePeriod}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30"
                  disabled={creating}
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Criar/abrir mês
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Faturamento"
            value={formatCurrency(detail?.metrics.vendas ?? 0)}
            subtitle="Vendas brutas do mês"
            trendIcon={<ArrowUpRight className="w-4 h-4 text-emerald-500" />}
          />
          <MetricCard
            title="Lucro Líquido"
            value={formatCurrency(detail?.metrics.lucroLiquido ?? 0)}
            subtitle="Após custos e despesas"
            trendIcon={<TrendingUp className="w-4 h-4 text-cyan-500" />}
          />
          <MetricCard
            title="Margem Líquida"
            value={formatPercent(detail?.metrics.margemLiquida ?? 0)}
            subtitle="Lucro líquido / Vendas"
            trendIcon={<ArrowUpRight className="w-4 h-4 text-emerald-500" />}
            alert={
              detail?.metrics.targetNetMargin
                ? detail.metrics.margemLiquida >= detail.metrics.targetNetMargin
                  ? 'Dentro da meta'
                  : 'Abaixo da meta'
                : undefined
            }
          />
          <div className="app-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Meta</p>
              <span title="Meta de margem líquida do mês">
                <Info className="w-4 h-4 text-slate-400" />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                className="w-24 rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2 text-sm font-semibold border border-white/40"
                value={targetMargin ?? ''}
                onChange={(e) => setTargetMargin(e.target.value === '' ? null : Number(e.target.value))}
              />
              <span className="text-sm text-slate-500">Meta de margem (fração)</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                className="w-24 rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2 text-sm font-semibold border border-white/40"
                value={reservePercent ?? ''}
                onChange={(e) =>
                  setReservePercent(e.target.value === '' ? null : Number(e.target.value))
                }
              />
              <span className="text-sm text-slate-500">Reserva (% do lucro líquido)</span>
            </div>
          </div>
        </section>

        <section className="glass-panel glass-tint rounded-[28px] border border-white/50 dark:border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Períodos</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Meses recentes (clique para abrir)
              </h3>
            </div>
            <button
              className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:text-cyan-600"
              onClick={loadPeriods}
            >
              <RefreshCw className="w-4 h-4" /> Atualizar lista
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {periods.map((item) => (
              <button
                key={item.period.id}
                onClick={() => setSelectedPeriodId(item.period.id)}
                className={`min-w-[200px] rounded-2xl border px-4 py-3 text-left transition ${
                  selectedPeriodId === item.period.id
                    ? 'border-cyan-500 bg-white/80 shadow-lg'
                    : 'border-white/40 bg-white/50 dark:bg-white/5'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {item.period.label}
                </p>
                <p className="text-xs text-slate-500">
                  Margem Líquida {formatPercent(item.metrics.margemLiquida)}
                </p>
                <p className="text-xs text-slate-500">
                  Lucro Líquido {formatCurrency(item.metrics.lucroLiquido)}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-panel glass-tint rounded-[28px] border border-white/50 dark:border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Evolução</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Vendas, Lucro e Margens
              </h3>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <RechartTooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="vendas"
                  name="Vendas"
                  stroke="#009DA8"
                  strokeWidth={3}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="lucroBruto"
                  name="Lucro Bruto"
                  stroke="#6366f1"
                  strokeWidth={3}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="lucroLiquido"
                  name="Lucro Líquido"
                  stroke="#22c55e"
                  strokeWidth={3}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="margemLiquida"
                  name="Margem Líquida (%)"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="glass-panel glass-tint rounded-[28px] border border-white/50 dark:border-white/10 p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Lançamentos do mês
              </p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Preencha e ajuste as linhas da DRE
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSuggestAuto}
                disabled={!detail || suggesting}
                className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/50 text-cyan-700 px-3 py-2 text-sm font-semibold bg-white/80 dark:bg-white/5"
              >
                {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Sugerir automático
              </button>
              <button
                onClick={() => handleSave('draft')}
                disabled={!detail || saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Salvar rascunho
              </button>
              <button
                onClick={() => handleSave('closed')}
                disabled={!detail || saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-slate-900/30"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownRight className="w-4 h-4" />}
                Fechar mês
              </button>
            </div>
          </div>

          {GROUP_ORDER.map((group) => {
            const rows = groupedCategories[group] || [];
            if (!rows.length) return null;
            const isCollapsed = collapsed[group];
            return (
              <div
                key={group}
                className="rounded-2xl border border-white/40 bg-white/60 dark:bg-white/5 px-4 py-3"
              >
                <button
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {GROUP_LABELS[group]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {rows.length} linha{rows.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
                {!isCollapsed && <div className="mt-3">{rows.map((row) => renderInputRow(row))}</div>}
              </div>
            );
          })}

          <div className="border-t border-white/30 pt-4 flex flex-col gap-3">
            <button
              onClick={() => setAddCategoryOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700"
            >
              <Plus className="w-4 h-4" /> Adicionar linha
            </button>
            {addCategoryOpen && (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <input
                  className="rounded-xl bg-white/80 dark:bg-white/5 px-3 py-2 text-sm border border-white/40"
                  placeholder="Nome"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, name: e.target.value }))}
                />
                <select
                  className="rounded-xl bg-white/80 dark:bg-white/5 px-3 py-2 text-sm border border-white/40"
                  value={newCategory.sign}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, sign: e.target.value }))}
                >
                  <option value="SAIDA">Saída</option>
                  <option value="ENTRADA">Entrada</option>
                </select>
                <select
                  className="rounded-xl bg-white/80 dark:bg-white/5 px-3 py-2 text-sm border border-white/40"
                  value={newCategory.group_type}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, group_type: e.target.value }))}
                >
                  {GROUP_ORDER.map((group) => (
                    <option key={group} value={group}>
                      {GROUP_LABELS[group]}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl bg-white/80 dark:bg-white/5 px-3 py-2 text-sm border border-white/40"
                  value={newCategory.channel}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, channel: e.target.value }))}
                >
                  <option value="">Nenhum canal</option>
                  <option value="SHOPEE">Shopee</option>
                  <option value="MERCADO_LIVRE">Mercado Livre</option>
                  <option value="MAGALU">Magalu</option>
                </select>
                <div className="md:col-span-2">
                  <button
                    onClick={handleAddCategory}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30"
                  >
                    <Plus className="w-4 h-4" /> Salvar categoria
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="app-card p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Ponto de equilíbrio</p>
            <h4 className="text-2xl font-semibold text-slate-900 dark:text-white mt-2">
              {detail?.metrics.breakEven ? formatCurrency(detail.metrics.breakEven) : '—'}
            </h4>
            <p className="text-xs text-slate-500">
              Faturamento mínimo para cobrir despesas fixas, baseado na margem de contribuição.
            </p>
          </div>

          <div className="app-card p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Saque recomendado</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Reserva</span>
                <strong>{formatCurrency(detail?.metrics.reserva ?? 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Divisão</span>
                <strong>{formatCurrency(detail?.metrics.divisao ?? 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Nelson</span>
                <strong>{formatCurrency(detail?.metrics.saque.nelson ?? 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Vitor</span>
                <strong>{formatCurrency(detail?.metrics.saque.vitor ?? 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Gabriela</span>
                <strong>{formatCurrency(detail?.metrics.saque.gabriela ?? 0)}</strong>
              </div>
            </div>
          </div>

          <div className="app-card p-5 md:col-span-2 lg:col-span-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Resumo rápido</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Receita líquida</span>
                <strong>{formatCurrency(detail?.metrics.receitaLiquida ?? 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Custos variáveis</span>
                <strong>{formatCurrency(detail?.metrics.custosVariaveis ?? 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Despesas fixas</span>
                <strong>{formatCurrency(detail?.metrics.despesasFixas ?? 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Despesas operacionais</span>
                <strong>{formatCurrency(detail?.metrics.despesasOperacionais ?? 0)}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel glass-tint rounded-[28px] border border-white/50 dark:border-white/10 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Divisão por sócio</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Cartões pré-definidos (Vitor, Gabriela, Nelson)
              </h3>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { nome: 'Vitor', valor: detail?.metrics.saque.vitor ?? 0 },
              { nome: 'Gabriela', valor: detail?.metrics.saque.gabriela ?? 0 },
              { nome: 'Nelson', valor: detail?.metrics.saque.nelson ?? 0 },
            ].map((socio) => (
              <div
                key={socio.nome}
                className="rounded-2xl border border-white/40 bg-white/70 dark:bg-white/5 p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{socio.nome}</p>
                  <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Saque</span>
                </div>
                <div className="text-xl font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(socio.valor)}
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Plano de Saúde</span>
                    <span>{formatCurrency(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vales</span>
                    <span>{formatCurrency(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Outros Descontos</span>
                    <span>{formatCurrency(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vale Combustível</span>
                    <span>{formatCurrency(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Outros Créditos</span>
                    <span>{formatCurrency(0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel glass-tint rounded-[28px] border border-white/50 dark:border-white/10 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Canais</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Resumo por marketplace
              </h3>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {(detail?.channels || []).map((channel) => {
              const tarifaRatio =
                channel.totalBruto > 0
                  ? (channel.totalFrete / channel.totalBruto) * 100
                  : 0;
              return (
                <div
                  key={channel.canal}
                  className="rounded-2xl border border-white/30 bg-white/60 dark:bg-white/5 p-4"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {channel.canal}
                  </p>
                  <p className="text-xs text-slate-500">Faturamento {formatCurrency(channel.totalBruto)}</p>
                  <p className="text-xs text-slate-500">
                    Fretes {formatCurrency(channel.totalFrete)} ({tarifaRatio.toFixed(1)}%)
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

type MetricCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  trendIcon?: ReactNode;
  alert?: string;
};

function MetricCard({ title, value, subtitle, trendIcon, alert }: MetricCardProps) {
  return (
    <div className="app-card p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{title}</p>
      <div className="mt-2 flex items-center gap-2">
        <h4 className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</h4>
        {trendIcon}
      </div>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      {alert && <p className="text-xs font-semibold text-amber-600">{alert}</p>}
    </div>
  );
}
