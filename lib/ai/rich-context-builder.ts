/**
 * Rich Context Builder for AI Intelligence
 * Extracts comprehensive data with historical comparisons and trends
 */

export interface ChannelAnalysis {
    nome: string;
    faturamento: number;
    pedidos: number;
    ticketMedio: number;
    participacao: number; // % of total
    variacao7d: number | null; // vs last week same period
}

export interface ProductTrend {
    nome: string;
    sku?: string;
    quantidade: number;
    faturamento: number;
    variacao: number; // % change
}

export interface DayData {
    data: string;
    diaSemana: string;
    faturamento: number;
    pedidos: number;
}

export interface Anomaly {
    tipo: 'pico' | 'queda' | 'tendencia' | 'concentracao';
    descricao: string;
    impacto: 'positivo' | 'negativo' | 'neutro';
    valor?: number;
}

export interface RichDashboardContext {
    // Current period metrics
    periodo: {
        inicio: string;
        fim: string;
        dias: number;
    };

    metricas: {
        faturamento: number;
        faturamentoLiquido: number;
        pedidos: number;
        ticketMedio: number;
        produtosVendidos: number;
        cancelamentos: number; // percentage
        frete: number;
    };

    // Temporal comparisons
    comparativos: {
        vsAnterior: {
            faturamento: number | null; // % change
            pedidos: number | null;
            ticket: number | null;
        };
        tendencia7d: 'subindo' | 'estavel' | 'caindo' | 'volatil';
    };

    // Channel analysis
    canais: ChannelAnalysis[];
    canalDominante: {
        nome: string;
        participacao: number;
    } | null;

    // Product trends
    produtos: {
        top5: ProductTrend[];
        emAlta: ProductTrend[]; // Growing products
        emQueda: ProductTrend[]; // Declining products
    };

    // Time series (last 7-14 days for pattern detection)
    serieTemporal: DayData[];

    // Detected anomalies
    anomalias: Anomaly[];

