// app/api/tiny/dashboard/resumo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { listarPedidosTiny, listarPedidosTinyPorPeriodo, TinyApiError, TinyPedidoListaItem } from '@/lib/tinyApi';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { extrairDataISO, normalizarCanalTiny, parseValorTiny, descricaoSituacao, TODAS_SITUACOES } from '@/lib/tinyMapping';

type DiaResumo = {
  data: string; // yyyy-mm-dd
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
  totalValorLiquido: number; // sem frete
  totalFreteTotal: number; // total de frete
  ticketMedio: number;
  vendasPorDia: DiaResumo[];
  pedidosPorSituacao: SituacaoResumo[];
};

type CanalResumo = {
  canal: string;
  totalValor: number;
  totalPedidos: number;
};

type DashboardResposta = {
  periodoAtual: PeriodoResumo;
  periodoAnterior: PeriodoResumo;
  periodoAnteriorCards: PeriodoResumo;
  canais: CanalResumo[];
  canaisDisponiveis: string[];
  situacoesDisponiveis: Array<{ codigo: number; descricao: string }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function diffDias(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}
function addDias(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * DAY_MS);
}

// Extrai valores bruto/líquido/frete do JSON bruto do Tiny
// Usa valorTotalPedido (bruto), valorTotalProdutos (líquido), frete = diferença
function extrairValoresDoTiny(raw: any): { bruto: number; liquido: number; frete: number } {
  if (!raw) return { bruto: 0, liquido: 0, frete: 0 };
  try {
    // Faturamento Bruto = valorTotalPedido (do endpoint detalhado)
    // Se não houver, tenta usar 'valor' do endpoint de lista
    const bruto = Number(raw.valorTotalPedido) || Number(raw.valor) || 0;
    
    // Frete = usa valorFrete diretamente (prioridade 1)
    // Se não houver valorFrete mas temos valorTotalProdutos, calcula: bruto - liquido
    let frete = 0;
    let liquido = 0;
    let temDadosEnriquecidos = false;
    
    if (raw.valorFrete !== undefined && raw.valorFrete !== null) {
      // Use stored valorFrete directly
      frete = Number(raw.valorFrete) || 0;
      // Faturamento Líquido = Bruto - Frete
      liquido = bruto > 0 ? bruto - frete : 0;
      temDadosEnriquecidos = true;
    } else if (raw.valorTotalProdutos !== undefined && raw.valorTotalProdutos !== null) {
      // Calculate frete from difference
      liquido = Number(raw.valorTotalProdutos) || 0;
      frete = bruto > 0 && liquido > 0 ? Math.max(0, bruto - liquido) : 0;
      temDadosEnriquecidos = true;
    } else {
      // No detailed data available - treat as no frete but bruto is the full value
      liquido = bruto > 0 ? bruto : 0;
      frete = 0;
      temDadosEnriquecidos = false;
    }
    
    return {
      bruto: bruto > 0 ? bruto : 0,
      liquido: liquido > 0 ? liquido : 0,
      frete: frete > 0 ? frete : 0,
    };
  } catch {
    return { bruto: 0, liquido: 0, frete: 0 };
  }
}

// Função legada mantida para compatibilidade
function extrairFrete(raw: any): number {
  const { frete } = extrairValoresDoTiny(raw);
  return frete;
}

/**
 * Batch fetch frete from detailed endpoint (com timeout para não bloquear)
 * Atualiza raw JSON no banco com valorFrete
 * Agora é sincronous com timeout!
 */
/**
 * Batch fetch frete from detailed endpoint (com timeout para não bloquear)
 * Atualiza raw JSON no banco com valorFrete
 * Agora é sincronous com timeout!
 */
async function enrichOrdersWithFrete(
  accessToken: string,
  orderIds: number[],
  maxToFetch: number = 50
): Promise<void> {
  // TODO: Implement frete enrichment in separate sync job
  // For now, returning without doing anything to avoid blocking
  return;
}

