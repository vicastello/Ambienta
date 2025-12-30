import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type ProdutosContextSummary = {
  total: number;
  lowStock: number;
  outOfStock: number;
};

export type PedidosContextSummary = {
  totalPedidos: number;
  totalValor: number;
  canaisTop: Array<{ canal: string; totalValor: number; totalPedidos: number }>;
  situacoesTop: Array<{ situacao: number; totalPedidos: number }>;
  periodo: { inicio: string; fim: string };
};

export type FinanceiroContextSummary = {
  periodo: { inicio: string; fim: string };
  receitaBruta: number;
  receitaLiquida: number;
  frete: number;
};

export type DashboardContextSummary = {
  periodo: { inicio: string; fim: string };
  totalPedidos: number;
  totalValor: number;
  totalValorLiquido: number;
  totalFreteTotal: number;
  ticketMedio: number;
  vendasPorDia: Array<{ dia: string; totalDia: number }>;
  previousTotalValor: number;
  deltaPercent: number;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const buildDailySeries = (inicio: string, fim: string) => {
  const start = new Date(`${inicio}T00:00:00`);
  const end = new Date(`${fim}T00:00:00`);
  const series = new Map<string, number>();
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    series.set(isoDate(cursor), 0);
  }
  return series;
};

export async function getProdutosContextSummary(): Promise<ProdutosContextSummary> {
  const admin = supabaseAdmin as any;

  const { count: total, error: totalError } = await admin
    .from('tiny_produtos')
    .select('id_produto_tiny', { count: 'exact', head: true });
  if (totalError) throw totalError;

  const { count: lowStock, error: lowStockError } = await admin
    .from('tiny_produtos')
    .select('id_produto_tiny', { count: 'exact', head: true })
    .lte('disponivel', 5);
  if (lowStockError) throw lowStockError;

  const { count: outOfStock, error: outOfStockError } = await admin
    .from('tiny_produtos')
    .select('id_produto_tiny', { count: 'exact', head: true })
    .lte('disponivel', 0);
  if (outOfStockError) throw outOfStockError;

  return {
    total: total ?? 0,
    lowStock: lowStock ?? 0,
    outOfStock: outOfStock ?? 0,
  };
}

export async function getDashboardContextSummary(days: number = 7): Promise<DashboardContextSummary> {
  const admin = supabaseAdmin as any;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  const inicio = isoDate(start);
  const fim = isoDate(end);
  const endExclusive = isoDate(addDays(end, 1));

  const { data, error } = await admin
    .from('tiny_orders')
    .select('data_criacao, valor, valor_frete')
    .gte('data_criacao', inicio)
    .lt('data_criacao', endExclusive);

  if (error) throw error;

  const rows = (data || []) as Array<{
    data_criacao: string | null;
    valor: number | null;
    valor_frete: number | null;
  }>;

  const totalPedidos = rows.length;
  const totalValor = rows.reduce((acc, item) => acc + (item.valor || 0), 0);
  const totalFreteTotal = rows.reduce((acc, item) => acc + (item.valor_frete || 0), 0);
  const totalValorLiquido = totalValor - totalFreteTotal;
  const ticketMedio = totalPedidos > 0 ? totalValor / totalPedidos : 0;

  const dailySeries = buildDailySeries(inicio, fim);
  rows.forEach((item) => {
    if (!item.data_criacao) return;
    const dia = item.data_criacao.slice(0, 10);
    if (!dailySeries.has(dia)) return;
    dailySeries.set(dia, (dailySeries.get(dia) ?? 0) + (item.valor || 0));
  });

  const vendasPorDia = Array.from(dailySeries.entries()).map(([dia, totalDia]) => ({
    dia,
    totalDia,
  }));

  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -1 * (days - 1));
  const prevInicio = isoDate(prevStart);
  const prevFim = isoDate(prevEnd);
  const prevEndExclusive = isoDate(addDays(prevEnd, 1));

  const { data: prevData, error: prevError } = await admin
    .from('tiny_orders')
    .select('valor')
    .gte('data_criacao', prevInicio)
    .lt('data_criacao', prevEndExclusive);

  if (prevError) throw prevError;

  const previousTotalValor = (prevData || []).reduce(
    (acc: number, item: { valor: number | null }) => acc + (item.valor || 0),
    0
  );
  const deltaPercent = previousTotalValor > 0 ? ((totalValor - previousTotalValor) / previousTotalValor) * 100 : 0;

  return {
    periodo: { inicio, fim },
    totalPedidos,
    totalValor,
    totalValorLiquido,
    totalFreteTotal,
    ticketMedio,
    vendasPorDia,
    previousTotalValor,
    deltaPercent,
  };
}

export async function getPedidosContextSummary(days: number = 7): Promise<PedidosContextSummary> {
  const admin = supabaseAdmin as any;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  const inicio = isoDate(start);
  const fim = isoDate(end);

  const { data, error } = await admin
    .from('tiny_orders')
    .select('valor, canal, situacao, data_criacao')
    .gte('data_criacao', inicio)
    .lte('data_criacao', fim);

  if (error) throw error;

  const pedidos = (data || []) as Array<{ valor: number | null; canal: string | null; situacao: number | null }>;
  const totalPedidos = pedidos.length;
  const totalValor = pedidos.reduce((acc, item) => acc + (item.valor || 0), 0);

  const canaisMap = new Map<string, { totalValor: number; totalPedidos: number }>();
  const situacoesMap = new Map<number, number>();

  pedidos.forEach((pedido) => {
    const canal = pedido.canal || 'Outros';
    const canalRow = canaisMap.get(canal) ?? { totalValor: 0, totalPedidos: 0 };
    canalRow.totalValor += pedido.valor || 0;
    canalRow.totalPedidos += 1;
    canaisMap.set(canal, canalRow);

    if (typeof pedido.situacao === 'number') {
      situacoesMap.set(pedido.situacao, (situacoesMap.get(pedido.situacao) ?? 0) + 1);
    }
  });

  const canaisTop = Array.from(canaisMap.entries())
    .map(([canal, info]) => ({ canal, ...info }))
    .sort((a, b) => b.totalValor - a.totalValor)
    .slice(0, 5);

  const situacoesTop = Array.from(situacoesMap.entries())
    .map(([situacao, totalPedidos]) => ({ situacao, totalPedidos }))
    .sort((a, b) => b.totalPedidos - a.totalPedidos)
    .slice(0, 5);

  return {
    totalPedidos,
    totalValor,
    canaisTop,
    situacoesTop,
    periodo: { inicio, fim },
  };
}

export async function getFinanceiroContextSummary(days: number = 30): Promise<FinanceiroContextSummary> {
  const admin = supabaseAdmin as any;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  const inicio = isoDate(start);
  const fim = isoDate(end);

  const { data, error } = await admin
    .from('tiny_orders')
    .select('valor, valor_frete')
    .gte('data_criacao', inicio)
    .lte('data_criacao', fim);

  if (error) throw error;

  const pedidos = (data || []) as Array<{ valor: number | null; valor_frete: number | null }>;
  const receitaBruta = pedidos.reduce((acc, item) => acc + (item.valor || 0), 0);
  const frete = pedidos.reduce((acc, item) => acc + (item.valor_frete || 0), 0);
  const receitaLiquida = receitaBruta - frete;

  return {
    periodo: { inicio, fim },
    receitaBruta,
    receitaLiquida,
    frete,
  };
}