    // Business context
    contextoNegocio: {
        melhorDiaSemana: string | null;
        piorDiaSemana: string | null;
        mediadiaria: number;
        projecaoMes: number | null;
    };
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function getDiaSemana(dateStr: string): string {
    const date = new Date(`${dateStr}T12:00:00`);
    return DIAS_SEMANA[date.getDay()] || 'Desconhecido';
}

function calculateTendency(values: number[]): 'subindo' | 'estavel' | 'caindo' | 'volatil' {
    if (values.length < 3) return 'estavel';

    let ups = 0;
    let downs = 0;

    for (let i = 1; i < values.length; i++) {
        if (values[i] > values[i - 1] * 1.05) ups++;
        else if (values[i] < values[i - 1] * 0.95) downs++;
    }

    const total = values.length - 1;
    if (ups > total * 0.6) return 'subindo';
    if (downs > total * 0.6) return 'caindo';
    if (ups > total * 0.3 && downs > total * 0.3) return 'volatil';
    return 'estavel';
}

function detectAnomalies(
    dailyData: DayData[],
    channelData: ChannelAnalysis[],
    comparativos: RichDashboardContext['comparativos']
): Anomaly[] {
    const anomalies: Anomaly[] = [];

    if (dailyData.length >= 3) {
        const values = dailyData.map(d => d.faturamento);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

        // Check last day for anomaly
        const lastDay = dailyData[dailyData.length - 1];
        const zScore = (lastDay.faturamento - mean) / (stdDev || 1);

        if (zScore > 2) {
            anomalies.push({
                tipo: 'pico',
                descricao: `${lastDay.diaSemana} (${lastDay.data}) teve faturamento ${((lastDay.faturamento / mean - 1) * 100).toFixed(0)}% acima da média`,
                impacto: 'positivo',
                valor: lastDay.faturamento,
            });
        } else if (zScore < -2) {
            anomalies.push({
                tipo: 'queda',
                descricao: `${lastDay.diaSemana} (${lastDay.data}) teve faturamento ${((1 - lastDay.faturamento / mean) * 100).toFixed(0)}% abaixo da média`,
                impacto: 'negativo',
                valor: lastDay.faturamento,
            });
        }
    }

    // Check channel concentration
    if (channelData.length > 0) {
        const topChannel = channelData[0];
        if (topChannel.participacao > 75) {
            anomalies.push({
                tipo: 'concentracao',
                descricao: `${topChannel.nome} concentra ${topChannel.participacao.toFixed(0)}% do faturamento - risco de dependência`,
                impacto: 'neutro',
                valor: topChannel.participacao,
            });
        }
    }

    // Check significant drops
    if (comparativos.vsAnterior.faturamento !== null && comparativos.vsAnterior.faturamento < -20) {
        anomalies.push({
            tipo: 'queda',
            descricao: `Faturamento caiu ${Math.abs(comparativos.vsAnterior.faturamento).toFixed(1)}% vs período anterior`,
            impacto: 'negativo',
            valor: comparativos.vsAnterior.faturamento,
        });
    }

    // Check significant growth
    if (comparativos.vsAnterior.faturamento !== null && comparativos.vsAnterior.faturamento > 25) {
        anomalies.push({
            tipo: 'pico',
            descricao: `Faturamento cresceu ${comparativos.vsAnterior.faturamento.toFixed(1)}% vs período anterior`,
            impacto: 'positivo',
            valor: comparativos.vsAnterior.faturamento,
        });
    }

    return anomalies;
}

export function buildRichDashboardContext(data: unknown): RichDashboardContext {
    if (!data || typeof data !== 'object') {
        throw new Error('Dashboard data is required');
    }

    const d = data as Record<string, unknown>;
    const current = (d.current || d.periodoAtual || {}) as Record<string, unknown>;
    const previous = (d.previous || d.periodoAnterior || {}) as Record<string, unknown>;
    const diffs = (d.diffs || {}) as Record<string, unknown>;

    // Period info
    const periodo = {
        inicio: String(current.dataInicial || ''),
        fim: String(current.dataFinal || ''),
        dias: Number(current.dias) || 1,
    };

    // Core metrics
    const metricas = {
        faturamento: Number(current.totalValor) || 0,
        faturamentoLiquido: Number(current.totalValorLiquido) || Number(current.totalValor) || 0,
        pedidos: Number(current.totalPedidos) || 0,
        ticketMedio: Number(current.ticketMedio) || 0,
        produtosVendidos: Number(current.totalProdutosVendidos) || 0,
        cancelamentos: Number(current.percentualCancelados) || 0,
        frete: Number(current.totalFreteTotal) || 0,
    };

    // Comparatives from diffs
    const faturamentoDiff = diffs.faturamento as Record<string, unknown> | undefined;
    const pedidosDiff = diffs.pedidos as Record<string, unknown> | undefined;
    const ticketDiff = diffs.ticketMedio as Record<string, unknown> | undefined;

    const comparativos: RichDashboardContext['comparativos'] = {
        vsAnterior: {
            faturamento: faturamentoDiff?.deltaPercent != null ? Number(faturamentoDiff.deltaPercent) : null,
            pedidos: pedidosDiff?.deltaPercent != null ? Number(pedidosDiff.deltaPercent) : null,
            ticket: ticketDiff?.deltaPercent != null ? Number(ticketDiff.deltaPercent) : null,
        },
        tendencia7d: 'estavel',
    };

    // Daily data
    const vendasPorDia = (current.vendasPorDia || []) as Array<Record<string, unknown>>;
    const serieTemporal: DayData[] = vendasPorDia.slice(-14).map(v => ({
        data: String(v.data || ''),
        diaSemana: getDiaSemana(String(v.data || '')),
        faturamento: Number(v.totalDia) || 0,
        pedidos: Number(v.quantidade) || 0,
    }));

    // Update tendency based on daily data
    if (serieTemporal.length >= 5) {
        const last7 = serieTemporal.slice(-7).map(d => d.faturamento);
        comparativos.tendencia7d = calculateTendency(last7);
    }

    // Channel analysis
    const canaisRaw = (d.canais || []) as Array<Record<string, unknown>>;
    const totalFaturamento = metricas.faturamento || 1;

    const canais: ChannelAnalysis[] = canaisRaw.slice(0, 6).map(c => ({
        nome: String(c.canal || 'Outros'),
        faturamento: Number(c.totalValor) || 0,
        pedidos: Number(c.totalPedidos) || 0,
        ticketMedio: (Number(c.totalValor) || 0) / (Number(c.totalPedidos) || 1),
        participacao: ((Number(c.totalValor) || 0) / totalFaturamento) * 100,
        variacao7d: null, // Would need historical data per channel
    }));

    const canalDominante = canais.length > 0
        ? { nome: canais[0].nome, participacao: canais[0].participacao }
        : null;

    // Product analysis
    const topProdutosRaw = (current.topProdutos || []) as Array<Record<string, unknown>>;
    const top5: ProductTrend[] = topProdutosRaw.slice(0, 5).map(p => ({
        nome: String(p.descricao || '').substring(0, 60),
        sku: p.sku ? String(p.sku) : undefined,
        quantidade: Number(p.quantidade) || 0,
        faturamento: Number(p.receita || p.totalValor) || 0,
        variacao: 0, // Would need historical comparison
    }));

    const produtos = {
        top5,
        emAlta: [] as ProductTrend[], // Would need historical data
        emQueda: [] as ProductTrend[], // Would need historical data
    };

    // Business context calculations
    const dailyByWeekday: Record<string, number[]> = {};
    serieTemporal.forEach(d => {
        if (!dailyByWeekday[d.diaSemana]) dailyByWeekday[d.diaSemana] = [];
        dailyByWeekday[d.diaSemana].push(d.faturamento);
    });

    const avgByWeekday = Object.entries(dailyByWeekday).map(([dia, values]) => ({
        dia,
        media: values.reduce((a, b) => a + b, 0) / values.length,
    })).sort((a, b) => b.media - a.media);

    const mediadiaria = metricas.faturamento / (periodo.dias || 1);
    const diasRestantesMes = 30 - new Date().getDate();

    const contextoNegocio = {
        melhorDiaSemana: avgByWeekday[0]?.dia || null,
        piorDiaSemana: avgByWeekday[avgByWeekday.length - 1]?.dia || null,
        mediadiaria,
        projecaoMes: metricas.faturamento + (mediadiaria * diasRestantesMes),
    };

    // Detect anomalies
    const anomalias = detectAnomalies(serieTemporal, canais, comparativos);

    return {
        periodo,
        metricas,
        comparativos,
        canais,
        canalDominante,
        produtos,
        serieTemporal: serieTemporal.slice(-7), // Keep only last 7 days for context
        anomalias,
        contextoNegocio,
    };
}

/**
 * Create a compact text summary for AI consumption
 */
export function contextToPrompt(ctx: RichDashboardContext): string {
    const lines: string[] = [];

    lines.push(`## Período: ${ctx.periodo.inicio} a ${ctx.periodo.fim} (${ctx.periodo.dias} dias)`);
    lines.push('');

    lines.push('## Métricas Principais');
    lines.push(`- Faturamento: R$ ${ctx.metricas.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    lines.push(`- Pedidos: ${ctx.metricas.pedidos}`);
    lines.push(`- Ticket Médio: R$ ${ctx.metricas.ticketMedio.toFixed(2)}`);
    lines.push(`- Produtos Vendidos: ${ctx.metricas.produtosVendidos}`);
    lines.push(`- Cancelamentos: ${ctx.metricas.cancelamentos.toFixed(1)}%`);
    lines.push('');

    lines.push('## Comparativo vs Período Anterior');
    if (ctx.comparativos.vsAnterior.faturamento !== null) {
        lines.push(`- Faturamento: ${ctx.comparativos.vsAnterior.faturamento >= 0 ? '+' : ''}${ctx.comparativos.vsAnterior.faturamento.toFixed(1)}%`);
    }
    if (ctx.comparativos.vsAnterior.pedidos !== null) {
        lines.push(`- Pedidos: ${ctx.comparativos.vsAnterior.pedidos >= 0 ? '+' : ''}${ctx.comparativos.vsAnterior.pedidos.toFixed(1)}%`);
    }
    if (ctx.comparativos.vsAnterior.ticket !== null) {
        lines.push(`- Ticket: ${ctx.comparativos.vsAnterior.ticket >= 0 ? '+' : ''}${ctx.comparativos.vsAnterior.ticket.toFixed(1)}%`);
    }
    lines.push(`- Tendência 7 dias: ${ctx.comparativos.tendencia7d}`);
    lines.push('');

    if (ctx.canais.length > 0) {
        lines.push('## Canais de Venda');
        ctx.canais.forEach(c => {
            lines.push(`- ${c.nome}: R$ ${c.faturamento.toLocaleString('pt-BR')} (${c.participacao.toFixed(1)}% do total, ${c.pedidos} pedidos)`);
        });
        lines.push('');
    }

    if (ctx.produtos.top5.length > 0) {
        lines.push('## Top 5 Produtos');
        ctx.produtos.top5.forEach((p, i) => {
            lines.push(`${i + 1}. ${p.nome}: ${p.quantidade}un, R$ ${p.faturamento.toLocaleString('pt-BR')}`);
        });
        lines.push('');
    }

    if (ctx.serieTemporal.length > 0) {
        lines.push('## Últimos Dias');
        ctx.serieTemporal.forEach(d => {
            lines.push(`- ${d.diaSemana} (${d.data}): R$ ${d.faturamento.toLocaleString('pt-BR')}, ${d.pedidos} pedidos`);
        });
        lines.push('');
    }

    if (ctx.anomalias.length > 0) {
        lines.push('## Anomalias Detectadas');
        ctx.anomalias.forEach(a => {
            lines.push(`- [${a.impacto.toUpperCase()}] ${a.descricao}`);
        });
        lines.push('');
    }

    lines.push('## Contexto de Negócio');
    if (ctx.contextoNegocio.melhorDiaSemana) {
        lines.push(`- Melhor dia: ${ctx.contextoNegocio.melhorDiaSemana}`);
    }
    if (ctx.contextoNegocio.piorDiaSemana) {
        lines.push(`- Dia mais fraco: ${ctx.contextoNegocio.piorDiaSemana}`);
    }
    lines.push(`- Média diária: R$ ${ctx.contextoNegocio.mediadiaria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    if (ctx.contextoNegocio.projecaoMes) {
        lines.push(`- Projeção do mês: R$ ${ctx.contextoNegocio.projecaoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    }

    return lines.join('\n');
}

export default buildRichDashboardContext;
