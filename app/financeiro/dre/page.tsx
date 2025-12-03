'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  CheckCircle,
  Download,
  Equal,
  Info,
  Edit3,
  Loader2,
  Minus,
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
  const [creating, setCreating] = useState(false);
  const [yearInput, setYearInput] = useState(now.getUTCFullYear());
  const [monthInput, setMonthInput] = useState(now.getUTCMonth() + 1);
  const [valuesDraftByPeriod, setValuesDraftByPeriod] = useState<
    Record<string, Record<string, number | null>>
  >({});
  const [periodDetails, setPeriodDetails] = useState<Record<string, DreDetail>>({});
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [targetMargin, setTargetMargin] = useState<number | null>(null);
  const [reserveDraftByPeriod, setReserveDraftByPeriod] = useState<Record<string, number | null>>({});
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const seededBasePeriods = useRef(false);
  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const cardsTrackRef = useRef<HTMLDivElement>(null);
  const isDraggingCards = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);
  const DRAG_SCROLL_FACTOR = 3.5;
  const [draggingCards, setDraggingCards] = useState(false);
  const dragPointerId = useRef<number | null>(null);
  const dragLastX = useRef(0);
  const dragStartTime = useRef(0);

  const snapToNearestCard = (withVelocity = false) => {
    const el = cardsScrollRef.current;
    const track = cardsTrackRef.current;
    if (!el || !track) return;
    const children = Array.from(track.children) as HTMLElement[];
    if (!children.length) return;
    const childWidth = children[0].offsetWidth || el.offsetWidth;
    const viewportCenter = el.scrollLeft + el.offsetWidth / 2;

    const delta = dragLastX.current - dragStartX.current;
    const duration = Math.max(performance.now() - dragStartTime.current, 1);
    const velocity = Math.abs(delta) / duration; // px/ms
    const direction = Math.sign(delta);

    const currentIndex = Math.round(el.scrollLeft / childWidth);
    let targetIndex = currentIndex;

    if (withVelocity) {
      const absDelta = Math.abs(delta);
      if (absDelta > childWidth * 0.4 || velocity > 0.6) {
        targetIndex = currentIndex + direction * 2;
      } else if (absDelta > childWidth * 0.1 || velocity > 0.25) {
        targetIndex = currentIndex + direction * 1;
      }
    } else {
      let minDiff = Number.POSITIVE_INFINITY;
      children.forEach((child, idx) => {
        const center = child.offsetLeft + child.offsetWidth / 2;
        const diff = Math.abs(center - viewportCenter);
        if (diff < minDiff) {
          minDiff = diff;
          targetIndex = idx;
        }
      });
    }

    targetIndex = Math.max(0, Math.min(children.length - 1, targetIndex));
    const targetLeft = children[targetIndex].offsetLeft;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
  };
  const [newCategory, setNewCategory] = useState({
    name: '',
    sign: 'SAIDA',
    group_type: 'OUTROS',
    channel: '',
    destination: 'RECEITA_OPERACAO',
  });
  const [errorMessage, setErrorMessage] = useState('');

  const DESTINATION_OPTIONS = [
    { value: 'RECEITA_OPERACAO', label: 'Receita / Operação', group_type: 'RECEITA' },
    { value: 'DESPESAS', label: 'Despesas', group_type: 'DESPESA_OPERACIONAL' },
    { value: 'VITOR', label: 'Vitor', group_type: 'OUTROS' },
    { value: 'GABRIELA', label: 'Gabriela', group_type: 'OUTROS' },
    { value: 'NELSON', label: 'Nelson', group_type: 'OUTROS' },
  ] as const;

  const chartData = useMemo(() => {
    const base = yearFilter === 'all' ? periods : periods.filter((p) => `${p.period.year}` === yearFilter);
    const sorted = [...base].sort((a, b) => {
      if (a.period.year !== b.period.year) return b.period.year - a.period.year;
      return b.period.month - a.period.month;
    });
    const slice = sorted.slice(0, 12).reverse();
    return slice.map((item) => ({
      name: `${monthName(item.period.month)}/${item.period.year}`,
      vendas: item.metrics.vendas,
      lucroBruto: item.metrics.lucroBruto,
      lucroLiquido: item.metrics.lucroLiquido,
      margemLiquida: Number((item.metrics.margemLiquida * 100).toFixed(2)),
    }));
  }, [periods, yearFilter]);

  const filteredPeriods = useMemo(() => {
    const base = yearFilter === 'all' ? periods : periods.filter((p) => `${p.period.year}` === yearFilter);
    return [...base].sort((a, b) => {
      if (a.period.year !== b.period.year) return b.period.year - a.period.year;
      return b.period.month - a.period.month;
    });
  }, [periods, yearFilter]);

  const ensureBasePeriods = useCallback(async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const prev = new Date(Date.UTC(year, month - 2, 1));
    const prevYear = prev.getUTCFullYear();
    const prevMonth = prev.getUTCMonth() + 1;

    await Promise.all(
      [
        { year, month },
        { year: prevYear, month: prevMonth },
      ].map(({ year: y, month: m }) =>
        fetch('/api/dre/periods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: y, month: m }),
        }).then(() => null)
      )
    );
  }, []);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      if (!seededBasePeriods.current) {
        await ensureBasePeriods();
        seededBasePeriods.current = true;
      }
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
  }, [ensureBasePeriods, selectedPeriodId]);

  const loadDetail = async (id: string | null) => {
    if (!id) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/dre/periods/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao carregar período');
      setDetail(data);
      setPeriodDetails((prev) => ({ ...prev, [id]: data }));
      setTargetMargin(data.period.target_net_margin ?? null);
      setReserveDraftByPeriod((prev) => ({ ...prev, [id]: data.period.reserve_percent ?? 0.1 }));
      const nextDraft: Record<string, number | null> = {};
      data.categories.forEach((item: DreCategoryValue) => {
        nextDraft[item.category.id] = item.amountManual ?? item.amountAuto ?? item.finalAmount ?? 0;
      });
      setValuesDraftByPeriod((prev) => ({ ...prev, [id]: nextDraft }));
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

  useEffect(() => {
    const loadInitialDetails = async () => {
      if (!periods.length) return;
      const ids = periods.map((p) => p.period.id).slice(0, 6); // mostrar até 6 meses
      const missing = ids.filter((id) => !periodDetails[id]);
      if (!missing.length) return;
      const results = await Promise.all(
        missing.map((id) =>
          fetch(`/api/dre/periods/${id}`, { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => ({ id, data }))
            .catch(() => null)
        )
      );
      setPeriodDetails((prev) => {
        const next = { ...prev };
        results.forEach((entry) => {
          if (entry?.id && entry.data?.period) {
            next[entry.id] = entry.data as DreDetail;
            const draft: Record<string, number | null> = {};
            (entry.data as DreDetail).categories.forEach((item: DreCategoryValue) => {
              draft[item.category.id] =
                item.amountManual ?? item.amountAuto ?? item.finalAmount ?? 0;
            });
            setValuesDraftByPeriod((prevDraft) => ({ ...prevDraft, [entry.id!]: draft }));
            setReserveDraftByPeriod((prevReserve) => ({
              ...prevReserve,
              [entry.id!]: (entry.data as DreDetail).period.reserve_percent ?? 0.1,
            }));
          }
        });
        return next;
      });
    };
    void loadInitialDetails();
  }, [periodDetails, periods]);

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
          reserve_percent: 0.1,
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

  const handleDeletePeriod = async (periodId: string) => {
    if (!periodId) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/dre/periods/${periodId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erro ao excluir mês');

      setPeriodDetails((prev) => {
        const next = { ...prev };
        delete next[periodId];
        return next;
      });
      setValuesDraftByPeriod((prev) => {
        const next = { ...prev };
        delete next[periodId];
        return next;
      });

      const remaining = periods.filter((p) => p.period.id !== periodId);
      setPeriods(remaining);
      if (selectedPeriodId === periodId) {
        if (remaining.length) {
          setSelectedPeriodId(remaining[0].period.id);
        } else {
          setSelectedPeriodId(null);
          setDetail(null);
        }
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao excluir mês.');
    } finally {
      setSaving(false);
    }
    await loadPeriods();
  };

  const handleSavePeriod = async (periodId: string, status?: 'draft' | 'closed') => {
    const draft = valuesDraftByPeriod[periodId];
    if (!draft) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const valuesPayload = Object.entries(draft).map(([categoryId, amountManual]) => ({
        categoryId,
        amountManual: amountManual === null ? null : amountManual,
      }));
      const reservePercent = reserveDraftByPeriod[periodId] ?? 0.1;
      const res = await fetch(`/api/dre/periods/${periodId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          reserve_percent: reservePercent,
          values: valuesPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao salvar DRE');
      setPeriodDetails((prev) => ({ ...prev, [periodId]: data }));
      if (selectedPeriodId === periodId) {
        setDetail(data);
        setTargetMargin(data.period.target_net_margin ?? null);
        setReserveDraftByPeriod((prev) => ({ ...prev, [periodId]: data.period.reserve_percent ?? 0.1 }));
      }
      setValuesDraftByPeriod((prev) => ({
        ...prev,
        [periodId]: data.categories.reduce((acc: Record<string, number | null>, item: DreCategoryValue) => {
          acc[item.category.id] = item.amountManual ?? item.amountAuto ?? item.finalAmount ?? 0;
          return acc;
        }, {}),
      }));
      await loadPeriods();
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao salvar DRE.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    try {
      const dest = DESTINATION_OPTIONS.find((opt) => opt.value === newCategory.destination);
      if (!dest) {
        setErrorMessage('Selecione onde a linha deve aparecer.');
        return;
      }
      const res = await fetch('/api/dre/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategory.name,
          sign: newCategory.sign,
          group_type: dest.group_type,
          channel: newCategory.channel || null,
          parent_code: dest.value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao criar categoria');
      setAddCategoryOpen(false);
      setNewCategory({
        name: '',
        sign: 'SAIDA',
        group_type: 'OUTROS',
        channel: '',
        destination: 'RECEITA_OPERACAO',
      });
      if (selectedPeriodId) {
        await loadDetail(selectedPeriodId);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error) || 'Falha ao criar categoria.');
    }
  };

  const beginCardDrag = (clientX: number, pointerId?: number) => {
    const el = cardsScrollRef.current;
    if (!el) return;
    isDraggingCards.current = true;
    dragStartX.current = clientX;
    dragStartScroll.current = el.scrollLeft;
    el.classList.add('cursor-grabbing');
    if (pointerId !== undefined) {
      dragPointerId.current = pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
    setDraggingCards(true);
  };

  const moveCardDrag = (clientX: number) => {
    const el = cardsScrollRef.current;
    if (!el || !isDraggingCards.current) return;
    const walk = clientX - dragStartX.current;
    dragLastX.current = clientX;
    el.scrollLeft = dragStartScroll.current - walk * DRAG_SCROLL_FACTOR;
  };

  const endCardDrag = () => {
    const el = cardsScrollRef.current;
    if (!el) return;
    isDraggingCards.current = false;
    el.classList.remove('cursor-grabbing');
    if (dragPointerId.current !== null) {
      try {
        el.releasePointerCapture(dragPointerId.current);
      } catch {
        // ignore
      }
    }
    dragPointerId.current = null;
    setDraggingCards(false);
  };

  const handleCardsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, button')) return;
    beginCardDrag(e.clientX, e.pointerId);
    dragLastX.current = e.clientX;
    dragStartTime.current = performance.now();
    e.preventDefault();
  };

  const handleCardsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCards.current) return;
    moveCardDrag(e.clientX);
    e.preventDefault();
  };

  const handleCardsPointerUp = () => {
    endCardDrag();
    snapToNearestCard(true);
  };

  const handleCardsMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, button')) return;
    beginCardDrag(e.clientX);
    dragLastX.current = e.clientX;
    dragStartTime.current = performance.now();
    e.preventDefault();
  };

  useEffect(() => {
    if (!draggingCards) return;
    const handleMovePointer = (e: PointerEvent) => {
      if (!isDraggingCards.current) return;
      moveCardDrag(e.clientX);
    };
    const handleMoveMouse = (e: MouseEvent) => {
      if (!isDraggingCards.current) return;
      moveCardDrag(e.clientX);
    };
    const handleUp = () => {
      endCardDrag();
      snapToNearestCard(true);
    };
    window.addEventListener('pointermove', handleMovePointer);
    window.addEventListener('mousemove', handleMoveMouse);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMovePointer);
      window.removeEventListener('mousemove', handleMoveMouse);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingCards]);

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
                  className="app-input w-28"
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
                  className="app-input w-28"
                  value={yearInput}
                  onChange={(e) => setYearInput(Number(e.target.value))}
                />
                <button
                  onClick={handleCreatePeriod}
                  className="app-btn-primary inline-flex items-center gap-2"
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
              className="app-input w-24 text-right font-semibold"
                value={targetMargin ?? ''}
                onChange={(e) => setTargetMargin(e.target.value === '' ? null : Number(e.target.value))}
              />
              <span className="text-sm text-slate-500">Meta de margem (fração)</span>
            </div>
            <p className="text-xs text-slate-500">Reserva por mês é editada dentro de cada cartão.</p>
          </div>
        </section>

        <section className="glass-panel glass-tint rounded-[28px] border border-white/50 dark:border-white/10 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Cartões mensais</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Resumo completo por mês (linhas fixas)
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <select
                className="app-input w-auto px-3 py-2"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
              >
                <option value="all">Todos os anos</option>
                {Array.from(new Set(periods.map((p) => p.period.year))).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button className="app-btn-ghost inline-flex items-center gap-2" onClick={loadPeriods}>
                <RefreshCw className="w-4 h-4" /> Atualizar
              </button>
            </div>
          </div>
          {!filteredPeriods.length ? (
            <div className="rounded-2xl border border-dashed border-white/40 bg-white/50 dark:bg-white/5 p-6 text-sm text-slate-600 dark:text-slate-300">
              Nenhum período carregado ainda. Crie/abra um mês acima para ver os cartões (Vendas,
              CMV, tarifas, fretes, despesas e saques por sócio) lado a lado.
            </div>
          ) : (
            <div
              className={`overflow-x-auto pb-4 -mx-2 cursor-grab active:cursor-grabbing select-none touch-pan-y ${
                draggingCards ? 'snap-none' : 'snap-x snap-mandatory'
              }`}
              ref={cardsScrollRef}
              onPointerDown={handleCardsPointerDown}
              onPointerUp={handleCardsPointerUp}
              onPointerLeave={handleCardsPointerUp}
              onPointerMove={handleCardsPointerMove}
              onMouseDown={handleCardsMouseDown}
            >
              <div ref={cardsTrackRef} className="flex">
                {filteredPeriods.map((p) => {
                  const detailData = periodDetails[p.period.id];
                  const draftData = valuesDraftByPeriod[p.period.id] || {};
                  return (
                    <div
                      key={p.period.id}
                      className="snap-start flex-none w-full md:w-1/2 px-2"
                    >
                      {detailData ? (
                        <MonthlyDreCard
                          detail={detailData}
                          draft={draftData}
                          reservePercent={
                            reserveDraftByPeriod[p.period.id] ??
                            detailData.period.reserve_percent ??
                            0.1
                          }
                          onChangeValue={(categoryId, value) =>
                            setValuesDraftByPeriod((prev) => ({
                              ...prev,
                              [p.period.id]: { ...(prev[p.period.id] || {}), [categoryId]: value },
                            }))
                          }
                          onSave={(status) => handleSavePeriod(p.period.id, status)}
                          onDelete={() => handleDeletePeriod(p.period.id)}
                          onChangeReserve={(value) => {
                            setReserveDraftByPeriod((prev) => ({ ...prev, [p.period.id]: value }));
                          }}
                          saving={saving}
                        />
                      ) : (
                        <MonthlyDreCardPlaceholder label={p.period.label} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="glass-panel glass-tint rounded-[28px] border border-white/50 dark:border-white/10 p-6 space-y-4">
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
                  className="app-input w-full"
                  placeholder="Nome"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, name: e.target.value }))}
                />
                <select
                  className="app-input w-full"
                  value={newCategory.sign}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, sign: e.target.value }))}
                >
                  <option value="SAIDA">Saída</option>
                  <option value="ENTRADA">Entrada</option>
                </select>
                <select
                  className="app-input w-full"
                  value={newCategory.destination}
                  onChange={(e) => {
                    const value = e.target.value;
                    const dest = DESTINATION_OPTIONS.find((opt) => opt.value === value);
                    setNewCategory((prev) => ({
                      ...prev,
                      destination: value,
                      group_type: dest?.group_type ?? prev.group_type,
                    }));
                  }}
                >
                  {DESTINATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  className="app-input w-full"
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

type MonthlyDreCardProps = {
  detail: DreDetail;
  draft: Record<string, number | null>;
  onChangeValue: (categoryId: string, value: number | null) => void;
  onSave: (status?: 'draft' | 'closed') => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  reservePercent: number | null;
  onChangeReserve: (value: number | null) => void;
  saving: boolean;
};

function MonthlyDreCard({
  detail,
  draft,
  onChangeValue,
  onSave,
  onDelete,
  reservePercent,
  onChangeReserve,
  saving,
}: MonthlyDreCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleExport = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        filter: (node) => {
          if (node instanceof HTMLElement) {
            return node.dataset.ignoreExport !== 'true';
          }
          return true;
        },
      });
      const link = document.createElement('a');
      link.download = `dre-${detail.period.label.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Erro ao exportar PNG', error);
    } finally {
      setExporting(false);
    }
  };
  const codeToId = useMemo(() => {
    const map: Record<string, string> = {};
    detail.categories.forEach((c) => {
      map[c.category.code] = c.category.id;
    });
    return map;
  }, [detail.categories]);

  const defaultCodes = useMemo(
    () =>
      new Set<string>([
        'VENDAS',
        'REEMBOLSOS_DEVOLUCOES',
        'RESSARCIMENTO_DEVOLUCOES',
        'CMV_IMPOSTOS',
        'TARIFAS_SHOPEE',
        'TARIFAS_MERCADO_LIVRE',
        'TARIFAS_MAGALU',
        'COOP_FRETES_MAGALU',
        'FRETES',
        'CONTADOR',
        'OUTROS_CUSTOS',
        'DESPESAS_OPERACIONAIS',
        'SISTEMA_ERP',
        'INTERNET',
        'IA',
        'MARKETING_PUBLICIDADE',
        'MATERIAIS_EMBALAGEM',
        'COMBUSTIVEIS',
        'PLANO_SAUDE_VITOR',
        'VALES_VITOR',
        'OUTROS_DESCONTOS_VITOR',
        'VALE_COMBUSTIVEL_VITOR',
        'OUTROS_CREDITOS_VITOR',
        'PLANO_SAUDE_GABRIELA',
        'VALES_GABRIELA',
        'OUTROS_DESCONTOS_GABRIELA',
        'VALE_COMBUSTIVEL_GABRIELA',
        'OUTROS_CREDITOS_GABRIELA',
        'PLANO_SAUDE_NELSON',
        'VALES_NELSON',
        'OUTROS_DESCONTOS_NELSON',
        'VALE_COMBUSTIVEL_NELSON',
        'OUTROS_CREDITOS_NELSON',
      ]),
    []
  );

  const getAmount = (code: string) => {
    const catId = codeToId[code];
    if (!catId) return 0;
    const fromDraft = draft[catId];
    if (fromDraft !== undefined && fromDraft !== null) return Number(fromDraft) || 0;
    const cat = detail.categories.find((c) => c.category.id === catId);
    return cat ? cat.finalAmount : 0;
  };

  const vendas = getAmount('VENDAS');
  const percent = (value: number) => (vendas > 0 ? (value / vendas) * 100 : 0);

  const receitaRows = [
    { code: 'VENDAS', label: 'Vendas' },
    { code: 'REEMBOLSOS_DEVOLUCOES', label: '(-) Reembolsos/Devoluções' },
    { code: 'RESSARCIMENTO_DEVOLUCOES', label: '(+) Ressarcimento de Devoluções' },
    { code: 'CMV_IMPOSTOS', label: '(-) CMV + Impostos' },
    { code: 'TARIFAS_SHOPEE', label: '(-) Tarifas Shopee' },
    { code: 'TARIFAS_MERCADO_LIVRE', label: '(-) Tarifas Mercado Livre' },
    { code: 'TARIFAS_MAGALU', label: '(-) Tarifas Magalu' },
    { code: 'COOP_FRETES_MAGALU', label: '(-) Coop. Fretes Magalu' },
    { code: 'FRETES', label: '(-) Fretes' },
    { code: 'CONTADOR', label: '(-) Contador' },
    { code: 'OUTROS_CUSTOS', label: '(-) Outros Custos' },
  ];

  const despesasRows = [
    { code: 'DESPESAS_OPERACIONAIS', label: '(-) Despesas Operacionais' },
    { code: 'SISTEMA_ERP', label: '(-) Sistema ERP' },
    { code: 'INTERNET', label: '(-) Internet' },
    { code: 'IA', label: '(-) IA' },
    { code: 'MARKETING_PUBLICIDADE', label: '(-) Marketing e Publicidade (Anúncios)' },
    { code: 'MATERIAIS_EMBALAGEM', label: '(-) Materiais de Embalagem' },
    { code: 'COMBUSTIVEIS', label: '(-) Combustíveis' },
  ];
  const customRows = detail.categories.filter((c) => !defaultCodes.has(c.category.code));
  const customReceitaRows = customRows.filter((c) => c.category.parent_code === 'RECEITA_OPERACAO');
  const customDespesasRows = customRows.filter((c) => c.category.parent_code === 'DESPESAS');
  const customVitorRows = customRows.filter((c) => c.category.parent_code === 'VITOR');
  const customGabRows = customRows.filter((c) => c.category.parent_code === 'GABRIELA');
  const customNelsonRows = customRows.filter((c) => c.category.parent_code === 'NELSON');

  const receitaLiquida =
    getAmount('VENDAS') - getAmount('REEMBOLSOS_DEVOLUCOES') + getAmount('RESSARCIMENTO_DEVOLUCOES');
  const custosVariaveis =
    getAmount('CMV_IMPOSTOS') +
    getAmount('TARIFAS_SHOPEE') +
    getAmount('TARIFAS_MERCADO_LIVRE') +
    getAmount('TARIFAS_MAGALU') +
    getAmount('COOP_FRETES_MAGALU') +
    getAmount('FRETES');
  const despesasFixas = getAmount('CONTADOR') + getAmount('OUTROS_CUSTOS');
  const despesasOperacionais = despesasRows.reduce((acc, row) => acc + getAmount(row.code), 0);
  const lucroBruto = receitaLiquida - custosVariaveis - despesasFixas;
  const lucroLiquido = lucroBruto - despesasOperacionais;

  const reservaPercent = reservePercent ?? 0.1;
  const reserva = Math.max(0, lucroLiquido * reservaPercent);
  const divisao = lucroLiquido - reserva;
  const nelsonBase = 2000;
  const restante = Math.max(divisao - nelsonBase, 0);
  const vitorBase = restante * 0.5;
  const gabBase = restante * 0.5;

  const vitorTotal =
    vitorBase -
    getAmount('PLANO_SAUDE_VITOR') -
    getAmount('VALES_VITOR') -
    getAmount('OUTROS_DESCONTOS_VITOR') +
    getAmount('VALE_COMBUSTIVEL_VITOR') +
    getAmount('OUTROS_CREDITOS_VITOR');

  const gabTotal =
    gabBase -
    getAmount('PLANO_SAUDE_GABRIELA') -
    getAmount('VALES_GABRIELA') -
    getAmount('OUTROS_DESCONTOS_GABRIELA') +
    getAmount('VALE_COMBUSTIVEL_GABRIELA') +
    getAmount('OUTROS_CREDITOS_GABRIELA');

  const nelsonTotal =
    nelsonBase -
    getAmount('PLANO_SAUDE_NELSON') -
    getAmount('VALES_NELSON') -
    getAmount('OUTROS_DESCONTOS_NELSON') +
    getAmount('VALE_COMBUSTIVEL_NELSON') +
    getAmount('OUTROS_CREDITOS_NELSON');

  const valorParaSaque = vitorTotal + gabTotal + nelsonTotal;

  const innerCardClass =
    'rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4 space-y-3';

  const renderLabelWithIcon = (raw: string) => {
    let icon: 'plus' | 'minus' | 'equal' | null = null;
    let text = raw;
    if (raw.startsWith('(-)')) {
      icon = 'minus';
      text = raw.replace('(-)', '').trim();
    } else if (raw.startsWith('(+)')) {
      icon = 'plus';
      text = raw.replace('(+)','').trim();
    } else if (raw.startsWith('(=)')) {
      icon = 'equal';
      text = raw.replace('(=)','').trim();
    }

    return (
      <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200 leading-none">
        {icon === 'plus' ? (
          <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
        ) : icon === 'minus' ? (
          <Minus className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" strokeWidth={2} />
        ) : icon === 'equal' ? (
          <Equal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" strokeWidth={2} />
        ) : null}
        <span className="leading-tight">{text}</span>
      </span>
    );
  };

  const editableRow = (code: string, label: string, showPercent = true) => {
    const amount = getAmount(code);
    return (
      <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-white/10 py-1 text-sm last:border-b-0">
        <div className="flex-1 text-slate-700 dark:text-slate-200">{renderLabelWithIcon(label)}</div>
        {editing ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">R$</span>
            <input
              type="number"
              step="0.01"
              className="app-input w-[120px] text-right font-semibold"
              value={Number.isFinite(amount) ? amount : 0}
              onChange={(e) => {
                const value = e.target.value === '' ? null : Number(e.target.value);
                const catId = codeToId[code];
                if (!catId) return;
                onChangeValue(catId, value);
              }}
            />
          </div>
        ) : (
          <div className="w-[140px] text-right font-semibold text-slate-700 dark:text-slate-200">
            {formatCurrency(amount)}
          </div>
        )}
        <div className="w-16 text-right text-xs text-slate-500">
          {showPercent ? `${percent(amount).toFixed(2)}%` : '—'}
        </div>
      </div>
    );
  };

  const computedRow = (label: string, amount: number) => (
    <div className="grid grid-cols-12 items-center rounded-lg px-2 py-2 text-sm font-semibold text-slate-900 dark:text-white bg-white/60 dark:bg-white/5">
      <div className="col-span-7">{renderLabelWithIcon(label)}</div>
      <div className="col-span-5 text-right">{formatCurrency(amount)}</div>
    </div>
  );

  return (
    <div
      ref={cardRef}
      className="rounded-2xl border border-white/40 bg-white/70 dark:bg-white/5 p-5 space-y-2 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Mês</p>
          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{detail.period.label}</h4>
        </div>
        <div className="flex gap-2" data-ignore-export="true">
          <button
            className="app-btn-ghost inline-flex items-center justify-center h-9 w-9 p-0 text-xs text-rose-600"
            onClick={async () => {
              const confirmDelete = window.confirm('Excluir este mês? Esta ação não pode ser desfeita.');
              if (!confirmDelete) return;
              await onDelete();
            }}
            disabled={saving}
            title="Excluir mês"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            className="app-btn-ghost inline-flex items-center justify-center h-9 w-9 p-0 text-xs"
            onClick={handleExport}
            disabled={exporting}
            title="Exportar PNG"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
          <button
            className="app-btn-ghost inline-flex items-center justify-center h-9 w-9 p-0 text-xs"
            onClick={() => setEditing(true)}
            disabled={editing}
            title="Editar"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            className="app-btn-primary inline-flex items-center justify-center h-9 w-9 p-0 text-xs"
            onClick={async () => {
              await onSave('draft');
              setEditing(false);
            }}
            disabled={saving}
            title="Salvar"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className={innerCardClass}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Receita / Operação</div>
        <div className="divide-y divide-slate-200/60 dark:divide-white/10">
          {receitaRows.map((row) => (
            <div key={row.code}>{editableRow(row.code, row.label, true)}</div>
          ))}
          {customReceitaRows.map((row) => (
            <div key={row.category.id}>
              {editableRow(
                row.category.code,
                `${row.category.sign === 'ENTRADA' ? '(+)' : '(-)'} ${row.category.name}`,
                true
              )}
            </div>
          ))}
        </div>
        {computedRow('Lucro Bruto', lucroBruto)}
      </div>

      <div className={innerCardClass}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Despesas</div>
        <div className="divide-y divide-slate-200/60 dark:divide-white/10">
          {despesasRows.map((row) => (
            <div key={row.code}>{editableRow(row.code, row.label, true)}</div>
          ))}
          {customDespesasRows.map((row) => (
            <div key={row.category.id}>
              {editableRow(
                row.category.code,
                `${row.category.sign === 'ENTRADA' ? '(+)' : '(-)'} ${row.category.name}`,
                true
              )}
            </div>
          ))}
        </div>
        {computedRow('Lucro Líquido', lucroLiquido)}
      </div>

      <div className={innerCardClass}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Reserva</div>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              className="app-input w-24 text-right"
              value={reservaPercent}
              onChange={(e) => onChangeReserve(e.target.value === '' ? null : Number(e.target.value))}
            />
            <span className="text-sm text-slate-500">Fração (ex: 0.10 = 10%)</span>
          </div>
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Reserva {formatPercent(reservaPercent)}
          </p>
        )}
        {computedRow('Reserva', reserva)}
      </div>

      <div className={innerCardClass}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Divisão</div>
        {computedRow('Divisão', divisao)}
      </div>

      <div className={innerCardClass}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Vitor</div>
        <div className="divide-y divide-slate-200/60 dark:divide-white/10">
          {editableRow('PLANO_SAUDE_VITOR', '(-) Plano de Saúde', false)}
          {editableRow('VALES_VITOR', '(-) Vales', false)}
          {editableRow('OUTROS_DESCONTOS_VITOR', '(-) Outros Descontos', false)}
          {editableRow('VALE_COMBUSTIVEL_VITOR', '(+) Vale Combustível', false)}
          {editableRow('OUTROS_CREDITOS_VITOR', '(+) Outros Créditos', false)}
          {customVitorRows.map((row) => (
            <div key={row.category.id}>
              {editableRow(
                row.category.code,
                `${row.category.sign === 'ENTRADA' ? '(+)' : '(-)'} ${row.category.name}`,
                false
              )}
            </div>
          ))}
        </div>
        {computedRow('(=) Total Vitor', vitorTotal)}
      </div>

      <div className={innerCardClass}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Gabriela</div>
        <div className="divide-y divide-slate-200/60 dark:divide-white/10">
          {editableRow('PLANO_SAUDE_GABRIELA', '(-) Plano de Saúde', false)}
          {editableRow('VALES_GABRIELA', '(-) Vales', false)}
          {editableRow('OUTROS_DESCONTOS_GABRIELA', '(-) Outros Descontos', false)}
          {editableRow('VALE_COMBUSTIVEL_GABRIELA', '(+) Vale Combustível', false)}
          {editableRow('OUTROS_CREDITOS_GABRIELA', '(+) Outros Créditos', false)}
          {customGabRows.map((row) => (
            <div key={row.category.id}>
              {editableRow(
                row.category.code,
                `${row.category.sign === 'ENTRADA' ? '(+)' : '(-)'} ${row.category.name}`,
                false
              )}
            </div>
          ))}
        </div>
        {computedRow('(=) Total Gabriela', gabTotal)}
      </div>

      <div className={innerCardClass}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Nelson</div>
        <div className="divide-y divide-slate-200/60 dark:divide-white/10">
          {editableRow('PLANO_SAUDE_NELSON', '(-) Plano de Saúde', false)}
          {editableRow('VALES_NELSON', '(-) Vales', false)}
          {editableRow('OUTROS_DESCONTOS_NELSON', '(-) Outros Descontos', false)}
          {editableRow('VALE_COMBUSTIVEL_NELSON', '(+) Vale Combustível', false)}
          {editableRow('OUTROS_CREDITOS_NELSON', '(+) Outros Créditos', false)}
          {customNelsonRows.map((row) => (
            <div key={row.category.id}>
              {editableRow(
                row.category.code,
                `${row.category.sign === 'ENTRADA' ? '(+)' : '(-)'} ${row.category.name}`,
                false
              )}
            </div>
          ))}
        </div>
        {computedRow('(=) Total Nelson', nelsonTotal)}
      </div>

      <div className={innerCardClass}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Valor para Saque</div>
        {computedRow('Valor para Saque', valorParaSaque)}
      </div>
    </div>
  );
}
function MonthlyDreCardPlaceholder({ label }: { label: string }) {
  const placeholderRows = [
    'Vendas',
    '(-) Reembolsos/Devoluções',
    '(+) Ressarcimento de Devoluções',
    '(-) Custo de Mercadoria Vendida (CMV) + Impostos',
    '(-) Tarifas Shopee',
    '(-) Tarifas Mercado Livre',
    '(-) Tarifas Magalu',
    '(-) Cooparticipação Fretes Magalu',
    '(-) Fretes',
    '(-) Contador',
    '(-) Outros Custos',
    'Lucro Bruto',
    '(-) Despesas Operacionais',
    '(-) Sistema ERP',
    '(-) Internet',
    '(-) IA',
    '(-) Marketing e Publicidade (Anúncios)',
    '(-) Materiais de Embalagem',
    '(-) Combustíveis',
    'Lucro Líquido',
    'Reserva',
    'Divisão',
    'Vitor: Plano de Saúde',
    'Vitor: Vales',
    'Vitor: Outros Descontos',
    'Vitor: Vale Combustível',
    'Vitor: Outros Créditos',
    'Vitor: Total',
    'Gabriela: Plano de Saúde',
    'Gabriela: Vales',
    'Gabriela: Outros Descontos',
    'Gabriela: Vale Combustível',
    'Gabriela: Outros Créditos',
    'Gabriela: Total',
    'Nelson: Plano de Saúde',
    'Nelson: Vales',
    'Nelson: Outros Descontos',
    'Nelson: Vale Combustível',
    'Nelson: Outros Créditos',
    'Nelson: Total',
    'Valor para Saque',
  ];

  return (
    <div className="rounded-2xl border border-white/30 bg-white/60 dark:bg-white/5 p-5 space-y-2 text-sm text-slate-500 dark:text-slate-300">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Mês</p>
          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{label}</h4>
        </div>
        <div className="text-xs rounded-full bg-white/60 px-3 py-1 border border-white/40">
          Carregando detalhes...
        </div>
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 divide-y divide-white/30">
        {placeholderRows.map((row) => (
          <div key={row} className="flex items-center justify-between py-2 px-3">
            <span>{row}</span>
            <span className="text-slate-400">—</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 px-3 py-2 flex justify-between font-semibold text-slate-700 dark:text-white">
        <span>Lucro Bruto</span>
        <span>—</span>
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 px-3 py-2 flex justify-between font-semibold text-slate-700 dark:text-white">
        <span>Lucro Líquido</span>
        <span>—</span>
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 px-3 py-2 flex justify-between font-semibold text-slate-700 dark:text-white">
        <span>Reserva</span>
        <span>—</span>
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 px-3 py-2 flex justify-between font-semibold text-slate-700 dark:text-white">
        <span>Divisão</span>
        <span>—</span>
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 px-3 py-2 flex justify-between font-semibold text-slate-700 dark:text-white">
        <span>Vitor (total)</span>
        <span>—</span>
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 px-3 py-2 flex justify-between font-semibold text-slate-700 dark:text-white">
        <span>Gabriela (total)</span>
        <span>—</span>
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 px-3 py-2 flex justify-between font-semibold text-slate-700 dark:text-white">
        <span>Nelson (total)</span>
        <span>—</span>
      </div>
      <div className="rounded-xl border border-white/30 bg-white/70 dark:bg-white/10 px-3 py-2 flex justify-between font-semibold text-slate-700 dark:text-white">
        <span>Valor para Saque</span>
        <span>—</span>
      </div>
    </div>
  );
}