export async function GET(req: NextRequest) {
  try {
    // Token
    let accessToken = req.cookies.get('tiny_access_token')?.value || null;
    if (!accessToken) {
      try { accessToken = await getAccessTokenFromDbOrRefresh(); } catch { accessToken = null; }
    }

    const { searchParams } = new URL(req.url);
    const dataInicialParam = searchParams.get('dataInicial');
    const dataFinalParam = searchParams.get('dataFinal');
    const diasParam = searchParams.get('dias');
    const canaisParam = searchParams.get('canais');
    const situacoesParam = searchParams.get('situacoes');
    const complementParam = searchParams.get('complement');
    const doComplement = complementParam === '1' || complementParam === 'true';

    const hoje = new Date();
    const dataFinalDate = dataFinalParam ? new Date(`${dataFinalParam}T00:00:00`) : hoje;
    const dataInicialDate = dataInicialParam ? new Date(`${dataInicialParam}T00:00:00`) : addDias(dataFinalDate, -1 * ((diasParam ? Number(diasParam) : 30) - 1));

    const diasPeriodo = diffDias(dataInicialDate, dataFinalDate) >= 0 ? diffDias(dataInicialDate, dataFinalDate) + 1 : 1;
    
    // Período anterior: mês anterior completo
    // Ex: se período atual é 01/11 a 30/11 (nov), período anterior é 01/10 a 31/10 (out)
    // Se período atual é 01/12 a 25/12, período anterior é 01/11 a 30/11 (nov inteiro)
    const dataInicialAnteriorDate = new Date(dataInicialDate);
    dataInicialAnteriorDate.setMonth(dataInicialAnteriorDate.getMonth() - 1);
    dataInicialAnteriorDate.setDate(1); // Sempre primeiro dia do mês anterior
    
    const dataFinalAnteriorDate = new Date(dataInicialAnteriorDate);
    dataFinalAnteriorDate.setMonth(dataFinalAnteriorDate.getMonth() + 1); // Vai pro próximo mês
    dataFinalAnteriorDate.setDate(0); // Volta pro último dia do mês anterior

    // Strings apenas com data (yyyy-mm-dd) para queries
    const dataInicialStr = dataInicialDate.toISOString().slice(0, 10);
    const dataFinalStr = dataFinalDate.toISOString().slice(0, 10);
    const dataInicialAnteriorStr = dataInicialAnteriorDate.toISOString().slice(0, 10);
    const dataFinalAnteriorStr = dataFinalAnteriorDate.toISOString().slice(0, 10);

    // Strings com timestamp para queries rangadas (início e fim do dia)
    const dataInicialISO = `${dataInicialStr}T00:00:00Z`;
    const dataFinalISO = `${dataFinalStr}T23:59:59Z`;
    const dataInicialAnteriorISO = `${dataInicialAnteriorStr}T00:00:00Z`;
    const dataFinalAnteriorISO = `${dataFinalAnteriorStr}T23:59:59Z`;

    const limiteInferiorStr = dataInicialAnteriorStr; // janela unificada p/ complemento

    const canaisFiltro = canaisParam ? canaisParam.split(',').filter(Boolean) : null;
    const situacoesFiltro = situacoesParam ? situacoesParam.split(',').map((s) => Number(s)).filter((n) => Number.isFinite(n)) : null;

    // =========================
    // 1) Tentar complementar do Tiny e salvar no banco (opcional via query)
    // =========================
    // DEPRECATED: Complement logic disabled
    // Data is now synced continuously via POST /api/tiny/pedidos
    // and enriched via background jobs
    // =========================

    if (false && doComplement) {
      // This block is disabled to avoid unnecessary API calls
      // All data synchronization now happens through:
      // 1. POST /api/tiny/pedidos - syncs list data with merge logic
      // 2. GET /api/tiny/sync/enrich-background - enriches with detailed data
    }

    // =========================
    // 2) Carregar do banco e agrupar métricas (DB-first)
    // =========================
    // Query período atual e anterior com paginação separada para evitar truncar na fronteira
    
    const orders: any[] = [];
    
    // Função helper para paginar uma query
    const fetchAllOrdersForPeriod = async (dataInicial: string, dataFinal: string) => {
      const allOrdersForPeriod: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore && offset < 10000) {
        const { data: pageOrders, error: pageError } = await supabaseAdmin
          .from('tiny_orders')
          .select('tiny_id, data_criacao, valor, situacao, canal, raw')
          .gte('data_criacao', dataInicial)
          .lte('data_criacao', dataFinal)
          .order('id', { ascending: true })
          .range(offset, offset + 999);

        if (pageError) {
          throw new Error('Erro ao carregar pedidos do banco: ' + pageError.message);
        }

        if (!pageOrders || pageOrders.length === 0) {
          hasMore = false;
        } else {
          allOrdersForPeriod.push(...pageOrders);
          offset += 1000;
          if (pageOrders.length < 1000) hasMore = false;
        }
      }

      return allOrdersForPeriod;
    };

    // Busca período anterior e período atual separadamente
    const ordersAnterior = await fetchAllOrdersForPeriod(dataInicialAnteriorISO, dataFinalAnteriorISO);
    const ordersAtual = await fetchAllOrdersForPeriod(dataInicialISO, dataFinalISO);
    
    console.log(`[DEBUG] Período anterior (${dataInicialAnteriorStr} a ${dataFinalAnteriorStr}): ${ordersAnterior.length} pedidos`);
    console.log(`[DEBUG] Período atual (${dataInicialStr} a ${dataFinalStr}): ${ordersAtual.length} pedidos`);

    const mapaDiaAtual = new Map<string, { quantidade: number; totalDia: number }>();
    const mapaDiaAnterior = new Map<
      string,
      { quantidade: number; totalDia: number }
    >();

    const mapaSitAtual = new Map<number, number>();
    const mapaSitAnterior = new Map<number, number>();

    const mapaCanalAtual = new Map<string, { totalValor: number; totalPedidos: number }>();

    const canaisDisponiveisSet = new Set<string>();
    const situacoesDisponiveisSet = new Set<number>();

    let totalPedidosAtual = 0;
    let totalValorAtual = 0;      // valor bruto
    let totalValorLiquidoAtual = 0; // valor líquido (sem frete)
    let totalFreteAtual = 0;

    let totalPedidosAnterior = 0;
    let totalValorAnterior = 0;      // valor bruto
    let totalValorLiquidoAnterior = 0; // valor líquido (sem frete)
    let totalFreteAnterior = 0;

    // Processa período anterior
    for (const p of ordersAnterior ?? []) {
      const data = p.data_criacao as string | null;
      if (!data) continue;

      const { bruto, liquido, frete } = extrairValoresDoTiny((p as any).raw);
      const valor = bruto > 0 ? bruto : Number(p.valor) || 0;
      const situacao = typeof p.situacao === 'number' ? p.situacao : -1;
      const canal = normalizarCanalTiny((p as any).canal ?? null);

      // Registra canais e situações disponíveis
      canaisDisponiveisSet.add(canal);
      situacoesDisponiveisSet.add(situacao);

      const passaCanal =
        !canaisFiltro || canaisFiltro.length === 0
          ? true
          : canaisFiltro.includes(canal);

      const passaSituacao =
        !situacoesFiltro || situacoesFiltro.length === 0
          ? true
          : situacoesFiltro.includes(situacao);

      if (!passaCanal || !passaSituacao) continue;

      totalPedidosAnterior += 1;
      totalValorAnterior += valor;
      totalValorLiquidoAnterior += liquido;
      totalFreteAnterior += frete;

      const diaInfoAnt =
        mapaDiaAnterior.get(data) ?? { quantidade: 0, totalDia: 0 };
      diaInfoAnt.quantidade += 1;
      diaInfoAnt.totalDia += valor;
      mapaDiaAnterior.set(data, diaInfoAnt);

      const qtdSitAnt = mapaSitAnterior.get(situacao) ?? 0;
      mapaSitAnterior.set(situacao, qtdSitAnt + 1);
    }

    // Processa período atual
    for (const p of ordersAtual ?? []) {
      const data = p.data_criacao as string | null;
      if (!data) continue;

      const { bruto, liquido, frete } = extrairValoresDoTiny((p as any).raw);
      const valor = bruto > 0 ? bruto : Number(p.valor) || 0;
      const situacao = typeof p.situacao === 'number' ? p.situacao : -1;
      const canal = normalizarCanalTiny((p as any).canal ?? null);

      // Registra canais e situações disponíveis
      canaisDisponiveisSet.add(canal);
      situacoesDisponiveisSet.add(situacao);

      const passaCanal =
        !canaisFiltro || canaisFiltro.length === 0
          ? true
          : canaisFiltro.includes(canal);

      const passaSituacao =
        !situacoesFiltro || situacoesFiltro.length === 0
          ? true
          : situacoesFiltro.includes(situacao);

      if (!passaCanal || !passaSituacao) continue;

      totalPedidosAtual += 1;
      totalValorAtual += valor;
      totalValorLiquidoAtual += liquido;
      totalFreteAtual += frete;

      const diaInfo =
        mapaDiaAtual.get(data) ?? { quantidade: 0, totalDia: 0 };
      diaInfo.quantidade += 1;
      diaInfo.totalDia += valor;
      mapaDiaAtual.set(data, diaInfo);

      const qtdSit = mapaSitAtual.get(situacao) ?? 0;
      mapaSitAtual.set(situacao, qtdSit + 1);

      const canalInfo =
        mapaCanalAtual.get(canal) ?? { totalValor: 0, totalPedidos: 0 };
      canalInfo.totalPedidos += 1;
      canalInfo.totalValor += valor;
      mapaCanalAtual.set(canal, canalInfo);
    }

    const vendasPorDiaAtual: DiaResumo[] = Array.from(mapaDiaAtual.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([data, info]) => ({
        data,
        quantidade: info.quantidade,
        totalDia: info.totalDia,
      }));

    const vendasPorDiaAnterior: DiaResumo[] = Array.from(
      mapaDiaAnterior.entries()
    )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([data, info]) => ({
        data,
        quantidade: info.quantidade,
        totalDia: info.totalDia,
      }));

    const pedidosPorSituacaoAtual: SituacaoResumo[] = Array.from(
      mapaSitAtual.entries()
    ).map(([situacao, quantidade]) => ({
      situacao,
      descricao: descricaoSituacao(situacao),
      quantidade,
    }));

    const pedidosPorSituacaoAnterior: SituacaoResumo[] = Array.from(
      mapaSitAnterior.entries()
    ).map(([situacao, quantidade]) => ({
      situacao,
      descricao: descricaoSituacao(situacao),
      quantidade,
    }));

    const canais: CanalResumo[] = Array.from(mapaCanalAtual.entries()).map(
      ([canal, info]) => ({
        canal,
        totalValor: info.totalValor,
        totalPedidos: info.totalPedidos,
      })
    );

    const periodoAtual: PeriodoResumo = {
      dataInicial: dataInicialStr,
      dataFinal: dataFinalStr,
      dias: diasPeriodo,
      totalPedidos: totalPedidosAtual,
      totalValor: totalValorAtual,
      totalValorLiquido: Math.max(0, totalValorAtual - totalFreteAtual),
      totalFreteTotal: totalFreteAtual,
      ticketMedio:
        totalPedidosAtual > 0 ? totalValorAtual / totalPedidosAtual : 0,
      vendasPorDia: vendasPorDiaAtual,
      pedidosPorSituacao: pedidosPorSituacaoAtual,
    };

    const periodoAnterior: PeriodoResumo = {
      dataInicial: dataInicialAnteriorStr,
      dataFinal: dataFinalAnteriorStr,
      dias: diasPeriodo,
      totalPedidos: totalPedidosAnterior,
      totalValor: totalValorAnterior,
      totalValorLiquido: Math.max(0, totalValorAnterior - totalFreteAnterior),
      totalFreteTotal: totalFreteAnterior,
      ticketMedio:
        totalPedidosAnterior > 0
          ? totalValorAnterior / totalPedidosAnterior
          : 0,
      vendasPorDia: vendasPorDiaAnterior,
      pedidosPorSituacao: pedidosPorSituacaoAnterior,
    };

    // Para os cards, calcular período anterior: mesmo dia/mês do mês anterior
    // Se período atual é 01/11 a 18/11 (18 dias), período anterior é 01/10 a 18/10 (18 dias)
    const dataInicialAnteriorCardsDate = new Date(dataInicialDate);
    dataInicialAnteriorCardsDate.setMonth(dataInicialAnteriorCardsDate.getMonth() - 1);
    const dataInicialAnteriorCardsStr = dataInicialAnteriorCardsDate.toISOString().slice(0, 10);
    
    const dataFinalAnteriorCardsDate = new Date(dataFinalDate);
    dataFinalAnteriorCardsDate.setMonth(dataFinalAnteriorCardsDate.getMonth() - 1);
    const dataFinalAnteriorCardsStr = dataFinalAnteriorCardsDate.toISOString().slice(0, 10);

    // Strings com timestamp para cards (início e fim do dia)
    const dataInicialAnteriorCardsISO = `${dataInicialAnteriorCardsStr}T00:00:00Z`;
    const dataFinalAnteriorCardsISO = `${dataFinalAnteriorCardsStr}T23:59:59Z`;

    // Carregar dados para cards do período anterior (até hoje do mês passado)
    const ordersAnteriorCards = await fetchAllOrdersForPeriod(dataInicialAnteriorCardsISO, dataFinalAnteriorCardsISO);
    let totalPedidosAnteriorCards = 0;
    let totalValorAnteriorCards = 0;
    let totalValorLiquidoAnteriorCards = 0;
    let totalFreteAnteriorCards = 0;
    const vendasPorDiaAnteriorCards: Map<string, DiaResumo> = new Map();
    const pedidosPorSituacaoAnteriorCards: Map<number, SituacaoResumo> = new Map();

    for (const order of ordersAnteriorCards) {
      const data = extrairDataISO(order.data_criacao);
      const valor = parseValorTiny(order.valor);
      const { bruto, liquido, frete } = extrairValoresDoTiny((order as any).raw);
      const valorFinal = bruto > 0 ? bruto : valor;
      const situacao = Number(order.situacao) || 0;
      const canal = normalizarCanalTiny(order.canal);

      totalPedidosAnteriorCards += 1;
      totalValorAnteriorCards += valorFinal;
      totalValorLiquidoAnteriorCards += liquido;
      totalFreteAnteriorCards += frete;

      if (data) {
        const diaKey = data;
        const current = vendasPorDiaAnteriorCards.get(diaKey) || { data: diaKey, quantidade: 0, totalDia: 0 };
        current.quantidade += 1;
        current.totalDia += valorFinal;
        vendasPorDiaAnteriorCards.set(diaKey, current);
      }

      const sitKey = situacao;
      const currentSit = pedidosPorSituacaoAnteriorCards.get(sitKey) || {
        situacao: sitKey,
        descricao: descricaoSituacao(sitKey),
        quantidade: 0,
      };
      currentSit.quantidade += 1;
      pedidosPorSituacaoAnteriorCards.set(sitKey, currentSit);
    }

    const periodoAnteriorCards: PeriodoResumo = {
      dataInicial: dataInicialAnteriorCardsStr,
      dataFinal: dataFinalAnteriorCardsStr,
      dias: diasPeriodo,
      totalPedidos: totalPedidosAnteriorCards,
      totalValor: totalValorAnteriorCards,
      totalValorLiquido: Math.max(0, totalValorAnteriorCards - totalFreteAnteriorCards),
      totalFreteTotal: totalFreteAnteriorCards,
      ticketMedio:
        totalPedidosAnteriorCards > 0
          ? totalValorAnteriorCards / totalPedidosAnteriorCards
          : 0,
      vendasPorDia: Array.from(vendasPorDiaAnteriorCards.values()),
      pedidosPorSituacao: Array.from(pedidosPorSituacaoAnteriorCards.values()),
    };

    const resposta: DashboardResposta = {
      periodoAtual,
      periodoAnterior,
      periodoAnteriorCards,
      canais,
      canaisDisponiveis: Array.from(canaisDisponiveisSet),
      situacoesDisponiveis: [...TODAS_SITUACOES],
    };

    return NextResponse.json(resposta);
  } catch (err: any) {
    console.error('[API] Erro em /api/tiny/dashboard/resumo', err);
    return NextResponse.json(
      {
        message: 'Erro ao montar resumo do dashboard',
        details: err?.message ?? 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}