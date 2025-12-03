import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  DreCategoriesInsert,
  DreCategoriesRow,
  DrePeriodsInsert,
  DrePeriodsRow,
  DrePeriodsUpdate,
  DreValuesInsert,
  DreValuesRow,
} from '@/src/types/db-public';

export type DreCategoryValue = {
  category: DreCategoriesRow;
  value: DreValuesRow | null;
  amountAuto: number | null;
  amountManual: number | null;
  finalAmount: number;
};

export type DreChannelSummary = {
  canal: string;
  totalBruto: number;
  totalFrete: number;
};

export type DreMetrics = {
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

export type DrePeriodSummary = {
  period: DrePeriodsRow;
  metrics: DreMetrics;
};

export type DrePeriodDetail = {
  period: DrePeriodsRow;
  categories: DreCategoryValue[];
  metrics: DreMetrics;
  channels: DreChannelSummary[];
};

type TinyOrderChannelRow = { valor: number | null; valor_frete: number | null; canal: string | null };

const DEFAULT_CATEGORY_SEED: DreCategoriesInsert[] = [
  { code: 'VENDAS', name: 'Vendas', group_type: 'RECEITA', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 10, channel: null, parent_code: null },
  { code: 'REEMBOLSOS_DEVOLUCOES', name: 'Reembolsos / Devoluções', group_type: 'RECEITA', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 20, channel: null, parent_code: null },
  { code: 'RESSARCIMENTO_DEVOLUCOES', name: 'Ressarcimento de Devoluções', group_type: 'RECEITA', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 30, channel: null, parent_code: null },
  { code: 'CMV_IMPOSTOS', name: 'CMV + Impostos', group_type: 'CUSTO_VARIAVEL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 40, channel: null, parent_code: null },
  { code: 'TARIFAS_SHOPEE', name: 'Tarifas Shopee', group_type: 'CUSTO_VARIAVEL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 50, channel: 'SHOPEE', parent_code: null },
  { code: 'TARIFAS_MERCADO_LIVRE', name: 'Tarifas Mercado Livre', group_type: 'CUSTO_VARIAVEL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 60, channel: 'MERCADO_LIVRE', parent_code: null },
  { code: 'TARIFAS_MAGALU', name: 'Tarifas Magalu', group_type: 'CUSTO_VARIAVEL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 70, channel: 'MAGALU', parent_code: null },
  { code: 'COOP_FRETES_MAGALU', name: 'Cooparticipação Fretes Magalu', group_type: 'CUSTO_VARIAVEL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 80, channel: 'MAGALU', parent_code: null },
  { code: 'FRETES', name: 'Fretes', group_type: 'CUSTO_VARIAVEL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 90, channel: null, parent_code: null },
  { code: 'CONTADOR', name: 'Contador', group_type: 'DESPESA_FIXA', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 100, channel: null, parent_code: null },
  { code: 'OUTROS_CUSTOS', name: 'Outros Custos', group_type: 'DESPESA_FIXA', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 110, channel: null, parent_code: null },
  { code: 'SISTEMA_ERP', name: 'Sistema ERP', group_type: 'DESPESA_FIXA', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 120, channel: null, parent_code: null },
  { code: 'INTERNET', name: 'Internet', group_type: 'DESPESA_FIXA', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 130, channel: null, parent_code: null },
  { code: 'IA', name: 'IA', group_type: 'DESPESA_FIXA', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 140, channel: null, parent_code: null },
  { code: 'DESPESAS_OPERACIONAIS', name: 'Despesas Operacionais', group_type: 'DESPESA_OPERACIONAL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 145, channel: null, parent_code: null },
  { code: 'MARKETING_PUBLICIDADE', name: 'Marketing e Publicidade (Anúncios)', group_type: 'DESPESA_OPERACIONAL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 150, channel: null, parent_code: null },
  { code: 'MATERIAIS_EMBALAGEM', name: 'Materiais de Embalagem', group_type: 'CUSTO_VARIAVEL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 160, channel: null, parent_code: null },
  { code: 'COMBUSTIVEIS', name: 'Combustíveis', group_type: 'DESPESA_OPERACIONAL', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 170, channel: null, parent_code: null },
  // Ajustes pós-divisão (Vitor)
  { code: 'PLANO_SAUDE_VITOR', name: 'Plano de Saúde (Vitor)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 210, channel: null, parent_code: null },
  { code: 'VALES_VITOR', name: 'Vales (Vitor)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 211, channel: null, parent_code: null },
  { code: 'OUTROS_DESCONTOS_VITOR', name: 'Outros Descontos (Vitor)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 212, channel: null, parent_code: null },
  { code: 'VALE_COMBUSTIVEL_VITOR', name: 'Vale Combustível (Vitor)', group_type: 'OUTROS', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 213, channel: null, parent_code: null },
  { code: 'OUTROS_CREDITOS_VITOR', name: 'Outros Créditos (Vitor)', group_type: 'OUTROS', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 214, channel: null, parent_code: null },
  // Ajustes pós-divisão (Gabriela)
  { code: 'PLANO_SAUDE_GABRIELA', name: 'Plano de Saúde (Gabriela)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 220, channel: null, parent_code: null },
  { code: 'VALES_GABRIELA', name: 'Vales (Gabriela)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 221, channel: null, parent_code: null },
  { code: 'OUTROS_DESCONTOS_GABRIELA', name: 'Outros Descontos (Gabriela)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 222, channel: null, parent_code: null },
  { code: 'VALE_COMBUSTIVEL_GABRIELA', name: 'Vale Combustível (Gabriela)', group_type: 'OUTROS', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 223, channel: null, parent_code: null },
  { code: 'OUTROS_CREDITOS_GABRIELA', name: 'Outros Créditos (Gabriela)', group_type: 'OUTROS', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 224, channel: null, parent_code: null },
  // Ajustes pós-divisão (Nelson)
  { code: 'PLANO_SAUDE_NELSON', name: 'Plano de Saúde (Nelson)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 230, channel: null, parent_code: null },
  { code: 'VALES_NELSON', name: 'Vales (Nelson)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 231, channel: null, parent_code: null },
  { code: 'OUTROS_DESCONTOS_NELSON', name: 'Outros Descontos (Nelson)', group_type: 'OUTROS', sign: 'SAIDA', is_default: true, is_editable: true, order_index: 232, channel: null, parent_code: null },
  { code: 'VALE_COMBUSTIVEL_NELSON', name: 'Vale Combustível (Nelson)', group_type: 'OUTROS', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 233, channel: null, parent_code: null },
  { code: 'OUTROS_CREDITOS_NELSON', name: 'Outros Créditos (Nelson)', group_type: 'OUTROS', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 234, channel: null, parent_code: null },
  { code: 'NELSON_BASE', name: 'Base Nelson', group_type: 'OUTROS', sign: 'ENTRADA', is_default: true, is_editable: true, order_index: 235, channel: null, parent_code: null },
];

const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const buildMonthLabel = (year: number, month: number) => {
  const idx = Math.max(1, Math.min(12, month)) - 1;
  const nomeMes = MONTH_LABELS[idx] ?? `Mês ${month}`;
  return `${nomeMes}/${year}`;
};

const monthBounds = (year: number, month: number) => {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return { start: format(start), end: format(end) };
};

async function fetchCategories() {
  const { data } = await supabaseAdmin
    .from('dre_categories')
    .select<'*', DreCategoriesRow>('*')
    .order('group_type', { ascending: true })
    .order('order_index', { ascending: true })
    .throwOnError();

  const result = data ?? [];
  const existingCodes = new Set(result.map((c) => c.code));
  const missing = DEFAULT_CATEGORY_SEED.filter((c) => !existingCodes.has(c.code));
  if (missing.length) {
    await supabaseAdmin.from('dre_categories').insert(missing).throwOnError();
    return fetchCategories();
  }

  return result;
}

async function fetchPeriodById(periodId: string) {
  const { data } = await supabaseAdmin
    .from('dre_periods')
    .select<'*', DrePeriodsRow>('*')
    .eq('id', periodId)
    .maybeSingle()
    .throwOnError();

  if (!data) throw new Error('Período não encontrado');
  return data;
}

const mergeCategoriesWithValues = (
  categories: DreCategoriesRow[],
  values: DreValuesRow[]
): DreCategoryValue[] => {
  const valueMap = new Map<string, DreValuesRow>();
  values.forEach((v) => valueMap.set(v.category_id, v));

  return categories.map((category) => {
    const value = valueMap.get(category.id) ?? null;
    const amountAuto = value?.amount_auto ?? null;
    const amountManual = value?.amount_manual ?? null;
    const finalAmount = toNumber(value?.final_amount ?? 0);
    return { category, value, amountAuto, amountManual, finalAmount };
  });
};

const computeMetrics = (period: DrePeriodsRow, merged: DreCategoryValue[]): DreMetrics => {
  const getByCode = (code: string) =>
    merged.find((item) => item.category.code === code)?.finalAmount ?? 0;

  const vendas = getByCode('VENDAS');
  const reembolsos = getByCode('REEMBOLSOS_DEVOLUCOES');
  const ressarcimentos = getByCode('RESSARCIMENTO_DEVOLUCOES');

  const otherReceitas = merged
    .filter(
      (item) =>
        item.category.group_type === 'RECEITA' &&
        !['VENDAS', 'REEMBOLSOS_DEVOLUCOES', 'RESSARCIMENTO_DEVOLUCOES'].includes(item.category.code)
    )
    .reduce((acc, item) => {
      const sign = item.category.sign === 'SAIDA' ? -1 : 1;
      return acc + sign * item.finalAmount;
    }, 0);

  const receitaLiquida = vendas - reembolsos + ressarcimentos + otherReceitas;

  const sumByGroup = (group: string) =>
    merged
      .filter((item) => item.category.group_type === group)
      .reduce((acc, item) => {
        const sign = item.category.sign === 'SAIDA' ? 1 : -1;
        return acc + sign * item.finalAmount;
      }, 0);

  const custosVariaveis = sumByGroup('CUSTO_VARIAVEL');
  const despesasFixas = sumByGroup('DESPESA_FIXA');
  const despesasOperacionais = sumByGroup('DESPESA_OPERACIONAL');

  const lucroBruto = receitaLiquida - custosVariaveis;
  const lucroLiquido = lucroBruto - despesasFixas - despesasOperacionais;

  const margemBruta = vendas > 0 ? lucroBruto / vendas : 0;
  const margemContribuicao = vendas > 0 ? (receitaLiquida - custosVariaveis) / vendas : 0;
  const margemLiquida = vendas > 0 ? lucroLiquido / vendas : 0;

  const target = period.target_net_margin ?? null;
  const metaAtingida = target === null ? null : margemLiquida >= target;

  const breakEven = margemContribuicao > 0 ? despesasFixas / margemContribuicao : null;

  const reservePercent = period.reserve_percent ?? 0;
  const reserva = Math.max(0, lucroLiquido * reservePercent);
  const divisao = lucroLiquido - reserva;
  const nelson = Math.max(0, Math.min(2000, divisao));
  const restante = Math.max(divisao - nelson, 0);
  const vitor = restante * 0.5;
  const gabriela = restante * 0.5;

  return {
    vendas,
    reembolsos,
    ressarcimentos,
    receitaLiquida,
    custosVariaveis,
    despesasFixas,
    despesasOperacionais,
    lucroBruto,
    lucroLiquido,
    margemBruta,
    margemContribuicao,
    margemLiquida,
    targetNetMargin: target,
    metaAtingida,
    breakEven,
    reservePercent,
    reserva,
    divisao,
    saque: { nelson, vitor, gabriela },
  };
};

const computeChannelSummary = (orders: TinyOrderChannelRow[]) => {
  const map = new Map<string, { totalBruto: number; totalFrete: number }>();
  orders.forEach((order) => {
    const canal = order.canal || 'Indefinido';
    const prev = map.get(canal) ?? { totalBruto: 0, totalFrete: 0 };
    prev.totalBruto += toNumber(order.valor);
    prev.totalFrete += toNumber(order.valor_frete);
    map.set(canal, prev);
  });
  return Array.from(map.entries()).map(([canal, totals]) => ({
    canal,
    totalBruto: totals.totalBruto,
    totalFrete: totals.totalFrete,
  }));
};

export async function listCategories() {
  return fetchCategories();
}

export async function upsertPeriod(params: {
  year: number;
  month: number;
  label?: string;
  target_net_margin?: number | null;
  reserve_percent?: number | null;
  status?: 'draft' | 'closed';
}) {
  const safeYear = Number(params.year);
  const safeMonth = Number(params.month);
  if (!Number.isFinite(safeYear) || !Number.isFinite(safeMonth)) {
    throw new Error('Ano e mês são obrigatórios.');
  }

  const label = params.label?.trim() || buildMonthLabel(safeYear, safeMonth);
  const payload: DrePeriodsInsert = {
    year: safeYear,
    month: safeMonth,
    label,
    status: params.status ?? 'draft',
    target_net_margin: params.target_net_margin ?? null,
    reserve_percent: params.reserve_percent ?? null,
  };

  const { data } = await supabaseAdmin
    .from('dre_periods')
    .upsert(payload, { onConflict: 'year,month' })
    .select<'*', DrePeriodsRow>('*')
    .maybeSingle()
    .throwOnError();

  if (!data) throw new Error('Falha ao salvar período.');
  return data;
}

export async function updatePeriod(id: string, updates: DrePeriodsUpdate) {
  const payload: DrePeriodsUpdate = {};
  if (typeof updates.status === 'string') payload.status = updates.status;
  if (typeof updates.target_net_margin === 'number' || updates.target_net_margin === null) {
    payload.target_net_margin = updates.target_net_margin;
  }
  if (typeof updates.reserve_percent === 'number' || updates.reserve_percent === null) {
    payload.reserve_percent = updates.reserve_percent;
  }
  if (typeof updates.label === 'string') {
    payload.label = updates.label.trim() || undefined;
  }
  if (Object.keys(payload).length === 0) {
    return fetchPeriodById(id);
  }

  const { data } = await supabaseAdmin
    .from('dre_periods')
    .update(payload)
    .eq('id', id)
    .select<'*', DrePeriodsRow>('*')
    .maybeSingle()
    .throwOnError();

  if (!data) throw new Error('Período não encontrado para atualização.');
  return data;
}

export async function upsertValues(
  periodId: string,
  values: { categoryId: string; amountManual?: number | null; notes?: string | null }[]
) {
  if (!values.length) return;

  const payload: DreValuesInsert[] = values.map((value) => ({
    period_id: periodId,
    category_id: value.categoryId,
    amount_auto: null,
    amount_manual:
      typeof value.amountManual === 'number' && Number.isFinite(value.amountManual)
        ? value.amountManual
        : value.amountManual ?? null,
    auto_source: null,
    notes: typeof value.notes === 'string' ? value.notes : null,
  }));

  const { error } = await supabaseAdmin
    .from('dre_values')
    .upsert(payload, { onConflict: 'period_id,category_id' });

  if (error) throw error;
}

export async function createCustomCategory(params: {
  name: string;
  sign: 'ENTRADA' | 'SAIDA';
  group_type: 'RECEITA' | 'CUSTO_VARIAVEL' | 'DESPESA_FIXA' | 'DESPESA_OPERACIONAL' | 'OUTROS';
  channel?: string | null;
  parent_code?: string | null;
  order_index?: number;
}) {
  const categories = await fetchCategories();
  const codeBase = params.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  const code = codeBase || `CUSTOM_${Date.now()}`;
  const maxOrder =
    categories
      .filter((c) => c.group_type === params.group_type)
      .reduce((acc, curr) => Math.max(acc, curr.order_index ?? 0), 0) || 0;

  const payload: DreCategoriesInsert = {
    code,
    name: params.name.trim(),
    sign: params.sign,
    group_type: params.group_type,
    channel: params.channel ?? null,
    parent_code: params.parent_code ?? null,
    is_default: false,
    is_editable: true,
    order_index: params.order_index ?? maxOrder + 10,
  };

  const { data } = await supabaseAdmin
    .from('dre_categories')
    .insert(payload as DreCategoriesInsert)
    .select<'*', DreCategoriesRow>('*')
    .maybeSingle()
    .throwOnError();

  if (!data) throw new Error('Não foi possível criar a categoria.');
  return data;
}

export async function listPeriodsWithSummary(): Promise<DrePeriodSummary[]> {
  const { data: periods } = await supabaseAdmin
    .from('dre_periods')
    .select<'*', DrePeriodsRow>('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .throwOnError();

  const typedPeriods = periods ?? [];
  if (!typedPeriods.length) return [];

  const periodIds = typedPeriods.map((p) => p.id);
  const [categories, valuesRes] = await Promise.all([
    fetchCategories(),
    supabaseAdmin
      .from('dre_values')
      .select<'*', DreValuesRow>('*')
      .in('period_id', periodIds),
  ]);

  if (valuesRes.error) throw valuesRes.error;
  const values = valuesRes.data ?? [];

  const valuesByPeriod = new Map<string, DreValuesRow[]>();
  values.forEach((row) => {
    const list = valuesByPeriod.get(row.period_id) ?? [];
    list.push(row);
    valuesByPeriod.set(row.period_id, list);
  });

  return typedPeriods.map((period) => {
    const merged = mergeCategoriesWithValues(categories, valuesByPeriod.get(period.id) || []);
    const metrics = computeMetrics(period, merged);
    return { period, metrics };
  });
}

export async function getPeriodDetail(periodId: string): Promise<DrePeriodDetail> {
  const period = await fetchPeriodById(periodId);
  const categories = await fetchCategories();

  const { data: valuesData } = await supabaseAdmin
    .from('dre_values')
    .select<'*', DreValuesRow>('*')
    .eq('period_id', periodId)
    .throwOnError();

  const values = valuesData ?? [];
  const merged = mergeCategoriesWithValues(categories, values);
  const metrics = computeMetrics(period, merged);

  const { start, end } = monthBounds(period.year, period.month);
  const { data: ordersData, error: ordersError } = await supabaseAdmin
    .from('tiny_orders')
    .select<'valor, valor_frete, canal', TinyOrderChannelRow>('valor, valor_frete, canal')
    .gte('data_criacao', start)
    .lte('data_criacao', end);

  if (ordersError) throw ordersError;
  const channels = computeChannelSummary(ordersData ?? []);

  return { period, categories: merged, metrics, channels };
}

export async function suggestAutoValuesForPeriod(periodId: string) {
  const period = await fetchPeriodById(periodId);
  const categories = await fetchCategories();
  const categoryByCode = new Map(categories.map((c) => [c.code, c]));
  const { start, end } = monthBounds(period.year, period.month);

  const [{ data: metricsData, error: metricsError }, { data: ordersData, error: ordersError }] =
    await Promise.all([
      supabaseAdmin.rpc('orders_metrics', { p_data_inicial: start, p_data_final: end }),
      supabaseAdmin
        .from('tiny_orders')
        .select<'valor, valor_frete, canal', TinyOrderChannelRow>('valor, valor_frete, canal')
        .gte('data_criacao', start)
        .lte('data_criacao', end),
    ]);

  if (metricsError) throw metricsError;
  if (ordersError) throw ordersError;

  const metricsRow = (metricsData || [])[0] ?? null;
  const vendas = metricsRow ? toNumber(metricsRow.total_bruto) : 0;
  const fretes = metricsRow ? toNumber(metricsRow.total_frete) : 0;

  const suggestions: DreValuesInsert[] = [];
  const pushSuggestion = (code: string, value: number | null, source: string) => {
    if (value === null) return;
    const category = categoryByCode.get(code);
    if (!category) return;
    suggestions.push({
      period_id: periodId,
      category_id: category.id,
      amount_auto: Number(value.toFixed(2)),
      amount_manual: null,
      auto_source: source,
      notes: null,
    });
  };

  pushSuggestion('VENDAS', vendas, 'orders_metrics');
  pushSuggestion('FRETES', fretes, 'orders_metrics');

  if (suggestions.length) {
    const { error } = await supabaseAdmin
      .from('dre_values')
      .upsert(suggestions, { onConflict: 'period_id,category_id' });
    if (error) throw error;
  }

  const channels = computeChannelSummary(ordersData ?? []);
  return getPeriodDetail(periodId).then((detail) => ({ ...detail, channels }));
}

export async function deletePeriod(periodId: string) {
  const { error } = await supabaseAdmin.from('dre_periods').delete().eq('id', periodId);
  if (error) throw error;
}
