import type {
    AIAction,
    AIDataQuality,
    AIInsight,
    AIIntelligenceResponse,
    AISignal,
    AIDriver,
} from '@/lib/ai/prompts/insight-prompt';
import type { RichDashboardContext } from '@/lib/ai/rich-context-builder';

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

const numberFormatter = new Intl.NumberFormat('pt-BR');

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);
const formatCompactCurrency = (value: number) => `R$ ${compactFormatter.format(value || 0)}`;
const formatCount = (value: number) => numberFormatter.format(value || 0);

const formatPercent = (value: number | null | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const sentimentFromDelta = (value: number | null): 'positivo' | 'neutro' | 'alerta' => {
    if (typeof value !== 'number') return 'neutro';
    if (value >= 6) return 'positivo';
    if (value <= -6) return 'alerta';
    return 'neutro';
};

const impactFromDelta = (value: number | null): 'alto' | 'medio' | 'baixo' => {
    if (typeof value !== 'number') return 'medio';
    const abs = Math.abs(value);
    if (abs >= 20) return 'alto';
    if (abs >= 8) return 'medio';
    return 'baixo';
};

const toTrend = (value: number | null): 'up' | 'down' | 'stable' => {
    if (typeof value !== 'number') return 'stable';
    if (value >= 3) return 'up';
    if (value <= -3) return 'down';
    return 'stable';
};

export function buildFallbackIntelligence(ctx: RichDashboardContext): AIIntelligenceResponse {
    const faturamento = ctx.metricas.faturamento;
    const pedidos = ctx.metricas.pedidos;
    const ticket = ctx.metricas.ticketMedio;
    const cancelamentos = ctx.metricas.cancelamentos;
    const deltaFat = ctx.comparativos.vsAnterior.faturamento;
    const deltaPedidos = ctx.comparativos.vsAnterior.pedidos;
    const deltaTicket = ctx.comparativos.vsAnterior.ticket;
    const periodoDias = ctx.periodo.dias || 1;

    const sentimento = sentimentFromDelta(deltaFat);
    const headline =
        sentimento === 'positivo'
            ? 'Receita acelerando no período'
            : sentimento === 'alerta'
                ? 'Receita em queda e exige ação'
                : 'Receita estável, foco em eficiência';

    const contextoParts = [
        `${formatCompactCurrency(faturamento)} em ${periodoDias} dias`,
        `${formatCount(pedidos)} pedidos`,
        `ticket médio ${formatCurrency(ticket)}`,
    ];
    const fatVariation = formatPercent(deltaFat);
    if (fatVariation) {
        contextoParts.push(`vs período anterior ${fatVariation}`);
    }

    const sinais: AISignal[] = [
        {
            titulo: 'Faturamento',
            valor: formatCurrency(faturamento),
            variacao: formatPercent(deltaFat) ?? undefined,
            tipo: sentimento,
            confianca: 'media',
        },
        {
            titulo: 'Pedidos',
            valor: formatCount(pedidos),
            variacao: formatPercent(deltaPedidos) ?? undefined,
            tipo: sentimentFromDelta(deltaPedidos),
            confianca: 'media',
        },
        {
            titulo: 'Ticket médio',
            valor: formatCurrency(ticket),
            variacao: formatPercent(deltaTicket) ?? undefined,
            tipo: sentimentFromDelta(deltaTicket),
            confianca: 'media',
        },
    ];

    if (ctx.canalDominante) {
        sinais.push({
            titulo: 'Canal dominante',
            valor: ctx.canalDominante.nome,
            variacao: `${ctx.canalDominante.participacao.toFixed(0)}%`,
            tipo: 'neutro',
            origem: 'canal',
            confianca: 'alta',
        });
    }

    if (cancelamentos > 0) {
        sinais.push({
            titulo: 'Cancelamentos',
            valor: `${cancelamentos.toFixed(1)}%`,
            tipo: cancelamentos >= 6 ? 'alerta' : 'neutro',
            origem: 'pedido',
            confianca: 'media',
        });
    }

    const drivers: AIDriver[] = [];
    if (ctx.anomalias.length > 0) {
        ctx.anomalias.slice(0, 3).forEach((anomalia) => {
            drivers.push({
                titulo: anomalia.tipo === 'pico'
                    ? 'Pico de faturamento'
                    : anomalia.tipo === 'queda'
                        ? 'Queda de faturamento'
                        : anomalia.tipo === 'concentracao'
                            ? 'Concentração por canal'
                            : 'Mudança de tendência',
                detalhe: anomalia.descricao,
                evidencia: typeof anomalia.valor === 'number'
                    ? anomalia.tipo === 'concentracao'
                        ? `${anomalia.valor.toFixed(0)}%`
                        : formatCurrency(anomalia.valor)
                    : undefined,
                impacto: anomalia.impacto === 'positivo' ? 'alto' : anomalia.impacto === 'negativo' ? 'alto' : 'medio',
                tendencia: anomalia.tipo === 'pico' ? 'up' : anomalia.tipo === 'queda' ? 'down' : 'stable',
                origem: anomalia.tipo === 'concentracao' ? 'canal' : 'dia',
            });
        });
    }

    if (!drivers.length && typeof deltaFat === 'number') {
        drivers.push({
            titulo: deltaFat >= 0 ? 'Crescimento vs período anterior' : 'Queda vs período anterior',
            detalhe: `Variação de ${formatPercent(deltaFat) ?? '0%'} no faturamento.`,
            evidencia: formatPercent(deltaFat) ?? undefined,
            impacto: impactFromDelta(deltaFat),
            tendencia: toTrend(deltaFat),
            origem: 'mix',
        });
    }

    if (ctx.contextoNegocio.melhorDiaSemana) {
        drivers.push({
            titulo: 'Dia de maior desempenho',
            detalhe: `${ctx.contextoNegocio.melhorDiaSemana} concentra as melhores vendas.`,
            impacto: 'medio',
            tendencia: 'up',
            origem: 'dia',
        });
    }

    const actions: AIAction[] = [];
    const pushAction = (action: AIAction) => {
        if (actions.find((item) => item.titulo === action.titulo)) return;
        actions.push(action);
    };

    if (sentimento === 'alerta') {
        pushAction({
            titulo: 'Reforçar canais que sustentam receita',
            motivo: `Faturamento recuou ${formatPercent(deltaFat) ?? ''}. Priorize campanhas e mix no canal dominante.`,
            urgencia: 'hoje',
            impacto: 'alto',
            cta: 'Revisar campanhas',
            metrica: {
                valor: formatPercent(deltaFat) ?? '0%',
                label: 'variação vs anterior',
                trend: 'down',
            },
        });
    }

    if (ctx.canalDominante && ctx.canalDominante.participacao >= 65) {
        pushAction({
            titulo: 'Reduzir dependência do canal dominante',
            motivo: `${ctx.canalDominante.nome} representa ${ctx.canalDominante.participacao.toFixed(0)}% do faturamento.`,
            urgencia: 'semana',
            impacto: 'medio',
            cta: 'Distribuir campanhas',
            metrica: {
                valor: `${ctx.canalDominante.participacao.toFixed(0)}%`,
                label: 'participação',
                trend: 'stable',
            },
        });
    }

    if (cancelamentos >= 6) {
        pushAction({
            titulo: 'Reduzir cancelamentos',
            motivo: `Cancelamentos em ${cancelamentos.toFixed(1)}% estão pressionando resultado.`,
            urgencia: 'semana',
            impacto: 'medio',
            cta: 'Auditar causas',
            metrica: {
                valor: `${cancelamentos.toFixed(1)}%`,
                label: 'taxa de cancelamento',
                trend: 'down',
            },
        });
    }

    if (ctx.contextoNegocio.piorDiaSemana && ctx.contextoNegocio.melhorDiaSemana) {
        pushAction({
            titulo: 'Rebalancear promoções por dia',
            motivo: `Reforçar ${ctx.contextoNegocio.piorDiaSemana} e capturar o pico de ${ctx.contextoNegocio.melhorDiaSemana}.`,
            urgencia: 'semana',
            impacto: 'medio',
            cta: 'Planejar calendário',
        });
    }

    if (!actions.length && drivers.length) {
        pushAction({
            titulo: 'Detalhar drivers do período',
            motivo: drivers[0]?.detalhe || 'Mapear causas do desempenho atual.',
            urgencia: 'monitorar',
            impacto: 'baixo',
            cta: 'Investigar',
        });
    }

    const insights: AIInsight[] = actions.slice(0, 4).map((action, index) => ({
        tipo: action.impacto === 'alto' ? 'urgente' : action.impacto === 'medio' ? 'oportunidade' : 'alerta',
        prioridade: Math.min(5, index + 1),
        titulo: action.titulo.substring(0, 40),
        descricao: action.motivo.substring(0, 120),
        acao: {
            texto: action.cta || 'Ver detalhes',
            urgencia: action.urgencia,
        },
        metrica: action.metrica,
    }));

    const qualityAlerts: AIDataQuality['alertas'] = [];
    let hasCritical = false;
    let hasWarning = false;
    const addQualityAlert = (level: 'critico' | 'atencao', titulo: string, detalhe: string, acao?: string) => {
        if (level === 'critico') hasCritical = true;
        if (level === 'atencao') hasWarning = true;
        qualityAlerts.push({ titulo, detalhe, acao });
    };

    const serieSum = ctx.serieTemporal.reduce((sum, day) => sum + (day.faturamento || 0), 0);

    if (faturamento === 0 && pedidos === 0) {
        addQualityAlert(
            'critico',
            'Sem dados de vendas',
            'Não há faturamento nem pedidos no período.',
            'Verificar integração e filtros'
        );
    }

    if (ctx.serieTemporal.length < Math.min(4, periodoDias)) {
        addQualityAlert(
            'atencao',
            'Série temporal curta',
            'Poucos dias disponíveis para detectar tendência.',
            'Aguardar mais dados'
        );
    }

    if (faturamento > 0 && serieSum > 0 && serieSum < faturamento * 0.4) {
        addQualityAlert(
            'atencao',
            'Inconsistência entre total e série diária',
            'O total supera significativamente a soma dos dias.',
            'Validar origem dos dados'
        );
    }

    if (ctx.comparativos.vsAnterior.faturamento === null) {
        addQualityAlert(
            'atencao',
            'Comparativo incompleto',
            'Não há período anterior para comparação.',
            'Selecionar período maior'
        );
    }

    const qualidadeDados: AIDataQuality = {
        status: hasCritical ? 'critico' : hasWarning ? 'atencao' : 'ok',
        alertas: qualityAlerts.slice(0, 3),
    };

    const projecao =
        ctx.contextoNegocio.projecaoMes
            ? {
                texto: `Projeção do mês: ${formatCompactCurrency(ctx.contextoNegocio.projecaoMes)}`,
                confianca: qualidadeDados.status === 'ok' ? 'alta' : 'media',
            }
            : undefined;

    return {
        resumoExecutivo: {
            manchete: headline,
            contexto: contextoParts.join('. ') + '.',
            sentimento,
        },
        sinais: sinais.slice(0, 6),
        drivers: drivers.slice(0, 4),
        acoes: actions.slice(0, 4),
        insights,
        qualidadeDados,
        projecao: projecao as any,
        meta: {
            origem: 'fallback',
            modelo: 'local',
            confianca: qualidadeDados.status === 'ok' ? 'alta' : qualidadeDados.status === 'critico' ? 'baixa' : 'media',
        },
        generatedAt: new Date().toISOString(),
    };
}
