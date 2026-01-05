import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { AIAction, AIInsight, AIIntelligenceResponse, AISignal, AIDriver } from '@/lib/ai/prompts/insight-prompt';

export const REVENUE_EXCLUDED_STATUSES = new Set([2, 8, 9]); // cancelada, dados incompletos, nao entregue

type InsightTipo = 'urgente' | 'oportunidade' | 'tendencia' | 'alerta';
type InsightOrigem = 'vendas' | 'canais' | 'produtos' | 'estoque' | 'frete' | 'pagamentos' | 'financeiro' | 'dados';

export type InsightCandidate = {
  id: string;
  tipo: InsightTipo;
  origem: InsightOrigem;
  titulo: string;
  descricao: string;
  evidencia: string;
  impactoValor?: number;
  impactoPercent?: number;
  cobertura?: number;
  confianca: 'alta' | 'media' | 'baixa';
  acao?: {
    texto: string;
    urgencia: 'agora' | 'hoje' | 'semana' | 'monitorar';
  };
  score: number;
  meta?: Record<string, unknown>;
};

export type InsightIndexQualityAlert = {
  titulo: string;
  detalhe: string;
  acao?: string;
  severidade: 'critico' | 'atencao';
};

export type DbInsightIndex = {
  periodo: { inicio: string; fim: string; dias: number };
  filtros: { canais: string[] | null; situacoes: number[] | null };
  resumo: {
    receita: number;
    receitaLiquida: number;
    pedidos: number;
    ticketMedio: number;
    ticketMedioAnterior: number;
    freteTotal: number;
    fretePercentual: number;
    descontoTotal: number;
    descontoPercentual: number;
    mediaDiaria: number;
    mediaMovel4w: number | null;
    receitaAnterior: number;
    pedidosAnterior: number;
    deltaReceitaPercent: number | null;
    deltaPedidosPercent: number | null;
    deltaTicketPercent: number | null;
  };
  canais: Array<{
    canal: string;
    receita: number;
    pedidos: number;
    participacao: number;
    deltaPercent: number | null;
  }>;
  produtos: Array<{
    sku: string;
    nome: string;
    receita: number;
    quantidade: number;
    deltaPercent: number | null;
    estoque?: number | null;
  }>;
  pagamentos: {
    bruto: number;
    liquido: number;
    taxas: number;
    pendentes: number;
    naoConciliados: number;
    pedidosSemPagamento: number;
    count: number;
    taxaPercentual: number | null;
  };
  qualidade: {
    status: 'ok' | 'atencao' | 'critico';
    alertas: InsightIndexQualityAlert[];
  };
  candidates: InsightCandidate[];
  sinais: AISignal[];
  generatedAt: string;
};

type OrdersRow = {
  id: number;
  tiny_id: number | null;
  data_criacao: string | null;
  situacao: number | null;
  canal: string | null;
  valor: number | null;
  valor_frete: number | null;
  valor_desconto: number | null;
  valor_total_pedido: number | null;
  valor_total_produtos: number | null;
  payment_received: boolean | null;
  marketplace_payment_id: string | null;
};

type OrderItemRow = {
  id_pedido: number;
  codigo_produto: string | null;
  nome_produto: string | null;
  quantidade: number | null;
  valor_total: number | null;
  tiny_orders?: {
    data_criacao: string | null;
    situacao: number | null;
    canal: string | null;
  } | null;
};

type ProductRow = {
  codigo: string | null;
  nome: string | null;
  disponivel: number | null;
  saldo: number | null;
  situacao: string | null;
};

type PaymentRow = {
  gross_amount: number | null;
  net_amount: number | null;
  fees: number | null;
  payment_date: string | null;
  settlement_date: string | null;
  status: string | null;
  tiny_order_id: number | null;
};

type CashFlowRow = {
  type: string;
  amount: number;
  status: string | null;
};

const toNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const toSafeString = (value: unknown) => (typeof value === 'string' ? value : '');

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);
const formatCompactCurrency = (value: number) => `R$ ${compactFormatter.format(value || 0)}`;

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const buildPeriod = (inicio: string, fim: string) => {
  const start = new Date(`${inicio}T00:00:00`);
  const end = new Date(`${fim}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  const dias = Number.isFinite(diff) ? Math.max(1, Math.round(diff / 86_400_000) + 1) : 1;
  return { start, end, dias };
};

const buildPreviousPeriod = (inicio: string, fim: string) => {
  const { start, dias } = buildPeriod(inicio, fim);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(dias - 1));
  return { inicio: isoDate(prevStart), fim: isoDate(prevEnd), dias };
};

const confidenceFromCoverage = (coverage: number) => {
  if (coverage >= 120) return 'alta';
  if (coverage >= 40) return 'media';
  return 'baixa';
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const INDEX_CACHE = new Map<string, { data: DbInsightIndex; expiresAt: number }>();

const normalizeKey = (values?: Array<string | number> | null) => {
  const list = (values ?? [])
    .filter((item) => item !== null && item !== undefined)
    .map((item) => String(item))
    .filter(Boolean);
  if (!list.length) return 'all';
  return Array.from(new Set(list)).sort().join('|');
};

const scoreCandidate = (candidate: Omit<InsightCandidate, 'score'>, totalReceita: number) => {
  const baseReceita = totalReceita || 1;
  const impactoValorScore = candidate.impactoValor ? Math.min(Math.abs(candidate.impactoValor) / baseReceita * 100, 120) : 0;
  const impactoPercentScore = candidate.impactoPercent ? Math.min(Math.abs(candidate.impactoPercent), 120) : 0;
  const coverageScore = candidate.cobertura ? Math.min(candidate.cobertura / 10, 12) : 0;
  const confidenceScore = candidate.confianca === 'alta' ? 10 : candidate.confianca === 'media' ? 6 : 3;
  return impactoValorScore + impactoPercentScore + coverageScore + confidenceScore;
};

const normalizeChannel = (value: string | null) => (value && value.trim() ? value.trim() : 'Outros');

const buildSinais = (resumo: DbInsightIndex['resumo'], canais: DbInsightIndex['canais']): AISignal[] => {
  const sinais: AISignal[] = [];
  sinais.push({
    titulo: 'Receita',
    valor: formatCurrency(resumo.receita),
    variacao: typeof resumo.deltaReceitaPercent === 'number' ? `${resumo.deltaReceitaPercent >= 0 ? '+' : ''}${resumo.deltaReceitaPercent.toFixed(1)}%` : undefined,
    tipo: typeof resumo.deltaReceitaPercent === 'number' && resumo.deltaReceitaPercent <= -6 ? 'alerta'
      : typeof resumo.deltaReceitaPercent === 'number' && resumo.deltaReceitaPercent >= 6 ? 'positivo'
        : 'neutro',
    confianca: 'alta',
  });
  sinais.push({
    titulo: 'Pedidos',
    valor: resumo.pedidos.toLocaleString('pt-BR'),
    variacao: typeof resumo.deltaPedidosPercent === 'number' ? `${resumo.deltaPedidosPercent >= 0 ? '+' : ''}${resumo.deltaPedidosPercent.toFixed(1)}%` : undefined,
    tipo: typeof resumo.deltaPedidosPercent === 'number' && resumo.deltaPedidosPercent <= -6 ? 'alerta'
      : typeof resumo.deltaPedidosPercent === 'number' && resumo.deltaPedidosPercent >= 6 ? 'positivo'
        : 'neutro',
    confianca: 'media',
  });
  sinais.push({
    titulo: 'Ticket medio',
    valor: formatCurrency(resumo.ticketMedio),
    variacao: typeof resumo.deltaTicketPercent === 'number' ? `${resumo.deltaTicketPercent >= 0 ? '+' : ''}${resumo.deltaTicketPercent.toFixed(1)}%` : undefined,
    tipo: 'neutro',
    confianca: 'media',
  });
  if (canais.length) {
    const top = canais[0];
    sinais.push({
      titulo: 'Canal dominante',
      valor: top.canal,
      variacao: `${top.participacao.toFixed(0)}%`,
      tipo: top.participacao >= 70 ? 'alerta' : 'neutro',
      origem: 'canal',
      confianca: 'alta',
    });
  }
  if (resumo.fretePercentual >= 10) {
    sinais.push({
      titulo: 'Peso do frete',
      valor: `${resumo.fretePercentual.toFixed(1)}%`,
      tipo: resumo.fretePercentual >= 18 ? 'alerta' : 'neutro',
      origem: 'frete',
      confianca: 'media',
    });
  }
  if (resumo.descontoPercentual >= 8) {
    sinais.push({
      titulo: 'Descontos',
      valor: `${resumo.descontoPercentual.toFixed(1)}%`,
      tipo: resumo.descontoPercentual >= 15 ? 'alerta' : 'neutro',
      origem: 'vendas',
      confianca: 'media',
    });
  }
  return sinais.slice(0, 6);
};

const buildDriversFromCandidates = (candidates: InsightCandidate[]): AIDriver[] => {
  return candidates.slice(0, 4).map((candidate) => ({
    titulo: candidate.titulo,
    detalhe: candidate.descricao,
    evidencia: candidate.evidencia,
    impacto: candidate.tipo === 'urgente' ? 'alto' : candidate.tipo === 'alerta' ? 'medio' : 'baixo',
    tendencia: candidate.tipo === 'oportunidade' ? 'up' : candidate.tipo === 'urgente' ? 'down' : 'stable',
    origem: candidate.origem,
  }));
};

const buildActionsFromCandidates = (candidates: InsightCandidate[]): AIAction[] => {
  return candidates.slice(0, 4).map((candidate) => ({
    titulo: candidate.acao?.texto || candidate.titulo,
    motivo: candidate.descricao,
    urgencia: candidate.acao?.urgencia || (candidate.tipo === 'urgente' ? 'agora' : candidate.tipo === 'alerta' ? 'hoje' : 'semana'),
    impacto: candidate.tipo === 'urgente' ? 'alto' : candidate.tipo === 'alerta' ? 'medio' : 'baixo',
    cta: candidate.acao?.texto || 'Detalhar',
    metrica: candidate.evidencia ? {
      valor: candidate.evidencia,
      label: candidate.origem,
      trend: candidate.tipo === 'oportunidade' ? 'up' : candidate.tipo === 'urgente' ? 'down' : 'stable',
    } : undefined,
  }));
};

const buildInsightsFromCandidates = (candidates: InsightCandidate[]): AIInsight[] => {
  return candidates.slice(0, 4).map((candidate, index) => ({
    tipo: candidate.tipo,
    prioridade: Math.min(5, index + 1),
    titulo: candidate.titulo.slice(0, 40),
    descricao: candidate.descricao.slice(0, 120),
    acao: {
      texto: candidate.acao?.texto || candidate.titulo.slice(0, 50),
      urgencia: candidate.acao?.urgencia || (candidate.tipo === 'urgente' ? 'agora' : candidate.tipo === 'alerta' ? 'hoje' : 'semana'),
    },
    metrica: candidate.evidencia ? {
      valor: candidate.evidencia,
      label: candidate.origem,
      trend: candidate.tipo === 'oportunidade' ? 'up' : candidate.tipo === 'urgente' ? 'down' : 'stable',
    } : undefined,
  }));
};

export function buildIntelligenceFromIndex(index: DbInsightIndex): AIIntelligenceResponse {
  const sentimento = typeof index.resumo.deltaReceitaPercent === 'number'
    ? index.resumo.deltaReceitaPercent >= 6
      ? 'positivo'
      : index.resumo.deltaReceitaPercent <= -6
        ? 'alerta'
        : 'neutro'
    : 'neutro';

  const headline = sentimento === 'positivo'
    ? 'Receita acelerando no periodo'
    : sentimento === 'alerta'
      ? 'Receita em queda e exige acao'
      : 'Receita estavel, foco em eficiencia';

  const contexto = [
    `${formatCompactCurrency(index.resumo.receita)} em ${index.periodo.dias} dias`,
    `${index.resumo.pedidos.toLocaleString('pt-BR')} pedidos`,
    `ticket medio ${formatCurrency(index.resumo.ticketMedio)}`,
  ].join(' · ');

  const ordered = [...index.candidates].sort((a, b) => b.score - a.score);

  return {
    resumoExecutivo: {
      manchete: headline,
      contexto,
      sentimento,
    },
    insights: buildInsightsFromCandidates(ordered),
    drivers: buildDriversFromCandidates(ordered),
    acoes: buildActionsFromCandidates(ordered),
    sinais: index.sinais,
    qualidadeDados: {
      status: index.qualidade.status,
      alertas: index.qualidade.alertas.map((alerta) => ({
        titulo: alerta.titulo,
        detalhe: alerta.detalhe,
        acao: alerta.acao,
      })),
    },
    generatedAt: index.generatedAt,
  };
}

export const buildInsightBullets = (index: DbInsightIndex, maxItems = 4) => {
  const ordered = [...index.candidates].sort((a, b) => b.score - a.score);
  return ordered.slice(0, maxItems).map((candidate) => `• ${candidate.titulo}: ${candidate.descricao}`).join('\n');
};

export const buildIndexPrompt = (index: DbInsightIndex) => {
  const summary = {
    periodo: index.periodo,
    receita: index.resumo.receita,
    pedidos: index.resumo.pedidos,
    ticketMedio: index.resumo.ticketMedio,
    ticketMedioAnterior: index.resumo.ticketMedioAnterior,
    deltaTicketPercent: index.resumo.deltaTicketPercent,
    fretePercentual: index.resumo.fretePercentual,
    descontoPercentual: index.resumo.descontoPercentual,
    mediaDiaria: index.resumo.mediaDiaria,
    mediaMovel4w: index.resumo.mediaMovel4w,
    deltaReceitaPercent: index.resumo.deltaReceitaPercent,
    deltaPedidosPercent: index.resumo.deltaPedidosPercent,
  };

  const candidates = index.candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((candidate) => ({
      tipo: candidate.tipo,
      origem: candidate.origem,
      titulo: candidate.titulo,
      descricao: candidate.descricao,
      evidencia: candidate.evidencia,
      impactoValor: candidate.impactoValor,
      impactoPercent: candidate.impactoPercent,
      cobertura: candidate.cobertura,
      confianca: candidate.confianca,
      acao: candidate.acao,
    }));

  return `## DB Insight Index\nResumo: ${JSON.stringify(summary)}\nCandidatos: ${JSON.stringify(candidates)}\nQualidade: ${JSON.stringify(index.qualidade)}`;
};

export async function buildDbInsightIndex(input: {
  inicio: string;
  fim: string;
  canais?: string[] | null;
  situacoes?: number[] | null;
}): Promise<DbInsightIndex | null> {
  const inicio = toSafeString(input.inicio);
  const fim = toSafeString(input.fim);
  if (!inicio || !fim) return null;

  const cacheKey = `${inicio}|${fim}|${normalizeKey(input.canais)}|${normalizeKey(input.situacoes)}`;
  const cached = INDEX_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const admin = supabaseAdmin as any;
  const { dias } = buildPeriod(inicio, fim);
  const previous = buildPreviousPeriod(inicio, fim);

  const baseQuery = admin
    .from('tiny_orders')
    .select('id,tiny_id,data_criacao,situacao,canal,valor,valor_frete,valor_desconto,valor_total_pedido,valor_total_produtos,payment_received,marketplace_payment_id')
    .gte('data_criacao', inicio)
    .lte('data_criacao', fim);

  if (input.canais?.length) {
    baseQuery.in('canal', input.canais);
  }
  if (input.situacoes?.length) {
    baseQuery.in('situacao', input.situacoes);
  }

  const { data: ordersRaw, error: ordersError } = await baseQuery;
  if (ordersError) {
    console.error('[DB Insight] orders query failed', ordersError);
    return null;
  }

  const prevQuery = admin
    .from('tiny_orders')
    .select('id,tiny_id,data_criacao,situacao,canal,valor,valor_frete,valor_desconto,valor_total_pedido,valor_total_produtos,payment_received,marketplace_payment_id')
    .gte('data_criacao', previous.inicio)
    .lte('data_criacao', previous.fim);

  if (input.canais?.length) {
    prevQuery.in('canal', input.canais);
  }
  if (input.situacoes?.length) {
    prevQuery.in('situacao', input.situacoes);
  }

  const { data: ordersPrevRaw, error: ordersPrevError } = await prevQuery;
  if (ordersPrevError) {
    console.error('[DB Insight] prev orders query failed', ordersPrevError);
    return null;
  }

  const orders = (ordersRaw || []) as OrdersRow[];
  const ordersPrev = (ordersPrevRaw || []) as OrdersRow[];

  const revenueOrders = orders.filter((order) => !REVENUE_EXCLUDED_STATUSES.has(order.situacao ?? -1));
  const revenueOrdersPrev = ordersPrev.filter((order) => !REVENUE_EXCLUDED_STATUSES.has(order.situacao ?? -1));

  const receita = revenueOrders.reduce((sum, order) => sum + toNumber(order.valor), 0);
  const freteTotal = revenueOrders.reduce((sum, order) => sum + toNumber(order.valor_frete), 0);
  const descontoTotal = revenueOrders.reduce((sum, order) => sum + toNumber(order.valor_desconto), 0);
  const receitaLiquida = receita - freteTotal;
  const pedidos = revenueOrders.length;
  const ticketMedio = pedidos > 0 ? receita / pedidos : 0;

  const receitaAnterior = revenueOrdersPrev.reduce((sum, order) => sum + toNumber(order.valor), 0);
  const pedidosAnterior = revenueOrdersPrev.length;
  const deltaReceitaPercent = receitaAnterior > 0 ? ((receita - receitaAnterior) / receitaAnterior) * 100 : null;
  const deltaPedidosPercent = pedidosAnterior > 0 ? ((pedidos - pedidosAnterior) / pedidosAnterior) * 100 : null;

  const fretePercentual = receita > 0 ? (freteTotal / receita) * 100 : 0;
  const descontoPercentual = receita > 0 ? (descontoTotal / receita) * 100 : 0;
  const ticketMedioAnterior = pedidosAnterior > 0 ? receitaAnterior / pedidosAnterior : 0;
  const deltaTicketPercent = ticketMedioAnterior > 0 ? ((ticketMedio - ticketMedioAnterior) / ticketMedioAnterior) * 100 : null;
  const mediaDiaria = dias > 0 ? receita / dias : 0;

  let mediaMovel4w: number | null = null;
  try {
    const endDate = new Date(`${fim}T00:00:00`);
    const start4w = addDays(endDate, -27);
    const start4wStr = isoDate(start4w);

    const rollingQuery = admin
      .from('tiny_orders')
      .select('valor, situacao, canal, data_criacao')
      .gte('data_criacao', start4wStr)
      .lte('data_criacao', fim);

    if (input.canais?.length) {
      rollingQuery.in('canal', input.canais);
    }
    if (input.situacoes?.length) {
      rollingQuery.in('situacao', input.situacoes);
    }

    const { data: rollingRaw, error: rollingError } = await rollingQuery;
    if (rollingError) {
      console.error('[DB Insight] rolling query failed', rollingError);
    } else {
      const rollingOrders = (rollingRaw || []) as Array<{ valor: number | null; situacao: number | null }>;
      const rollingRevenue = rollingOrders
        .filter((order) => !REVENUE_EXCLUDED_STATUSES.has(order.situacao ?? -1))
        .reduce((sum, order) => sum + toNumber(order.valor), 0);
      mediaMovel4w = rollingRevenue / 28;
    }
  } catch (error) {
    console.error('[DB Insight] rolling average failed', error);
  }

  const canaisMap = new Map<string, { receita: number; pedidos: number }>();
  revenueOrders.forEach((order) => {
    const canal = normalizeChannel(order.canal);
    const current = canaisMap.get(canal) || { receita: 0, pedidos: 0 };
    current.receita += toNumber(order.valor);
    current.pedidos += 1;
    canaisMap.set(canal, current);
  });

  const canaisPrevMap = new Map<string, number>();
  revenueOrdersPrev.forEach((order) => {
    const canal = normalizeChannel(order.canal);
    canaisPrevMap.set(canal, (canaisPrevMap.get(canal) || 0) + toNumber(order.valor));
  });

  const canais = Array.from(canaisMap.entries())
    .map(([canal, info]) => ({
      canal,
      receita: info.receita,
      pedidos: info.pedidos,
      participacao: receita > 0 ? (info.receita / receita) * 100 : 0,
      deltaPercent: canaisPrevMap.get(canal)
        ? ((info.receita - (canaisPrevMap.get(canal) || 0)) / (canaisPrevMap.get(canal) || 1)) * 100
        : null,
    }))
    .sort((a, b) => b.receita - a.receita);

  const daysMap = new Map<string, number>();
  const startDate = new Date(`${inicio}T00:00:00`);
  const endDate = new Date(`${fim}T00:00:00`);
  for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
    daysMap.set(isoDate(cursor), 0);
  }
  revenueOrders.forEach((order) => {
    const day = order.data_criacao ? order.data_criacao.slice(0, 10) : null;
    if (!day || !daysMap.has(day)) return;
    daysMap.set(day, (daysMap.get(day) || 0) + toNumber(order.valor));
  });
  const daysWithZero = Array.from(daysMap.entries()).filter(([, total]) => total === 0).map(([day]) => day);
  const dayKeys = Array.from(daysMap.keys()).sort();
  const last7Keys = dayKeys.slice(-7);
  const prev7Keys = dayKeys.slice(-14, -7);
  const last7Revenue = last7Keys.reduce((sum, day) => sum + (daysMap.get(day) || 0), 0);
  const prev7Revenue = prev7Keys.reduce((sum, day) => sum + (daysMap.get(day) || 0), 0);
  const deltaLast7 = prev7Revenue > 0 ? ((last7Revenue - prev7Revenue) / prev7Revenue) * 100 : null;

  const dailyTotals = Array.from(daysMap.values());
  const dailyMean = dailyTotals.length ? dailyTotals.reduce((sum, value) => sum + value, 0) / dailyTotals.length : 0;
  const dailyVariance = dailyTotals.length
    ? dailyTotals.reduce((sum, value) => sum + Math.pow(value - dailyMean, 2), 0) / dailyTotals.length
    : 0;
  const dailyStd = Math.sqrt(dailyVariance);
  const dailyCv = dailyMean > 0 ? dailyStd / dailyMean : 0;

  const weekdayMap = new Map<number, { receita: number; dias: number }>();
  Array.from(daysMap.entries()).forEach(([day, total]) => {
    const date = new Date(`${day}T12:00:00`);
    const dow = Number.isFinite(date.getTime()) ? date.getDay() : 0;
    const entry = weekdayMap.get(dow) || { receita: 0, dias: 0 };
    entry.receita += total;
    entry.dias += 1;
    weekdayMap.set(dow, entry);
  });
  const weekdayStats = Array.from(weekdayMap.entries()).map(([dow, value]) => ({
    dow,
    media: value.dias > 0 ? value.receita / value.dias : 0,
    dias: value.dias,
  }));
  const bestWeekday = weekdayStats.reduce((best, current) => (current.media > (best?.media ?? -1) ? current : best), null as null | typeof weekdayStats[number]);
  const worstWeekday = weekdayStats.reduce((worst, current) => (current.media < (worst?.media ?? Number.MAX_VALUE) ? current : worst), null as null | typeof weekdayStats[number]);

  const itemsQuery = admin
    .from('tiny_pedido_itens')
    .select('id_pedido,codigo_produto,nome_produto,quantidade,valor_total,tiny_orders!inner(data_criacao,situacao,canal)')
    .gte('tiny_orders.data_criacao', inicio)
    .lte('tiny_orders.data_criacao', fim);

  if (input.canais?.length) {
    itemsQuery.in('tiny_orders.canal', input.canais);
  }
  if (input.situacoes?.length) {
    itemsQuery.in('tiny_orders.situacao', input.situacoes);
  }

  const { data: itemsRaw, error: itemsError } = await itemsQuery;
  if (itemsError) {
    console.error('[DB Insight] items query failed', itemsError);
  }

  const items = (itemsRaw || []) as OrderItemRow[];

  const itemsPrevQuery = admin
    .from('tiny_pedido_itens')
    .select('id_pedido,codigo_produto,nome_produto,quantidade,valor_total,tiny_orders!inner(data_criacao,situacao,canal)')
    .gte('tiny_orders.data_criacao', previous.inicio)
    .lte('tiny_orders.data_criacao', previous.fim);

  if (input.canais?.length) {
    itemsPrevQuery.in('tiny_orders.canal', input.canais);
  }
  if (input.situacoes?.length) {
    itemsPrevQuery.in('tiny_orders.situacao', input.situacoes);
  }

  const { data: itemsPrevRaw, error: itemsPrevError } = await itemsPrevQuery;
  if (itemsPrevError) {
    console.error('[DB Insight] prev items query failed', itemsPrevError);
  }

  const itemsPrev = (itemsPrevRaw || []) as OrderItemRow[];

  const productMap = new Map<string, { sku: string; nome: string; receita: number; quantidade: number }>();
  const orderIdsWithItems = new Set<number>();

  items.forEach((item) => {
    const situacao = item.tiny_orders?.situacao ?? null;
    if (REVENUE_EXCLUDED_STATUSES.has(situacao ?? -1)) return;
    orderIdsWithItems.add(item.id_pedido);
    const sku = item.codigo_produto || item.nome_produto || String(item.id_pedido);
    const nome = item.nome_produto || item.codigo_produto || 'Produto';
    const current = productMap.get(sku) || { sku, nome, receita: 0, quantidade: 0 };
    current.receita += toNumber(item.valor_total);
    current.quantidade += toNumber(item.quantidade);
    productMap.set(sku, current);
  });

  const productPrevMap = new Map<string, { receita: number; quantidade: number }>();
  itemsPrev.forEach((item) => {
    const situacao = item.tiny_orders?.situacao ?? null;
    if (REVENUE_EXCLUDED_STATUSES.has(situacao ?? -1)) return;
    const sku = item.codigo_produto || item.nome_produto || String(item.id_pedido);
    const current = productPrevMap.get(sku) || { receita: 0, quantidade: 0 };
    current.receita += toNumber(item.valor_total);
    current.quantidade += toNumber(item.quantidade);
    productPrevMap.set(sku, current);
  });

  const produtos = Array.from(productMap.values())
    .map((product) => {
      const prev = productPrevMap.get(product.sku);
      const delta = prev && prev.receita > 0 ? ((product.receita - prev.receita) / prev.receita) * 100 : null;
      return {
        sku: product.sku,
        nome: product.nome,
        receita: product.receita,
        quantidade: product.quantidade,
        deltaPercent: delta,
      };
    })
    .sort((a, b) => b.receita - a.receita);

  const topSkus = produtos.slice(0, 12).map((p) => p.sku);
  let estoqueMap = new Map<string, number>();
  if (topSkus.length) {
    const { data: produtosRaw, error: produtosError } = await admin
      .from('tiny_produtos')
      .select('codigo,nome,disponivel,saldo,situacao')
      .in('codigo', topSkus);

    if (produtosError) {
      console.error('[DB Insight] produtos query failed', produtosError);
    } else {
      const produtosRows = (produtosRaw || []) as ProductRow[];
      estoqueMap = new Map(
        produtosRows.map((row) => {
          const estoque = row.disponivel ?? row.saldo ?? 0;
          return [row.codigo || '', estoque] as [string, number];
        })
      );
    }
  }

  const produtosWithStock = produtos.map((product) => ({
    ...product,
    estoque: estoqueMap.get(product.sku) ?? null,
  }));

  const { data: lowStockRows } = await admin
    .from('tiny_produtos')
    .select('codigo,nome,disponivel,saldo,situacao')
    .eq('situacao', 'A')
    .order('disponivel', { ascending: true })
    .limit(12);

  const lowStockList = (lowStockRows || []) as ProductRow[];
  const lowStockCount = lowStockList.filter((p) => (p.disponivel ?? p.saldo ?? 0) <= 5 && (p.disponivel ?? p.saldo ?? 0) > 0).length;
  const outOfStockCount = lowStockList.filter((p) => (p.disponivel ?? p.saldo ?? 0) <= 0).length;

  const paymentsQuery = admin
    .from('marketplace_payments')
    .select('gross_amount,net_amount,fees,payment_date,settlement_date,status,tiny_order_id')
    .gte('payment_date', inicio)
    .lte('payment_date', fim);

  const { data: paymentsRaw, error: paymentsError } = await paymentsQuery;
  if (paymentsError) {
    console.error('[DB Insight] payments query failed', paymentsError);
  }
  const payments = (paymentsRaw || []) as PaymentRow[];

  const pagamentosBruto = payments.reduce((sum, payment) => sum + toNumber(payment.gross_amount), 0);
  const pagamentosLiquido = payments.reduce((sum, payment) => sum + toNumber(payment.net_amount), 0);
  const taxas = payments.reduce((sum, payment) => sum + toNumber(payment.fees), 0);
  const paymentsCount = payments.length;
  const taxaPercentual = pagamentosBruto > 0 ? (taxas / pagamentosBruto) * 100 : null;
  const naoConciliados = payments.filter((payment) => !payment.tiny_order_id).length;

  const pedidosSemPagamento = revenueOrders.filter((order) => !order.payment_received).length;

  const { data: cashFlowRaw, error: cashFlowError } = await admin
    .from('cash_flow_entries')
    .select('type,amount,status')
    .gte('due_date', inicio)
    .lte('due_date', fim);

  if (cashFlowError) {
    console.error('[DB Insight] cash flow query failed', cashFlowError);
  }

  const cashFlow = (cashFlowRaw || []) as CashFlowRow[];
  const paidEntries = cashFlow.filter((entry) => entry.status === 'paid');
  const pendingEntries = cashFlow.filter((entry) => entry.status === 'pending');

  const totalIncome = paidEntries.filter((entry) => entry.type === 'income').reduce((sum, entry) => sum + toNumber(entry.amount), 0);
  const totalExpense = paidEntries.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + toNumber(entry.amount), 0);
  const pendingReceivables = pendingEntries.filter((entry) => entry.type === 'income').reduce((sum, entry) => sum + toNumber(entry.amount), 0);
  const pendingPayables = pendingEntries.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + toNumber(entry.amount), 0);

  const qualityAlerts: InsightIndexQualityAlert[] = [];
  const missingValueOrders = orders.filter((order) => order.valor === null).length;
  const missingChannelOrders = orders.filter((order) => !order.canal).length;
  const missingFreteOrders = orders.filter((order) => order.valor_frete === null).length;
  const ordersWithoutItems = revenueOrders.filter((order) => !orderIdsWithItems.has(order.id)).length;

  if (missingValueOrders > 0) {
    qualityAlerts.push({
      titulo: 'Pedidos sem valor',
      detalhe: `${missingValueOrders} pedidos sem valor definido no periodo.`,
      acao: 'Revisar integracao de pedidos',
      severidade: missingValueOrders >= 10 ? 'critico' : 'atencao',
    });
  }
  if (missingChannelOrders > 0) {
    qualityAlerts.push({
      titulo: 'Pedidos sem canal',
      detalhe: `${missingChannelOrders} pedidos sem canal identificado.`,
      acao: 'Revisar mapeamento de canais',
      severidade: missingChannelOrders >= 10 ? 'critico' : 'atencao',
    });
  }
  if (missingFreteOrders > 0) {
    qualityAlerts.push({
      titulo: 'Pedidos sem frete',
      detalhe: `${missingFreteOrders} pedidos sem valor de frete.`,
      acao: 'Validar integracao de frete',
      severidade: missingFreteOrders >= 10 ? 'critico' : 'atencao',
    });
  }
  if (ordersWithoutItems > 0) {
    qualityAlerts.push({
      titulo: 'Pedidos sem itens',
      detalhe: `${ordersWithoutItems} pedidos sem itens associados no periodo.`,
      acao: 'Verificar ETL de itens',
      severidade: ordersWithoutItems >= 8 ? 'critico' : 'atencao',
    });
  }
  if (daysWithZero.length >= 2) {
    qualityAlerts.push({
      titulo: 'Dias sem vendas',
      detalhe: `${daysWithZero.length} dias sem receita registrada no periodo.`,
      acao: 'Validar sincronizacao diaria',
      severidade: daysWithZero.length >= 4 ? 'critico' : 'atencao',
    });
  }
  if (naoConciliados >= 5) {
    qualityAlerts.push({
      titulo: 'Pagamentos nao conciliados',
      detalhe: `${naoConciliados} pagamentos sem vinculo com pedidos Tiny.`,
      acao: 'Revisar matching de pagamentos',
      severidade: naoConciliados >= 12 ? 'critico' : 'atencao',
    });
  }

  const qualidadeStatus: DbInsightIndex['qualidade']['status'] =
    qualityAlerts.some((alerta) => alerta.severidade === 'critico')
      ? 'critico'
      : qualityAlerts.length > 0
        ? 'atencao'
        : 'ok';

  const candidates: InsightCandidate[] = [];
  const pushCandidate = (candidate: Omit<InsightCandidate, 'score'>) => {
    const scored: InsightCandidate = {
      ...candidate,
      score: scoreCandidate(candidate, receita),
    };
    candidates.push(scored);
  };

  if (typeof deltaReceitaPercent === 'number' && Math.abs(deltaReceitaPercent) >= 8) {
    pushCandidate({
      id: 'receita-variacao',
      tipo: deltaReceitaPercent <= -12 ? 'urgente' : deltaReceitaPercent < 0 ? 'alerta' : 'oportunidade',
      origem: 'vendas',
      titulo: deltaReceitaPercent < 0 ? 'Queda relevante de receita' : 'Receita acelerando no periodo',
      descricao: `Receita ${deltaReceitaPercent < 0 ? 'caiu' : 'subiu'} ${Math.abs(deltaReceitaPercent).toFixed(1)}% vs periodo anterior (${formatCurrency(receitaAnterior)}).`,
      evidencia: `${deltaReceitaPercent >= 0 ? '+' : ''}${deltaReceitaPercent.toFixed(1)}%`,
      impactoValor: receita - receitaAnterior,
      impactoPercent: deltaReceitaPercent,
      cobertura: pedidos,
      confianca: confidenceFromCoverage(pedidos),
      acao: {
        texto: deltaReceitaPercent < 0 ? 'Revisar campanhas e mix' : 'Escalar canais vencedores',
        urgencia: deltaReceitaPercent < 0 ? 'agora' : 'semana',
      },
    });
  }

  if (typeof deltaLast7 === 'number' && Math.abs(deltaLast7) >= 12 && last7Keys.length === 7 && prev7Keys.length === 7) {
    pushCandidate({
      id: 'semana-vs-semana',
      tipo: deltaLast7 < 0 ? 'alerta' : 'oportunidade',
      origem: 'vendas',
      titulo: deltaLast7 < 0 ? 'Ultimos 7 dias desaceleraram' : 'Ultimos 7 dias aceleraram',
      descricao: `Receita dos ultimos 7 dias ${deltaLast7 < 0 ? 'caiu' : 'subiu'} ${Math.abs(deltaLast7).toFixed(1)}% vs semana anterior.`,
      evidencia: `${deltaLast7 >= 0 ? '+' : ''}${deltaLast7.toFixed(1)}%`,
      impactoValor: last7Revenue - prev7Revenue,
      impactoPercent: deltaLast7,
      cobertura: last7Keys.length,
      confianca: confidenceFromCoverage(pedidos),
      acao: {
        texto: deltaLast7 < 0 ? 'Investigar queda recente' : 'Replicar estrategia vencedora',
        urgencia: deltaLast7 < 0 ? 'hoje' : 'semana',
      },
    });
  }

  if (typeof deltaTicketPercent === 'number' && Math.abs(deltaTicketPercent) >= 8) {
    pushCandidate({
      id: 'ticket-variacao',
      tipo: deltaTicketPercent < 0 ? 'alerta' : 'oportunidade',
      origem: 'vendas',
      titulo: deltaTicketPercent < 0 ? 'Ticket medio em queda' : 'Ticket medio em alta',
      descricao: `Ticket medio ${deltaTicketPercent < 0 ? 'caiu' : 'subiu'} ${Math.abs(deltaTicketPercent).toFixed(1)}% vs periodo anterior.`,
      evidencia: `${deltaTicketPercent >= 0 ? '+' : ''}${deltaTicketPercent.toFixed(1)}%`,
      impactoPercent: deltaTicketPercent,
      cobertura: pedidos,
      confianca: confidenceFromCoverage(pedidos),
      acao: {
        texto: deltaTicketPercent < 0 ? 'Estimular upsell e kits' : 'Aumentar oferta premium',
        urgencia: 'semana',
      },
    });
  }

  if (typeof mediaMovel4w === 'number' && mediaMovel4w > 0) {
    const deltaMedia = ((mediaDiaria - mediaMovel4w) / mediaMovel4w) * 100;
    if (Math.abs(deltaMedia) >= 12) {
      pushCandidate({
        id: 'ritmo-vs-media-4w',
        tipo: deltaMedia < 0 ? 'alerta' : 'tendencia',
        origem: 'vendas',
        titulo: deltaMedia < 0 ? 'Ritmo abaixo da media 4 semanas' : 'Ritmo acima da media 4 semanas',
        descricao: `Media diaria ${deltaMedia < 0 ? 'abaixo' : 'acima'} ${Math.abs(deltaMedia).toFixed(1)}% da media 4 semanas.`,
        evidencia: `${deltaMedia >= 0 ? '+' : ''}${deltaMedia.toFixed(1)}%`,
        impactoValor: mediaDiaria - mediaMovel4w,
        impactoPercent: deltaMedia,
        cobertura: pedidos,
        confianca: confidenceFromCoverage(pedidos),
        acao: {
          texto: deltaMedia < 0 ? 'Reforcar captacao' : 'Manter o ritmo atual',
          urgencia: deltaMedia < 0 ? 'hoje' : 'monitorar',
        },
      });
    }
  }

  if (canais.length) {
    const topChannel = canais[0];
    if (topChannel.participacao >= 70) {
      pushCandidate({
        id: `canal-dominante-${topChannel.canal}`,
        tipo: 'alerta',
        origem: 'canais',
        titulo: `Dependencia em ${topChannel.canal}`,
        descricao: `${topChannel.canal} concentra ${topChannel.participacao.toFixed(0)}% da receita no periodo.`,
        evidencia: `${topChannel.participacao.toFixed(0)}%`,
        impactoPercent: topChannel.participacao,
        cobertura: topChannel.pedidos,
        confianca: confidenceFromCoverage(topChannel.pedidos),
        acao: {
          texto: 'Diversificar canais e campanhas',
          urgencia: 'semana',
        },
      });
    }

    canais.slice(0, 3).forEach((canal) => {
      if (typeof canal.deltaPercent === 'number' && canal.deltaPercent <= -15) {
        pushCandidate({
          id: `canal-queda-${canal.canal}`,
          tipo: 'alerta',
          origem: 'canais',
          titulo: `Canal ${canal.canal} em queda`,
          descricao: `${canal.canal} recuou ${Math.abs(canal.deltaPercent).toFixed(1)}% vs periodo anterior.`,
          evidencia: `${canal.deltaPercent.toFixed(1)}%`,
          impactoValor: canal.receita,
          impactoPercent: canal.deltaPercent,
          cobertura: canal.pedidos,
          confianca: confidenceFromCoverage(canal.pedidos),
          acao: {
            texto: `Ajustar mix em ${canal.canal}`,
            urgencia: 'hoje',
          },
        });
      }
    });
  }

  if (bestWeekday && worstWeekday && dailyMean > 0) {
    const bestDelta = ((bestWeekday.media - dailyMean) / dailyMean) * 100;
    const worstDelta = ((dailyMean - worstWeekday.media) / dailyMean) * 100;
    if (bestDelta >= 18 && bestWeekday.dias >= 2) {
      pushCandidate({
        id: 'melhor-dia-semana',
        tipo: 'oportunidade',
        origem: 'vendas',
        titulo: `${DIAS_SEMANA[bestWeekday.dow]} e o melhor dia`,
        descricao: `${DIAS_SEMANA[bestWeekday.dow]} rende ${bestDelta.toFixed(0)}% acima da media diaria.`,
        evidencia: formatCompactCurrency(bestWeekday.media),
        impactoPercent: bestDelta,
        cobertura: bestWeekday.dias,
        confianca: confidenceFromCoverage(pedidos),
        acao: {
          texto: 'Concentrar campanhas nesse dia',
          urgencia: 'semana',
        },
      });
    }
    if (worstDelta >= 18 && worstWeekday.dias >= 2) {
      pushCandidate({
        id: 'pior-dia-semana',
        tipo: 'alerta',
        origem: 'vendas',
        titulo: `${DIAS_SEMANA[worstWeekday.dow]} e o dia mais fraco`,
        descricao: `${DIAS_SEMANA[worstWeekday.dow]} fica ${worstDelta.toFixed(0)}% abaixo da media diaria.`,
        evidencia: formatCompactCurrency(worstWeekday.media),
        impactoPercent: -worstDelta,
        cobertura: worstWeekday.dias,
        confianca: confidenceFromCoverage(pedidos),
        acao: {
          texto: 'Testar incentivo nesse dia',
          urgencia: 'semana',
        },
      });
    }
  }

  if (dailyCv >= 0.6 && dailyMean > 0) {
    pushCandidate({
      id: 'volatilidade-vendas',
      tipo: 'alerta',
      origem: 'vendas',
      titulo: 'Vendas muito volateis no periodo',
      descricao: `Oscilacao diaria alta (CV ${(dailyCv * 100).toFixed(0)}%).`,
      evidencia: `${(dailyCv * 100).toFixed(0)}%`,
      impactoPercent: undefined,
      cobertura: dias,
      confianca: confidenceFromCoverage(pedidos),
      acao: {
        texto: 'Estabilizar campanhas e estoque',
        urgencia: 'semana',
      },
    });
  }

  const topProdutos = produtosWithStock.slice(0, 6);
  topProdutos.forEach((produto) => {
    if (produto.estoque === null) return;
    const estoque = produto.estoque ?? 0;
    const mediaDiaria = dias > 0 ? produto.quantidade / dias : 0;
    if (estoque <= 0 && produto.receita > 0) {
      pushCandidate({
        id: `produto-sem-estoque-${produto.sku}`,
        tipo: 'urgente',
        origem: 'estoque',
        titulo: `Ruptura no SKU ${produto.sku}`,
        descricao: `${produto.nome} vendeu ${produto.quantidade.toFixed(0)} un, mas estoque zerado.`,
        evidencia: `${produto.quantidade.toFixed(0)} un`,
        impactoValor: produto.receita,
        impactoPercent: produto.deltaPercent ?? undefined,
        cobertura: produto.quantidade,
        confianca: confidenceFromCoverage(produto.quantidade),
        acao: {
          texto: 'Repor estoque prioritario',
          urgencia: 'agora',
        },
      });
    } else if (mediaDiaria > 0 && estoque > 0 && estoque < mediaDiaria * 7) {
      pushCandidate({
        id: `produto-estoque-baixo-${produto.sku}`,
        tipo: 'alerta',
        origem: 'estoque',
        titulo: `Estoque baixo em ${produto.sku}`,
        descricao: `${produto.nome} vende ${mediaDiaria.toFixed(1)} un/dia e tem ${estoque.toFixed(0)} un.`,
        evidencia: `${estoque.toFixed(0)} un`,
        impactoValor: produto.receita,
        impactoPercent: produto.deltaPercent ?? undefined,
        cobertura: produto.quantidade,
        confianca: confidenceFromCoverage(produto.quantidade),
        acao: {
          texto: 'Repor estoque em ate 7 dias',
          urgencia: 'semana',
        },
      });
    }
  });

  if (produtosWithStock.length && receita > 0) {
    const topProduto = produtosWithStock[0];
    const share = (topProduto.receita / receita) * 100;
    if (share >= 25) {
      pushCandidate({
        id: `produto-concentracao-${topProduto.sku}`,
        tipo: 'alerta',
        origem: 'produtos',
        titulo: `SKU ${topProduto.sku} concentra receita`,
        descricao: `${topProduto.nome} responde por ${share.toFixed(0)}% da receita no periodo.`,
        evidencia: `${share.toFixed(0)}%`,
        impactoPercent: share,
        impactoValor: topProduto.receita,
        cobertura: topProduto.quantidade,
        confianca: confidenceFromCoverage(topProduto.quantidade),
        acao: {
          texto: 'Proteger estoque desse SKU',
          urgencia: 'semana',
        },
      });
    }
  }

  if (outOfStockCount > 0) {
    pushCandidate({
      id: 'estoque-rupturas',
      tipo: outOfStockCount >= 5 ? 'urgente' : 'alerta',
      origem: 'estoque',
      titulo: 'Produtos sem estoque',
      descricao: `${outOfStockCount} produtos ativos estao sem estoque no momento.`,
      evidencia: `${outOfStockCount} SKUs`,
      impactoPercent: undefined,
      cobertura: outOfStockCount,
      confianca: confidenceFromCoverage(outOfStockCount),
      acao: {
        texto: 'Repor SKUs criticos',
        urgencia: outOfStockCount >= 5 ? 'agora' : 'semana',
      },
    });
  }

  if (lowStockCount >= 6) {
    pushCandidate({
      id: 'estoque-baixo',
      tipo: 'alerta',
      origem: 'estoque',
      titulo: 'Estoque baixo em varios SKUs',
      descricao: `${lowStockCount} produtos com estoque abaixo do minimo operacional.`,
      evidencia: `${lowStockCount} SKUs`,
      impactoPercent: undefined,
      cobertura: lowStockCount,
      confianca: confidenceFromCoverage(lowStockCount),
      acao: {
        texto: 'Planejar reposicao',
        urgencia: 'semana',
      },
    });
  }

  const produtoEmQueda = produtosWithStock.find((produto) => typeof produto.deltaPercent === 'number' && produto.deltaPercent <= -25);
  if (produtoEmQueda) {
    pushCandidate({
      id: `produto-queda-${produtoEmQueda.sku}`,
      tipo: 'alerta',
      origem: 'produtos',
      titulo: `SKU ${produtoEmQueda.sku} em queda`,
      descricao: `${produtoEmQueda.nome} caiu ${Math.abs(produtoEmQueda.deltaPercent || 0).toFixed(1)}% vs periodo anterior.`,
      evidencia: `${produtoEmQueda.deltaPercent?.toFixed(1)}%`,
      impactoValor: produtoEmQueda.receita,
      impactoPercent: produtoEmQueda.deltaPercent ?? undefined,
      cobertura: produtoEmQueda.quantidade,
      confianca: confidenceFromCoverage(produtoEmQueda.quantidade),
      acao: {
        texto: 'Rever preco ou campanha',
        urgencia: 'semana',
      },
    });
  }

  if (fretePercentual >= 15) {
    pushCandidate({
      id: 'frete-peso',
      tipo: fretePercentual >= 20 ? 'alerta' : 'tendencia',
      origem: 'frete',
      titulo: 'Frete pressionando margem',
      descricao: `Frete representa ${fretePercentual.toFixed(1)}% da receita no periodo.`,
      evidencia: `${fretePercentual.toFixed(1)}%`,
      impactoValor: freteTotal,
      impactoPercent: fretePercentual,
      cobertura: pedidos,
      confianca: confidenceFromCoverage(pedidos),
      acao: {
        texto: 'Revisar politica de frete',
        urgencia: 'semana',
      },
    });
  }

  if (descontoPercentual >= 12) {
    pushCandidate({
      id: 'descontos-elevados',
      tipo: descontoPercentual >= 20 ? 'alerta' : 'tendencia',
      origem: 'vendas',
      titulo: 'Descontos elevados no periodo',
      descricao: `Descontos representam ${descontoPercentual.toFixed(1)}% da receita.`,
      evidencia: `${descontoPercentual.toFixed(1)}%`,
      impactoValor: descontoTotal,
      impactoPercent: descontoPercentual,
      cobertura: pedidos,
      confianca: confidenceFromCoverage(pedidos),
      acao: {
        texto: 'Rever politica de descontos',
        urgencia: 'semana',
      },
    });
  }

  if (taxaPercentual !== null && taxaPercentual >= 12 && paymentsCount >= 10) {
    pushCandidate({
      id: 'taxas-marketplace',
      tipo: taxaPercentual >= 18 ? 'alerta' : 'tendencia',
      origem: 'pagamentos',
      titulo: 'Taxas de marketplace altas',
      descricao: `Taxas consomem ${taxaPercentual.toFixed(1)}% dos pagamentos no periodo.`,
      evidencia: `${taxaPercentual.toFixed(1)}%`,
      impactoValor: taxas,
      impactoPercent: taxaPercentual,
      cobertura: paymentsCount,
      confianca: confidenceFromCoverage(paymentsCount),
      acao: {
        texto: 'Revisar comissoes e campanhas',
        urgencia: 'semana',
      },
    });
  }

  if (naoConciliados >= 5) {
    pushCandidate({
      id: 'pagamentos-nao-conciliados',
      tipo: naoConciliados >= 10 ? 'urgente' : 'alerta',
      origem: 'pagamentos',
      titulo: 'Pagamentos sem conciliacao',
      descricao: `${naoConciliados} pagamentos sem vinculo com pedidos Tiny.`,
      evidencia: `${naoConciliados} pendentes`,
      cobertura: naoConciliados,
      confianca: confidenceFromCoverage(naoConciliados),
      acao: {
        texto: 'Auditar conciliacao de pagamentos',
        urgencia: 'hoje',
      },
    });
  }

  if (pedidosSemPagamento >= 8) {
    pushCandidate({
      id: 'pedidos-sem-pagamento',
      tipo: pedidosSemPagamento >= 20 ? 'urgente' : 'alerta',
      origem: 'pagamentos',
      titulo: 'Pedidos sem pagamento recebido',
      descricao: `${pedidosSemPagamento} pedidos nao marcados como pagos no periodo.`,
      evidencia: `${pedidosSemPagamento} pedidos`,
      cobertura: pedidosSemPagamento,
      confianca: confidenceFromCoverage(pedidosSemPagamento),
      acao: {
        texto: 'Checar repasse do marketplace',
        urgencia: 'hoje',
      },
    });
  }

  if (paymentsCount >= 10 && receita > 0) {
    const repasseRatio = pagamentosLiquido / receita;
    if (repasseRatio <= 0.7) {
      pushCandidate({
        id: 'repasse-baixo',
        tipo: repasseRatio <= 0.55 ? 'alerta' : 'tendencia',
        origem: 'pagamentos',
        titulo: 'Repasse abaixo da receita',
        descricao: `Repasse liquido equivale a ${(repasseRatio * 100).toFixed(0)}% da receita do periodo.`,
        evidencia: `${(repasseRatio * 100).toFixed(0)}%`,
        impactoValor: pagamentosLiquido - receita,
        impactoPercent: (repasseRatio - 1) * 100,
        cobertura: paymentsCount,
        confianca: confidenceFromCoverage(paymentsCount),
        acao: {
          texto: 'Conferir taxas e ajustes',
          urgencia: 'semana',
        },
      });
    }
  }

  const fluxoLiquido = totalIncome - totalExpense;
  if (fluxoLiquido < 0) {
    pushCandidate({
      id: 'fluxo-negativo',
      tipo: 'alerta',
      origem: 'financeiro',
      titulo: 'Fluxo de caixa negativo',
      descricao: `Saidas superam entradas em ${formatCurrency(Math.abs(fluxoLiquido))} no periodo.`,
      evidencia: formatCurrency(fluxoLiquido),
      impactoValor: fluxoLiquido,
      impactoPercent: undefined,
      cobertura: paidEntries.length,
      confianca: confidenceFromCoverage(paidEntries.length),
      acao: {
        texto: 'Rever despesas e prazos',
        urgencia: 'semana',
      },
    });
  }

  if (pendingPayables > pendingReceivables * 1.4 && pendingPayables > 0) {
    pushCandidate({
      id: 'pendencias-financeiras',
      tipo: 'alerta',
      origem: 'financeiro',
      titulo: 'Pendencias a pagar acima do receber',
      descricao: `Pendencias a pagar superam recebimentos em ${formatCurrency(pendingPayables - pendingReceivables)}.`,
      evidencia: formatCurrency(pendingPayables),
      impactoValor: pendingPayables - pendingReceivables,
      impactoPercent: undefined,
      cobertura: pendingEntries.length,
      confianca: confidenceFromCoverage(pendingEntries.length),
      acao: {
        texto: 'Negociar prazos de pagamento',
        urgencia: 'semana',
      },
    });
  }

  const situacaoMap = new Map<number, number>();
  orders.forEach((order) => {
    if (typeof order.situacao !== 'number') return;
    situacaoMap.set(order.situacao, (situacaoMap.get(order.situacao) || 0) + 1);
  });

  const cancelados = situacaoMap.get(2) || 0;
  const incompletos = situacaoMap.get(8) || 0;
  const naoEntregues = situacaoMap.get(9) || 0;
  const totalPedidos = orders.length || 1;
  const cancelShare = (cancelados + incompletos + naoEntregues) / totalPedidos * 100;

  if (cancelShare >= 8) {
    pushCandidate({
      id: 'pedidos-problematicos',
      tipo: cancelShare >= 15 ? 'urgente' : 'alerta',
      origem: 'dados',
      titulo: 'Pedidos com status critico',
      descricao: `${(cancelados + incompletos + naoEntregues)} pedidos em cancelado/dados incompletos/nao entregue.`,
      evidencia: `${cancelShare.toFixed(1)}%`,
      impactoPercent: cancelShare,
      cobertura: cancelados + incompletos + naoEntregues,
      confianca: confidenceFromCoverage(totalPedidos),
      acao: {
        texto: 'Rever fluxo de pedidos e pos-venda',
        urgencia: 'hoje',
      },
    });
  }

  const sinais = buildSinais(
    {
      receita,
      receitaLiquida,
      pedidos,
      ticketMedio,
      ticketMedioAnterior,
      freteTotal,
      fretePercentual,
      descontoTotal,
      descontoPercentual,
      mediaDiaria,
      mediaMovel4w,
      receitaAnterior,
      pedidosAnterior,
      deltaReceitaPercent,
      deltaPedidosPercent,
      deltaTicketPercent,
    },
    canais
  );

  const index: DbInsightIndex = {
    periodo: { inicio, fim, dias },
    filtros: { canais: input.canais ?? null, situacoes: input.situacoes ?? null },
    resumo: {
      receita,
      receitaLiquida,
      pedidos,
      ticketMedio,
      ticketMedioAnterior,
      freteTotal,
      fretePercentual,
      descontoTotal,
      descontoPercentual,
      mediaDiaria,
      mediaMovel4w,
      receitaAnterior,
      pedidosAnterior,
      deltaReceitaPercent,
      deltaPedidosPercent,
      deltaTicketPercent,
    },
    canais,
    produtos: produtosWithStock,
    pagamentos: {
      bruto: pagamentosBruto,
      liquido: pagamentosLiquido,
      taxas,
      pendentes: pendingPayables,
      naoConciliados,
      pedidosSemPagamento,
      count: paymentsCount,
      taxaPercentual,
    },
    qualidade: {
      status: qualidadeStatus,
      alertas: qualityAlerts,
    },
    candidates,
    sinais,
    generatedAt: new Date().toISOString(),
  };

  INDEX_CACHE.set(cacheKey, { data: index, expiresAt: Date.now() + CACHE_TTL_MS });
  return index;
}
